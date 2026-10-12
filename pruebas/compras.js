// Campañas → Cargar → Compras: pegar filas copiadas de Excel en la
// cuadrícula, validar (números, fecha, hora, código de barras científico),
// corregir a mano y guardar como cargas numeradas (COM-00001…), sin campaña.
// Abrir, corregir y eliminar cargas; lo guardado por campaña en la versión
// anterior pasa solo a ser una carga. Requiere los emuladores encendidos.
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
const T = ['ESTADO','FECHA VALIDACION','HORA VALIDACION','CORREL. / SKU','DESCRIPCION','CODIGO DE BARRAS','PESO (kg)','COSTO UNIT. (S/)','CANT. PRELIMINAR','CANT. VALIDADA','PRESENTACION','FACTOR PRESENTACION','VALIDADO POR'];
const tsv = filas=> filas.map(f=> f.map(c=> /[\t\n"]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join('\t')).join('\r\n') + '\r\n';

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  // Compras guardadas por campaña con la versión anterior
  await page.evaluate(async ()=>{
    await comprasCampanaRef.doc('REG-00045').set({ campana_correlativo:'REG-00045', campana_nombre:'CAMPAÑA 06-10', filas:1, unidades_validadas:5, costo_total:10, guardado_por:'VICTOR' });
    await comprasCampanaItemsRef.doc().set({ campana_correlativo:'REG-00045', orden:1, sku:'OLD-1', descripcion:'ANTIGUA', cant_validada:5, costo_unit:2 });
    switchTab('campanas');
  });
  const grupo = await page.evaluate(()=> [...document.querySelectorAll('#view-campanas .subgrupo')][0].innerText.replace(/\s+/g,' '));
  verificar(/CARGAR.*Campaña.*Guía.*Compras/.test(grupo), `"Compras" está en el grupo Cargar: ${grupo}`);
  await page.click('#campsub-compras');
  await page.waitForFunction(()=> document.querySelectorAll('#cmp-cargas-body tr').length === 1, null, { timeout: 15000 });
  const mig = await page.evaluate(async ()=> ({ fila: $('cmp-cargas-body').innerText.replace(/\s+/g,' '), items: (await comprasItemsRef.where('carga_correlativo','==','COM-00001').get()).size, campana: !!$('cmp-campana-select') }));
  verificar(/COM-00001 CAMPAÑA REG-00045 — CAMPAÑA 06-10/.test(mig.fila) && mig.items === 1 && !mig.campana, `Sin elegir campaña; lo guardado por campaña pasó a ser la carga COM-00001 (${mig.fila.slice(0, 60)}…)`);
  verificar(await page.textContent('#cmp-modo') === 'Carga nueva', 'Empieza como "Carga nueva"');

  const pegar = (texto, selector)=> page.evaluate(([texto, selector])=>{
    const dt = new DataTransfer(); dt.setData('text/plain', texto);
    const el = selector ? document.querySelector(selector) : $('cmp-wrap');
    if(selector) el.focus();
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [texto, selector]);
  const grilla = ()=> page.evaluate(()=> ({ filas: cmpFilas.map(f=> f.join('|')), resumen: $('cmp-resumen').innerText.replace(/\s+/g,' '),
    err: [...document.querySelectorAll('#cmp-body td.err')].map(td=> td.closest('tr').dataset.r + ':' + td.dataset.c), avisoErr: $('cmp-errores').innerText }));

  // 1. Pegar con títulos, montos en soles con miles, una descripción con salto de línea
  await pegar(tsv([T,
    ['VALIDADO','08/10/2026','14:35','06X-1919','CINTA MÉTRICA\nSUAVE 30 CM','7750000000012','0.25','S/ 12.50','1,200','1,180','PAQUETE','24','JUAN'],
    ['VALIDADO','08/10/2026','2:05 p. m.','ZJ-7193','ARBOLITO','7750000000029','1,5','3','56','56','UNIDAD','1','ANA'],
    ['PENDIENTE','','','x-10110','NOTA ADHESIVA','','','0.80','24','','','','']
  ]));
  let g = await grilla();
  verificar(g.filas.length === 3 && g.filas[0].startsWith('VALIDADO|08/10/2026|14:35|06X-1919|CINTA MÉTRICA SUAVE 30 CM|7750000000012'), 'Pega 3 filas sin la de títulos (descripción con salto de línea en una sola celda)');
  verificar(g.err.length === 0 && /3 filas/.test(g.resumen) && /1,236 unid\. validadas/.test(g.resumen) && /Costo S\/ 14,918\.00/.test(g.resumen) && /Cambios sin guardar/.test(g.resumen), `Totales: ${g.resumen}`);

  // 2. Fila con errores: no deja guardar
  await pegar(tsv([['VALIDADO','31-13-x','25 horas','','MALA','7.75E+12','1kg','abc','10','10','UND','1','LUIS']]));
  g = await grilla();
  verificar(g.err.join(',') === '3:1,3:2,3:3,3:5,3:6,3:7', `Marca en rojo fecha, hora, SKU vacío, código científico, peso y costo inválidos (${g.err.join(', ')})`);
  await page.click('#btn-cmp-guardar');
  await page.waitForTimeout(300);
  verificar(/Corrige las 6 celda\(s\) en rojo/.test(await page.textContent('#cmp-msg')) && /código de barras en formato científico/.test(g.avisoErr), `No guarda con errores: "${await page.textContent('#cmp-msg')}"`);

  // 3. Corregir pegando un bloque desde una celda y escribiendo
  await pegar(tsv([['09/10/2026','09:15','X-1917','REGLA','7750000000036','0.1','2.40']]), '#cmp-body tr[data-r="3"] td[data-c="1"]');
  await page.click('#cmp-body tr[data-r="2"] td[data-c="9"]');
  await page.keyboard.type('20');
  g = await grilla();
  verificar(g.err.length === 0 && g.filas[3] === 'VALIDADO|09/10/2026|09:15|X-1917|REGLA|7750000000036|0.1|2.40|10|10|UND|1|LUIS' && /1,266 unid\. validadas/.test(g.resumen), `Corregido pegando desde una celda y escribiendo: ${g.resumen}`);

  // 4. Guardar → carga nueva COM-00002
  await page.fill('#cmp-nota', 'compras semana 41');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! COM-00002/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const bd = await page.evaluate(async ()=>{
    const it = (await comprasItemsRef.where('carga_correlativo','==','COM-00002').get()).docs.map(d=> d.data()).sort((a,b)=> a.orden - b.orden);
    return { n: it.length, p: it[0], s3: it[2].sku, peso2: it[1].peso_kg, cab: (await comprasCargasRef.doc('COM-00002').get()).data(),
      modo: $('cmp-modo').textContent, celda: document.querySelector('#cmp-body tr[data-r="0"] td[data-c="7"]').innerText };
  });
  verificar(bd.n === 4 && bd.p.costo_unit === 12.5 && bd.p.cant_preliminar === 1200 && bd.p.codigo_barras === '7750000000012' && bd.peso2 === 1.5 && bd.s3 === 'X-10110' && bd.p.correl_sku === '06X-1919',
    'Guarda 4 filas con números convertidos (S/ 12.50 → 12.5, 1,200 → 1200, 1,5 → 1.5) y SKU en mayúsculas');
  verificar(bd.cab.filas === 4 && bd.cab.unidades_validadas === 1266 && bd.cab.costo_total === 14958 && bd.cab.nota === 'COMPRAS SEMANA 41' && bd.cab.estado === 'ACTIVO', `Carga COM-00002: ${bd.cab.filas} filas, ${bd.cab.unidades_validadas} unidades, S/ ${bd.cab.costo_total}, nota "${bd.cab.nota}"`);
  verificar(bd.modo === 'Editando COM-00002' && bd.celda === '12.5', `Tras guardar queda abierta ("${bd.modo}") mostrando lo guardado (12.5)`);
  await page.waitForFunction(()=> document.querySelectorAll('#cmp-cargas-body tr').length === 2, null, { timeout: 10000 });
  await page.locator('#campsub-panel-compras').screenshot({ path: path.join(__dirname, 'salida', 'compras.png') });

  // 5. Carga nueva → COM-00003 (no pisa COM-00002)
  await page.click('#btn-cmp-nueva');
  await pegar(tsv([['VALIDADO','10/10/2026','08:00','#7392 - SST-5','RESALTADOR','','','5','10','10','UND','50.','ANA']]));
  const d = await page.evaluate(()=> ({ th: [...document.querySelectorAll('#cmp-head th')].map(t=> t.innerText).slice(4, 6).join(' | '), sku: document.querySelector('#cmp-body tr td.deriv').innerText, err: document.querySelectorAll('#cmp-body td.err').length }));
  verificar(d.th === 'CORREL. / SKU | SKU' && d.sku === 'SST-5' && d.err === 0, `Columna SKU junto a CORREL. / SKU: "#7392 - SST-5" → ${d.sku}; factor "50." sin error`);
  await page.click('#cmp-body tr[data-r="0"] td[data-c="3"]');
  await page.keyboard.press('End'); await page.keyboard.type('X');
  verificar(await page.evaluate(()=> document.querySelector('#cmp-body tr td.deriv').innerText) === 'SST-5X', 'Al corregir CORREL. / SKU, el SKU se actualiza solo');
  await page.keyboard.press('Backspace');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! COM-00003/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const it3 = await page.evaluate(async ()=> (await comprasItemsRef.where('carga_correlativo','==','COM-00003').get()).docs[0].data());
  verificar(it3.correl_sku === '#7392 - SST-5' && it3.sku === 'SST-5' && it3.correlativo === 7392 && it3.factor_presentacion === 50, `Guardado: correl_sku "${it3.correl_sku}", sku "${it3.sku}", correlativo ${it3.correlativo}, factor ${it3.factor_presentacion}`);
  verificar(await page.evaluate(()=> document.querySelector('#cmp-body tr td[data-c="11"]').innerText) === '50', 'Tras guardar, el factor se muestra como 50');
  const lista = await page.evaluate(async ()=>{ await new Promise(r=> setTimeout(r, 500)); return [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[0].innerText + ':' + r.cells[3].innerText).join(' '); });
  verificar(lista === 'COM-00003:1 COM-00002:4 COM-00001:1', `Cada guardado nuevo es otra carga: ${lista}`);

  // 6. Abrir COM-00002, quitar una fila y guardar cambios (reemplaza, no duplica)
  await page.click('#cmp-cargas-body [data-cmp-abrir="COM-00002"]');
  await page.waitForFunction(()=> /COM-00002: 4 compra/.test($('cmp-msg').textContent), null, { timeout: 10000 });
  verificar(await page.inputValue('#cmp-nota') === 'COMPRAS SEMANA 41' && (await grilla()).filas[1].split('|')[3] === 'ZJ-7193', 'Abrir carga: trae su nota y sus filas en orden');
  await page.click('#cmp-body [data-cmp-quitar="0"]');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! COM-00002 — 3/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const n2 = await page.evaluate(async ()=> (await comprasItemsRef.where('carga_correlativo','==','COM-00002').get()).size);
  verificar(n2 === 3, `Guardar cambios reemplaza las filas de esa carga (quedan ${n2})`);

  // 7. Eliminar una carga
  await page.click('#cmp-cargas-body [data-cmp-eliminar="COM-00003"]');
  await page.waitForFunction(()=> document.querySelectorAll('#cmp-cargas-body tr').length === 2, null, { timeout: 10000 });
  const el = await page.evaluate(async ()=> ({ items: (await comprasItemsRef.where('carga_correlativo','==','COM-00003').get()).size, estado: (await comprasCargasRef.doc('COM-00003').get()).data().estado }));
  verificar(el.items === 0 && el.estado === 'ANULADO', 'Eliminar: borra sus compras y la carga queda ANULADA (el número no se reutiliza)');
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^compras_/.test(t)).sort().join(','));
  verificar(log === 'compras_carga_editada,compras_carga_eliminada,compras_carga_guardada,compras_carga_guardada', `Bitácora: ${log}`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
