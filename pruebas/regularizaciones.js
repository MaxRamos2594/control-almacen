// Cargar → Regularizaciones: devolución de venta virtual y saldos de campaña con
// guías en PDF (como Cargar Guía) y merma pegada desde Excel (como Compras), y su
// efecto en Reparto vs Compra: SALDO FINAL = SALDO + DEV. VENTA VIRTUAL − MERMA −
// SALDOS CAMPAÑA (los filtros usan el saldo final). Requiere los emuladores encendidos.
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
  const zona = ()=> page.evaluate(()=> getComputedStyle($('rgz-merma-zona')).display + '/' + getComputedStyle($('rgz-pdf-zona')).display);
  verificar(await zona() === 'block/none', 'Merma (por defecto) muestra la cuadrícula para pegar, no la carga de PDF');
  let b = await procesar('SALDO_CAMPANA', [guia('TG01-00000501', [['R1', 2], ['R2', 1]])]);
  verificar(await zona() === 'none/flex' && b.join() === 'SALDO_CAMPANA|TG01-00000501|2|3|REG-00080|✓ Lista para guardar', `Saldos campaña con guía en PDF y campaña sugerida: ${b.join()}`);
  await page.click('#btn-rgz-guardar');
  await page.waitForFunction(()=> /RGZ-00001/.test($('rgz-msg').textContent), null, { timeout: 20000 });
  b = await procesar('DEVOLUCION_VV', [guia('TG01-00000502', [['R1', 4]]), guia('TG01-00000501', [['R1', 3]])]);
  verificar(/^DEVOLUCION_VV\|TG01-00000502\|1\|4\|REG-00080\|✓/.test(b[0]) && /Ya está cargada como Saldos campaña \(RGZ-00001\)/.test(b[1]), `Devolución de venta virtual y aviso de duplicado: ${b.join(' / ')}`);
  await page.click('#btn-rgz-guardar');
  await page.waitForFunction(()=> /RGZ-00002/.test($('rgz-msg').textContent), null, { timeout: 20000 });

  // Merma: pegar desde Excel (SKU · DESCRIPCION · CANTIDAD · PARTICIPANTE)
  await page.check('input[name="rgz-tipo"][value="MERMA"]');
  await page.selectOption('#rgz-merma-camp', 'REG-00080');
  await page.evaluate((t)=>{ const dt = new DataTransfer(); dt.setData('text/plain', t); $('rgz-merma-wrap').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); },
    'SKU\tDESCRIPCION\tCANTIDAD\tPARTICIPANTE\r\nr1\tProd uno\t3\tate\r\nR2\tProd dos\tabc\tATE\r\nX9\tOtro\t1\tATE\r\nR2\tProd dos\t1\tPIURA\r\n');
  let m = await page.evaluate(()=> ({ filas: rgzMerma.length, err: [...document.querySelectorAll('#rgz-merma-body td.err')].map(td=> td.closest('tr').dataset.r + ':' + td.dataset.c + ' ' + td.title),
    aviso: [...document.querySelectorAll('#rgz-merma-body td.aviso')].map(td=> td.closest('tr').dataset.r + ':' + td.title) }));
  verificar(m.filas === 4 && m.err.join(' | ') === '1:2 la cantidad no es un número | 3:3 PIURA no es participante de REG-00080' && m.aviso.join() === '2:Este SKU no está en el reparto de la campaña',
    `Pega 4 filas sin la de títulos; en rojo la cantidad inválida y la tienda que no es de la campaña; aviso para el SKU fuera del reparto (${m.err.join(' | ')})`);
  await page.locator('#campsub-panel-regularizaciones .panel').first().screenshot({ path: path.join(__dirname, 'salida', 'regularizaciones_merma.png') });
  await page.click('#btn-rgz-merma-guardar');
  await page.waitForTimeout(300);
  verificar(/Corrige las 2 celda/.test(await page.textContent('#rgz-msg')), 'Con errores no guarda');
  await page.click('#rgz-merma-body tr[data-r="1"] td[data-c="2"]');
  await page.keyboard.press('Control+A'); await page.keyboard.type('2');
  await page.click('#rgz-merma-body [data-rgz-merma-quitar="3"]');
  await page.click('#btn-rgz-merma-guardar');
  await page.waitForFunction(()=> /RGZ-00003 — merma de REG-00080: 3 fila/.test($('rgz-msg').textContent), null, { timeout: 20000 });
  const mb = await page.evaluate(async ()=> ({ cab: (await regularizacionesRef.doc('RGZ-00003').get()).data(),
    items: (await regularizacionItemsRef.where('correlativo_reg','==','RGZ-00003').get()).docs.map(d=> d.data()).map(i=> `${i.codigo}:${i.cantidad}:${i.participante}`).sort().join(' ') }));
  verificar(mb.cab.tipo === 'MERMA' && mb.cab.unidades === 6 && mb.items === 'R1:3:ATE R2:2:ATE X9:1:ATE', `Merma guardada como RGZ-00003 (${mb.items}); la tienda se guarda con el nombre de la campaña`);
  await page.waitForFunction(()=> document.querySelectorAll('#rgz-lista-body tr').length === 3, null, { timeout: 10000 });
  const lista = await page.evaluate(()=> ({ filas: [...document.querySelectorAll('#rgz-lista-body tr')].map(r=> r.cells[0].innerText + ':' + (r.cells[1].querySelector('select') ? r.cells[1].querySelector('select').selectedOptions[0].text : r.cells[1].innerText) + ':' + r.cells[6].innerText).join(' '), res: $('rgz-lista-resumen').textContent }));
  verificar(lista.filas === 'RGZ-00003:Merma:6 RGZ-00002:Devolución venta virtual:4 RGZ-00001:Saldos campaña:3' && /Devolución venta virtual 4 unid\. · Merma 6 unid\. · Saldos campaña 3 unid\./.test(lista.res), `Lista: ${lista.filas} (${lista.res})`);
  await page.locator('#campsub-panel-regularizaciones').screenshot({ path: path.join(__dirname, 'salida', 'regularizaciones.png') });

  // Reparto vs Compra
  const analizar = async ()=>{
    await page.evaluate(()=> $('campsub-repcmp').click());
    await page.waitForFunction(()=> $('rvc-campana-select').options.length > 1, null, { timeout: 10000 });
    await page.selectOption('#rvc-campana-select', 'REG-00080');
    await page.click('#btn-rvc-analizar');
    await page.waitForFunction(()=> $('rvc-resultado').style.display === 'block' && rvcDatos && rvcDatos.corr === 'REG-00080', null, { timeout: 20000 });
    return page.evaluate(()=> ({ cols: [...document.querySelectorAll('#rvc-head tr:nth-child(2) th')].map(th=> th.innerText.replace(/\s*[▲▼↕]\s*$/, '').trim()).slice(-5).join('|'),
      filas: [...document.querySelectorAll('#rvc-body tr')].map(r=> [...r.cells].slice(-5).map(c=> c.innerText.trim()).join('|') + ':' + r.cells[0].innerText),
      total: [...document.querySelectorAll('#rvc-foot td')].slice(-5).map(c=> c.innerText.trim()).join('|'), fuera: $('btn-rvc-fuera').textContent,
      neg: Number(document.querySelector('[data-rvc-filtro="neg"] b').textContent), pos: Number(document.querySelector('[data-rvc-filtro="pos"] b').textContent) }));
  };
  let r = await analizar();
  verificar(r.cols === 'SALDO|DEV. VENTA VIRTUAL|MERMA|SALDOS CAMPAÑA|SALDO FINAL', `Columnas: ${r.cols}`);
  // R1: 20 − 10 = 10; + dev. 4 − merma 3 − saldo campaña 2 → 9. R2: 8 − 5 = 3; − merma 2 − saldo campaña 1 → 0
  verificar(r.filas.join(' / ') === '10|4|3|2|9:R1 / 3|-|2|1|-:R2', `Filas (saldo|dev. venta virtual|merma|saldos campaña|saldo final): ${r.filas.join(' / ')}`);
  verificar(r.total === '13|4|5|3|9', `TOTAL: ${r.total}`);
  const colores = await page.evaluate(()=> ['rgz-dvv','rgz-sob'].map(c=> getComputedStyle(document.querySelector('#rvc-body td.' + c)).backgroundColor).join(' '));
  verificar(colores === 'rgb(19, 160, 80) rgb(227, 22, 140)', `Devolución en verde intenso y merma en fucsia (${colores})`);
  const val = await page.evaluate(()=> [...document.querySelectorAll('#rvc-head th.val')].map(th=> th.querySelector('b').textContent).join(' | '));
  verificar(val === 'S/ 13.00 | S/ 4.00 | S/ 5.00 | S/ 3.00 | S/ 9.00', `Valorizado: ${val}`);
  verificar(!/sin reparto: \d/.test(r.fuera), `Los códigos de regularizaciones (X9) no van a "Códigos de guía sin reparto": "${r.fuera}"`);
  await page.locator('#rvc-tabla').screenshot({ path: path.join(__dirname, 'salida', 'regularizaciones_rvc.png') });

  // Los filtros obedecen al saldo final
  await page.evaluate(async ()=>{ await regularizacionesRef.doc('RGZ-00099').set({ correlativo:'RGZ-00099', tipo:'SALDO_CAMPANA', campana_correlativo:'REG-00080', estado:'ACTIVO' });
    await regularizacionItemsRef.doc().set({ correlativo_reg:'RGZ-00099', tipo:'SALDO_CAMPANA', campana_correlativo:'REG-00080', codigo:'R2', cantidad:6 }); });
  r = await analizar();
  verificar(r.filas[1] === '3|-|2|7|-6:R2' && r.neg === 1 && r.pos === 1, `R2 con saldo 3 pero saldo final -6: "Saldo negativo" lo cuenta (${r.neg} negativo, ${r.pos} positivo)`);

  // Cambiar el concepto de una regularización guardada
  await page.evaluate(()=> $('campsub-regularizaciones').click());
  await page.waitForFunction(()=> document.querySelectorAll('#rgz-lista-body tr').length === 4, null, { timeout: 10000 });
  await page.selectOption('#rgz-lista-body [data-rgz-cambiar="RGZ-00001"]', 'MERMA');
  await page.waitForFunction(async ()=> (await regularizacionesRef.doc('RGZ-00001').get()).data().tipo === 'MERMA', null, { timeout: 10000 });
  r = await analizar();
  verificar(r.filas.join(' / ') === '10|4|5|-|9:R1 / 3|-|3|6|-6:R2', `Cambiar RGZ-00001 de Saldos campaña a Merma: pasa a la columna Merma (${r.filas.join(' / ')})`);
  await page.evaluate(()=> $('campsub-regularizaciones').click());
  await page.waitForFunction(()=> document.querySelectorAll('#rgz-lista-body tr').length === 4, null, { timeout: 10000 });
  await page.selectOption('#rgz-lista-body [data-rgz-cambiar="RGZ-00001"]', 'SALDO_CAMPANA');
  await page.waitForFunction(async ()=> (await regularizacionesRef.doc('RGZ-00001').get()).data().tipo === 'SALDO_CAMPANA', null, { timeout: 10000 });

  // Lo cargado antes como "Sobrantes" cuenta como Merma
  await page.evaluate(async ()=>{ await regularizacionesRef.doc('RGZ-00098').set({ correlativo:'RGZ-00098', tipo:'SOBRANTE', campana_correlativo:'REG-00080', estado:'ACTIVO', unidades:1 });
    await regularizacionItemsRef.doc().set({ correlativo_reg:'RGZ-00098', tipo:'SOBRANTE', campana_correlativo:'REG-00080', codigo:'R1', cantidad:1 }); await cargarListaRegularizaciones(); });
  const viejo = await page.evaluate(()=> { const sel = document.querySelector('#rgz-lista-body [data-rgz-cambiar="RGZ-00098"]'); return sel.selectedOptions[0].text; });
  verificar(viejo === 'Merma', `Una regularización antigua de "Sobrantes" se muestra como ${viejo}`);
  // Anular la merma pegada: deja de restarse (queda solo la antigua de 1)
  await page.click('#rgz-lista-body [data-rgz-anular="RGZ-00003"]');
  await page.waitForFunction(()=> !document.querySelector('#rgz-lista-body [data-rgz-anular="RGZ-00003"]'), null, { timeout: 10000 });
  r = await analizar();
  verificar(r.filas[0] === '10|4|1|2|11:R1', `Anulada RGZ-00003: en R1 queda solo la merma antigua (${r.filas[0]})`);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^regularizacion_/.test(t)).sort().join(','));
  verificar(log === 'regularizacion_anulada,regularizacion_cargada,regularizacion_cargada,regularizacion_cargada,regularizacion_concepto_cambiado,regularizacion_concepto_cambiado', `Bitácora: ${log}`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
