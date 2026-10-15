// Cargar → Regularizaciones: guías en PDF de sobrantes y de saldos de campaña
// (misma lectura que Cargar Guía, sugiere la campaña por códigos, avisa
// duplicados) y su efecto en Reparto vs Compra: columnas SOBRANTES, SALDOS
// CAMPAÑA y SALDO FINAL = SALDO − SOBRANTES − SALDOS CAMPAÑA (los filtros
// usan el saldo final). Requiere los emuladores encendidos.
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
function guia(nro, items){
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  doc.setFontSize(12); doc.text('GUÍA DE REMISIÓN', 393, 60); doc.text(nro, 409, 125);
  doc.setFontSize(8);
  doc.text('Fecha Traslado:', 306, 200); doc.text('20/10/2026', 431, 200);
  doc.text('Punto de Partida:', 20, 213); doc.text('AV. TIENDA 1, LIMA', 110, 213);
  doc.text('Punto de Llegada:', 306, 213); doc.text('CALLE ALMACEN 890, LIMA', 431, 213);
  let y = 300; [['Ítem',24],['Código',78],['Descripción',242],['Unidad',422],['Cantidad',513]].forEach(([t,x])=> doc.text(t, x, y));
  items.forEach(([cod, cant], i)=>{ y += 13; doc.text(String(i + 1), 30, y); doc.text(cod, 78, y); doc.text('PRODUCTO ' + cod, 138, y); doc.text('NIU', 428, y); doc.text(cant.toFixed(2), 556, y); });
  doc.text('Se traslada 2 cantidad de bultos.', 23, y + 40);
  const f = path.join(__dirname, 'salida', nro + '.pdf'); fs.writeFileSync(f, Buffer.from(doc.output('arraybuffer'))); return f;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{
    const hoy = firebase.firestore.Timestamp.now();
    await campanaRegistrosRef.doc('REG-00080').set({ correlativo:'REG-00080', campana:'CAMPAÑA RGZ', estado:'ACTIVO', fecha_carga: hoy, fecha_transaccion:'2026-10-20', skus_lista:['R1','R2'], participantes_lista:['ATE'] });
    await campanaRegistrosRef.doc('REG-00081').set({ correlativo:'REG-00081', campana:'OTRA', estado:'ACTIVO', fecha_carga: hoy, skus_lista:['Z1'], participantes_lista:['ATE'] });
    for(const [sku, q] of [['R1',10],['R2',5]]) await campanaItemsRef.doc().set({ correlativo:'REG-00080', participante:'ATE', sku, producto:'P '+sku, cantidad:q });
    await comprasCargasRef.doc('COM-00001').set({ correlativo:'COM-00001', estado:'ACTIVO', campanas:['REG-00080'] });
    for(const [sku, q] of [['R1',20],['R2',8]]) await comprasTotalesRef.doc().set({ carga_correlativo:'COM-00001', sku, correl_sku:sku, cant_validada:q, costo_unit:1 });
    await cargarRegistrosCampana(true);
    switchTab('campanas');
  });
  const g = await page.evaluate(()=> [...document.querySelectorAll('#view-campanas .subgrupo')][0].innerText.replace(/\s+/g, ' '));
  verificar(/Regularizaciones/.test(g), `"Regularizaciones" está en el grupo Cargar: ${g}`);
  await page.click('#campsub-regularizaciones');

  const procesar = async (tipo, archivos)=>{
    await page.check(`input[name="rgz-tipo"][value="${tipo}"]`);
    await page.setInputFiles('#rgz-pdf-input', archivos);
    await page.click('#btn-rgz-procesar');
    await page.waitForFunction(()=> !$('btn-rgz-procesar').disabled && $('rgz-batch-wrap').style.display === 'block', null, { timeout: 30000 });
    return page.evaluate(()=> [...document.querySelectorAll('#rgz-batch-body tr')].map(r=> [r.cells[1].querySelector('select') ? r.cells[1].querySelector('select').value : '', r.cells[2].innerText, r.cells[4].innerText, r.cells[5].innerText,
      r.cells[6].querySelector('select') ? r.cells[6].querySelector('select').value : '', r.cells[7].innerText].join('|')));
  };
  let b = await procesar('SOBRANTE', [guia('TG01-00000501', [['R1', 3], ['X9', 1]])]);
  verificar(b.join() === 'SOBRANTE|TG01-00000501|2|4|REG-00080|✓ Lista para guardar', `Sobrante leído y campaña sugerida por códigos: ${b.join()}`);
  await page.click('#btn-rgz-guardar');
  await page.waitForFunction(()=> /Guardado! 1 regularización/.test($('rgz-msg').textContent), null, { timeout: 20000 });
  b = await procesar('SALDO_CAMPANA', [guia('TG01-00000502', [['R1', 2], ['R2', 1]]), guia('TG01-00000501', [['R1', 3]])]);
  verificar(/^SALDO_CAMPANA\|TG01-00000502\|2\|3\|REG-00080\|✓/.test(b[0]) && /Ya está cargada como Sobrantes \(RGZ-00001\)/.test(b[1]), `Saldo de campaña listo y el N° ya cargado se avisa como duplicado: ${b.join(' / ')}`);
  await page.click('#btn-rgz-guardar');
  await page.waitForFunction(()=> /Guardado! 1 regularización/.test($('rgz-msg').textContent) && /RGZ-00002/.test($('rgz-msg').textContent), null, { timeout: 20000 });
  await page.waitForFunction(()=> document.querySelectorAll('#rgz-lista-body tr').length === 2, null, { timeout: 10000 });
  const lista = await page.evaluate(()=> ({ filas: [...document.querySelectorAll('#rgz-lista-body tr')].map(r=> r.cells[0].innerText + ':' + r.cells[1].innerText + ':' + r.cells[6].innerText).join(' '), res: $('rgz-lista-resumen').textContent }));
  verificar(lista.filas === 'RGZ-00002:Saldos campaña:3 RGZ-00001:Sobrantes:4' && /Sobrantes 4 unid\. · Saldos campaña 3 unid\./.test(lista.res), `Lista de regularizaciones: ${lista.filas} (${lista.res})`);
  await page.locator('#campsub-panel-regularizaciones').screenshot({ path: path.join(__dirname, 'salida', 'regularizaciones.png') });

  // Reparto vs Compra
  const analizar = async ()=>{
    await page.evaluate(()=> $('campsub-repcmp').click());
    await page.waitForFunction(()=> $('rvc-campana-select').options.length > 1, null, { timeout: 10000 });
    await page.selectOption('#rvc-campana-select', 'REG-00080');
    await page.click('#btn-rvc-analizar');
    await page.waitForFunction(()=> $('rvc-resultado').style.display === 'block' && rvcDatos && rvcDatos.corr === 'REG-00080', null, { timeout: 20000 });
    return page.evaluate(()=> ({ cols: [...document.querySelectorAll('#rvc-head tr:nth-child(2) th')].map(th=> th.innerText.replace(/\s*[▲▼↕]\s*$/, '').trim()).slice(-4).join('|'),
      filas: [...document.querySelectorAll('#rvc-body tr')].map(r=> [...r.cells].slice(-5).map(c=> c.innerText.trim()).join('|') + ':' + r.cells[0].innerText),
      total: [...document.querySelectorAll('#rvc-foot td')].slice(-4).map(c=> c.innerText.trim()).join('|'), fuera: $('btn-rvc-fuera').textContent,
      neg: Number(document.querySelector('[data-rvc-filtro="neg"] b').textContent), pos: Number(document.querySelector('[data-rvc-filtro="pos"] b').textContent) }));
  };
  let r = await analizar();
  verificar(r.cols === 'SALDO|SOBRANTES|SALDOS CAMPAÑA|SALDO FINAL', `Columnas a la derecha del saldo: ${r.cols}`);
  // R1: compra 20 − reparto 10 = 10; sobrante 3, saldo campaña 2 → final 5. R2: 8 − 5 = 3; saldo campaña 1 → 2
  verificar(r.filas.join(' / ') === '10|10|3|2|5:R1 / 5|3|-|1|2:R2', `Filas (ATE|saldo|sobrantes|saldos campaña|saldo final): ${r.filas.join(' / ')}`);
  verificar(r.total === '13|3|3|7', `TOTAL: ${r.total}`);
  const val = await page.evaluate(()=> [...document.querySelectorAll('#rvc-head th.val')].map(th=> th.querySelector('b').textContent).join(' | '));
  // costo 1 en R1 y R2: valorizado = unidades
  verificar(val === 'S/ 13.00 | S/ 3.00 | S/ 3.00 | S/ 7.00', `Valorizado (costo × unidades) arriba de saldo, sobrantes, saldos campaña y saldo final: ${val}`);
  verificar(/sin reparto: 1/.test(r.fuera), `El código X9 del sobrante, que no está en el reparto, se lista aparte: "${r.fuera}"`);
  await page.locator('#rvc-tabla').screenshot({ path: path.join(__dirname, 'salida', 'regularizaciones_rvc.png') });

  // Los filtros obedecen al saldo final: con un saldo de campaña de 6 en R2, el final queda negativo
  await page.evaluate(async ()=>{ await regularizacionesRef.doc('RGZ-00099').set({ correlativo:'RGZ-00099', tipo:'SALDO_CAMPANA', campana_correlativo:'REG-00080', estado:'ACTIVO' });
    await regularizacionItemsRef.doc().set({ correlativo_reg:'RGZ-00099', tipo:'SALDO_CAMPANA', campana_correlativo:'REG-00080', codigo:'R2', cantidad:6 }); });
  r = await analizar();
  verificar(r.filas[1] === '5|3|-|7|-4:R2' && r.neg === 1 && r.pos === 1, `R2 con saldo 3 pero saldo final -4: el filtro "Saldo negativo" lo cuenta (${r.neg} negativo, ${r.pos} positivo)`);

  // Anular una regularización: deja de sumarse
  await page.evaluate(()=> $('campsub-regularizaciones').click());
  await page.waitForFunction(()=> document.querySelectorAll('#rgz-lista-body tr').length === 3, null, { timeout: 10000 });
  await page.click('#rgz-lista-body [data-rgz-anular="RGZ-00001"]');
  await page.waitForFunction(()=> document.querySelectorAll('#rgz-lista-body tr').length === 2, null, { timeout: 10000 });
  r = await analizar();
  verificar(r.filas[0] === '10|10|-|2|8:R1' && !/sin reparto: \d/.test(r.fuera), `Anulada RGZ-00001: el sobrante ya no se resta (${r.filas[0]})`);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^regularizacion_/.test(t)).sort().join(','));
  verificar(log === 'regularizacion_anulada,regularizacion_cargada,regularizacion_cargada', `Bitácora: ${log}`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
