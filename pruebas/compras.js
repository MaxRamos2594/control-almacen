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
  const tabs0 = await page.evaluate(()=> ({ visibles: [...document.querySelectorAll('#campsub-panel-compras > .panel')].filter(p=> getComputedStyle(p).display !== 'none').map(p=> p.id), activo: document.querySelector('#cmp-tabs .activo').innerText }));
  verificar(tabs0.visibles.join() === 'cmp-cargas-panel' && /Cargas guardadas\s*1/.test(tabs0.activo), `Pestañas: se ve una sección a la vez (${tabs0.visibles.join()}, "${tabs0.activo.replace(/\s+/g,' ')}")`);
  const tab = t=> page.click(`#cmp-tabs [data-cmp-tab="${t}"]`);
  await tab('detalle');

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
  verificar(bd.modo === '🔒 COM-00002 guardada' && bd.celda === '12.5', `Tras guardar queda abierta y bloqueada ("${bd.modo}") mostrando lo guardado (12.5)`);
  const bloq = await page.evaluate(()=> ({ editables: document.querySelectorAll('#cmp-body td[contenteditable]').length, quitar: document.querySelectorAll('#cmp-body [data-cmp-quitar]').length,
    guardar: getComputedStyle($('btn-cmp-guardar')).display, habilitar: getComputedStyle($('btn-cmp-habilitar')).display, fila: $('btn-cmp-fila').disabled, nota: $('cmp-nota').readOnly }));
  verificar(!bloq.editables && !bloq.quitar && bloq.guardar === 'none' && bloq.habilitar !== 'none' && bloq.fila && bloq.nota, 'Bloqueada: sin celdas editables, sin ✕, sin Guardar; aparece "✏️ Habilitar edición"');
  await pegar(tsv([['X','01/01/2026','10:00','ZZ-1','PRUEBA','','','1','1','1','U','1','A']]));
  verificar(/está guardada y bloqueada/.test(await page.textContent('#cmp-msg')) && (await grilla()).filas.length === 4, 'Pegar sobre una carga bloqueada no cambia nada y avisa');
  await tab('totales');
  const tot = await page.evaluate(async ()=> ({ panel: getComputedStyle($('cmp-tot-panel')).display, filas: document.querySelectorAll('#cmp-tot-body tr').length, estado: $('cmp-tot-estado').innerText,
    head: [...document.querySelectorAll('#cmp-tot-head th')].map(t=> t.innerText).join('|'), bd: (await comprasTotalesRef.where('carga_correlativo','==','COM-00002').get()).size,
    orden: [...document.querySelectorAll('#campsub-panel-compras > .panel')].map(p=> p.querySelector('h3').firstChild.textContent.trim().toUpperCase()).join(' > ') }));
  verificar(tot.panel === 'block' && tot.filas === 5 && tot.bd === 4 && /COM-00002 · guardado/i.test(tot.estado) && !/ESTADO|FECHA VALIDACION|HORA VALIDACION|VALIDADO POR/.test(tot.head), `Totales por SKU guardados (${tot.bd} SKU + fila TOTAL), sin estado/fecha/hora/validador`);
  verificar(/^CARGAS DE COMPRAS GUARDADAS > TOTALES POR SKU.* > DETALLE CARGADO/.test(tot.orden), `Orden: ${tot.orden}`);
  await page.waitForFunction(()=> document.querySelectorAll('#cmp-cargas-body tr').length === 2, null, { timeout: 10000 });
  const cnt = await page.evaluate(()=> ['cargas','totales','detalle'].map(t=> $('cmp-tab-n-' + t).textContent).join('/') + ' ' + $('cmp-tab-abierta').innerText);
  verificar(cnt === '2/4/4 Carga abierta: COM-00002 🔒', `Contadores en las pestañas: ${cnt}`);
  await page.locator('#campsub-panel-compras').screenshot({ path: path.join(__dirname, 'salida', 'compras.png') });

  // 5. Carga nueva → COM-00003 (no pisa COM-00002)
  await tab('cargas');
  await page.click('#btn-cmp-nueva');
  verificar(await page.evaluate(()=> getComputedStyle($('cmp-det-panel')).display !== 'none'), '"Nueva carga" lleva a la pestaña Detalle');
  await pegar(tsv([['VALIDADO','10/10/2026','08:00','#7392 - SST-5','RESALTADOR','','','5','10','10','UND','50.','ANA'], ['VALIDADO','10/10/2026','09:30','#7392 - SST-5','RESALTADOR','','','5','10','15','UND','50','LUIS']]));
  const d = await page.evaluate(()=> ({ th: [...document.querySelectorAll('#cmp-head th')].map(t=> t.innerText).slice(4, 6).join(' | '), sku: document.querySelector('#cmp-body tr td.deriv').innerText, err: document.querySelectorAll('#cmp-body td.err').length, factor: document.querySelector('#cmp-body tr td[data-c="11"]').innerText }));
  verificar(d.th === 'CORREL. / SKU | SKU' && d.sku === 'SST-5' && d.err === 0, `Columna SKU junto a CORREL. / SKU: "#7392 - SST-5" → ${d.sku}; factor "50." sin error`);
  verificar(d.factor === '50', `Apenas se pega, el factor "50." se muestra como ${d.factor} (sin esperar a guardar)`);
  await page.click('#cmp-body tr[data-r="0"] td[data-c="8"]');
  await page.keyboard.press('End'); await page.keyboard.type('.');
  await page.click('#cmp-nota');
  verificar(await page.evaluate(()=> document.querySelector('#cmp-body tr td[data-c="8"]').innerText) === '10', 'Si se escribe "10." a mano, al salir de la celda queda 10');
  await page.click('#cmp-body tr[data-r="0"] td[data-c="3"]');
  await page.keyboard.press('End'); await page.keyboard.type('X');
  verificar(await page.evaluate(()=> document.querySelector('#cmp-body tr td.deriv').innerText) === 'SST-5X', 'Al corregir CORREL. / SKU, el SKU se actualiza solo');
  await page.keyboard.press('Backspace');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! COM-00003/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const it3 = await page.evaluate(async ()=> (await comprasItemsRef.where('carga_correlativo','==','COM-00003').get()).docs[0].data());
  verificar(it3.correl_sku === '#7392 - SST-5' && it3.sku === 'SST-5' && it3.correlativo === 7392 && it3.factor_presentacion === 50, `Guardado: correl_sku "${it3.correl_sku}", sku "${it3.sku}", correlativo ${it3.correlativo}, factor ${it3.factor_presentacion}`);
  verificar(await page.evaluate(()=> document.querySelector('#cmp-body tr td[data-c="11"]').innerText) === '50', 'Tras guardar, el factor se muestra como 50');
  await tab('totales');
  const t3 = await page.evaluate(async ()=> ({ pant: [...document.querySelectorAll('#cmp-tot-body tr')].map(r=> r.innerText.replace(/\s+/g,' ').trim()), bd: (await comprasTotalesRef.where('carga_correlativo','==','COM-00003').get()).docs.map(d=> d.data()) }));
  verificar(t3.bd.length === 1 && t3.bd[0].cant_validada === 25 && t3.bd[0].filas === 2 && t3.bd[0].sku === 'SST-5' && t3.bd[0].factor_presentacion === 50 && /^1 #7392 - SST-5 SST-5 RESALTADOR 5 10 25 UND 50 2$/.test(t3.pant[0]),
    `Totales: dos validaciones de #7392 - SST-5 (10 + 15) → una fila con CANT. VALIDADA 25 ("${t3.pant[0]}")`);
  const lista = await page.evaluate(async ()=>{ await new Promise(r=> setTimeout(r, 500)); return [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[1].innerText + ':' + r.cells[6].innerText).join(' '); });
  verificar(lista === 'COM-00003:2 COM-00002:4 COM-00001:1', `Cada guardado nuevo es otra carga: ${lista}`);

  // 6. Abrir COM-00002, quitar una fila y guardar cambios (reemplaza, no duplica)
  await tab('cargas');
  await page.click('#cmp-cargas-body [data-cmp-abrir="COM-00002"]');
  await page.waitForFunction(()=> /COM-00002: 4 compra/.test($('cmp-msg').textContent), null, { timeout: 10000 });
  verificar(await page.inputValue('#cmp-nota') === 'COMPRAS SEMANA 41' && (await grilla()).filas[1].split('|')[3] === 'ZJ-7193' && await page.textContent('#cmp-modo') === '🔒 COM-00002 guardada', 'Abrir carga: trae su nota y sus filas en orden, bloqueada');
  verificar(await page.evaluate(()=> getComputedStyle($('cmp-tot-panel')).display !== 'none'), '"Abrir" lleva a la pestaña Totales por SKU');
  await tab('detalle');
  await page.click('#btn-cmp-habilitar');
  verificar(await page.textContent('#cmp-modo') === '✏️ Editando COM-00002' && await page.evaluate(()=> document.querySelectorAll('#cmp-body td[contenteditable]').length === 52), '"✏️ Habilitar edición" vuelve editable la carga');
  await page.click('#cmp-body [data-cmp-quitar="0"]');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! COM-00002 — 3/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const n2 = await page.evaluate(async ()=> (await comprasItemsRef.where('carga_correlativo','==','COM-00002').get()).size);
  verificar(n2 === 3 && await page.textContent('#cmp-modo') === '🔒 COM-00002 guardada', `Guardar cambios reemplaza las filas de esa carga (quedan ${n2}) y se vuelve a bloquear`);

  // 7. Eliminar una carga
  await tab('cargas');
  await page.click('#cmp-cargas-body [data-cmp-eliminar="COM-00003"]');
  await page.waitForFunction(()=> document.querySelectorAll('#cmp-cargas-body tr').length === 2, null, { timeout: 10000 });
  const el = await page.evaluate(async ()=> ({ items: (await comprasItemsRef.where('carga_correlativo','==','COM-00003').get()).size, estado: (await comprasCargasRef.doc('COM-00003').get()).data().estado }));
  verificar(el.items === 0 && el.estado === 'ANULADO', 'Eliminar: borra sus compras y la carga queda ANULADA (el número no se reutiliza)');
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^compras_/.test(t)).sort().join(','));
  verificar(log === 'compras_carga_editada,compras_carga_eliminada,compras_carga_guardada,compras_carga_guardada', `Bitácora: ${log}`);
  const totEl = await page.evaluate(async ()=> (await comprasTotalesRef.where('carga_correlativo','==','COM-00003').get()).size);
  verificar(totEl === 0, 'Eliminar también borra sus totales');

  // 8. Detalle paginado de 20 en 20; con un error en otra página, Guardar lleva a esa página
  await page.click('#btn-cmp-nueva');
  const muchas = Array.from({ length: 45 }, (_, i)=> ['VALIDADO','11/10/2026','10:00','#' + (500 + i) + ' - P-' + i, 'PRODUCTO ' + i, i === 3 ? 'ME399' : i === 4 ? 'HS136' : '', '0.1', '1', '5', i === 24 ? 'abc' : '5', 'UND', '1', 'ANA']);
  await pegar(tsv(muchas));
  let pg = await page.evaluate(()=> ({ filas: document.querySelectorAll('#cmp-body tr').length, pager: $('cmp-pag').innerText.replace(/\s+/g,' ') }));
  verificar(pg.filas === 20 && /1–20 de 45/.test(pg.pager) && /Página 1 de 3/.test(pg.pager), `Detalle de 20 en 20: ${pg.pager}`);
  const barras = await page.evaluate(()=> [3, 4].map(r=> document.querySelector(`#cmp-body tr[data-r="${r}"] td[data-c="5"]`)).map(td=> td.innerText + ':' + td.classList.contains('err')).join(' '));
  verificar(barras === 'ME399:false HS136:false', `Códigos de barras alfanuméricos pasan sin error (${barras})`);
  await page.click('#cmp-pag [data-cmp-pag="2"]');
  pg = await page.evaluate(()=> ({ filas: [...document.querySelectorAll('#cmp-body tr')].map(r=> r.cells[0].innerText).join(','), pager: $('cmp-pag').innerText }));
  verificar(pg.filas === '41,42,43,44,45' && /Página 3 de 3/.test(pg.pager), `Última página: filas ${pg.filas}`);
  await page.click('#btn-cmp-guardar');
  await page.waitForTimeout(300);
  pg = await page.evaluate(()=> ({ pagina: /Página 2 de 3/.test($('cmp-pag').innerText), foco: document.activeElement && document.activeElement.closest('tr') && document.activeElement.closest('tr').dataset.r }));
  verificar(pg.pagina && pg.foco === '24', 'Con un error en la fila 25, "Guardar" lleva a la página 2 y a esa celda');
  await page.keyboard.press('Control+A'); await page.keyboard.type('5');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! COM-00004 — 45/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  await tab('totales');
  const tp = await page.evaluate(()=> ({ filas: document.querySelectorAll('#cmp-tot-body tr').length, pager: $('cmp-tot-pag').innerText.replace(/\s+/g,' ') }));
  verificar(tp.filas === 21 && /1–20 de 45/.test(tp.pager), `Totales también de 20 en 20 (+ fila TOTAL): ${tp.pager}`);
  await tab('cargas');

  // 8b. "Nueva carga" está en el panel de cargas guardadas y la lista no parpadea al volver a Compras
  const ubic = await page.evaluate(()=> ({ panel: $('btn-cmp-nueva').closest('.panel').id, texto: $('btn-cmp-nueva').innerText }));
  verificar(ubic.panel === 'cmp-cargas-panel' && /🛒/.test(ubic.texto) && /Nueva carga/.test(ubic.texto), `"Nueva carga" con ícono en "Cargas de compras guardadas" (${ubic.texto})`);
  await page.click('#campsub-cargar-guia');
  await page.evaluate(()=>{ window.__mut = 0; window.__vacio = false; const b = $('cmp-cargas-body');
    new MutationObserver(()=>{ window.__mut++; if(!b.children.length || getComputedStyle($('cmp-cargas-vacio')).display !== 'none') window.__vacio = true; }).observe(b, { childList: true }); });
  await page.click('#campsub-compras');
  await page.waitForTimeout(1500);
  const fl = await page.evaluate(()=> ({ mut: window.__mut, vacio: window.__vacio, anim: getComputedStyle(document.querySelector('#cmp-cargas-body tr')).animationName, filas: document.querySelectorAll('#cmp-cargas-body tr').length }));
  verificar(fl.mut <= 1 && !fl.vacio && fl.anim === 'none' && fl.filas > 0, `Al volver de Guía a Compras la lista no parpadea (${fl.mut} redibujo, sin animación ni lista vacía)`);

  // 9. Lista de cargas de 5 en 5, las últimas primero
  await page.evaluate(async ()=>{
    for(const c of ['COM-00010','COM-00011','COM-00012']) await comprasCargasRef.doc(c).set({ correlativo:c, nota:'X', filas:1, unidades_validadas:1, costo_total:1, estado:'ACTIVO' });
    await cargarListaCompras();
  });
  let cl = await page.evaluate(()=> ({ filas: [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[1].innerText).join(','), pager: $('cmp-cargas-pag').innerText.replace(/\s+/g,' ') }));
  verificar(cl.filas === 'COM-00012,COM-00011,COM-00010,COM-00004,COM-00002' && /1–5 de 6/.test(cl.pager), `Cargas de 5 en 5, las últimas primero: ${cl.filas} (${cl.pager})`);
  await page.click('#cmp-cargas-pag [data-cmp-cargas-pag="1"]');
  cl = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[1].innerText).join(','));
  verificar(cl === 'COM-00001', `Página 2 de cargas: ${cl}`);

  // 10. Columnas separadas y orden por columna
  const cab = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-head th')].map(t=> t.innerText.replace(/\s*[▲▼↕]\s*$/, '')).join('|'));
  verificar(cab === '|CARGA|NOTA|CAMPAÑA(S)|FECHA Y HORA|USUARIO|FILAS|UNID. VALIDADAS|COSTO (S/)|', `Fecha y hora y Usuario en columnas separadas: ${cab}`);
  const usuario = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')][0].cells[5].innerText);
  verificar(usuario === 'VICTOR', `Columna Usuario con quien guardó la carga: "${usuario}"`);
  const anchos = ()=> page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-head th')].map(t=> Math.round(t.getBoundingClientRect().width)).join(','));
  const anchosAntes = await anchos();
  await page.click('#cmp-cargas-head [data-cmp-orden="filas"]');
  let ord = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[1].innerText + ':' + r.cells[6].innerText).join(' '));
  verificar(/^COM-00004:45 COM-00002:3 /.test(ord) && /▼/.test(await page.textContent('#cmp-cargas-head [data-cmp-orden="filas"]')), `Clic en "Filas": de mayor a menor (${ord})`);
  await page.click('#cmp-cargas-head [data-cmp-orden="filas"]');
  ord = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[6].innerText).join(','));
  verificar(ord.split(',')[0] === '1' && /▲/.test(await page.textContent('#cmp-cargas-head [data-cmp-orden="filas"]')), `Otro clic: de menor a mayor (${ord})`);
  await page.click('#cmp-cargas-head [data-cmp-orden="nota"]');
  ord = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[2].innerText).join(','));
  const notas = ord.split(',').map(n=> n === '—' ? '' : n);
  verificar(notas.every((n, i)=> !i || notas[i-1].localeCompare(n) <= 0), `Clic en "Nota": orden alfabético, sin nota primero (${ord})`);
  const anchosOrden = await anchos();
  await page.click('#cmp-cargas-pag [data-cmp-cargas-pag="1"]');
  const anchosPag = await anchos();
  verificar(anchosOrden === anchosAntes && anchosPag === anchosAntes, `Las columnas mantienen su ancho al ordenar y al cambiar de página (${anchosAntes})`);

  // 11. Asignar campaña a varias cargas (y una carga a varias campañas)
  await page.evaluate(async ()=>{
    const hoy = firebase.firestore.Timestamp.now();
    await campanaRegistrosRef.doc('REG-00050').set({ correlativo:'REG-00050', campana:'CAMPAÑA 14-10', estado:'ACTIVO', fecha_carga: hoy });
    await campanaRegistrosRef.doc('REG-00051').set({ correlativo:'REG-00051', campana:'CAMPAÑA 15-10', estado:'ACTIVO', fecha_carga: hoy });
    await cargarRegistrosCampana(true);
    cmpCargasOrden = { k:'correlativo', dir:-1 }; cmpCargasPag = 0;
    await cargarListaCompras(); renderListaCompras();
  });
  const visibles = ()=> page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')].map(r=> r.cells[1].innerText).join(','));
  const ver = f=> page.click(`#cmp-grupos [data-cmp-filtro="${f}"]`);
  const asignar = async (cargas, camp, rapido)=>{
    for(const c of cargas) await page.check(`#cmp-cargas-body [data-cmp-sel="${c}"]`);
    const barra = await page.evaluate(()=> getComputedStyle($('cmp-asignar')).display !== 'none' ? $('cmp-sel-cuenta').innerText + ' ' + [...$('cmp-sel-n').children].map(x=> x.innerText).join(',') + ' · ' + $('btn-cmp-asignar').disabled : '');
    if(rapido) await page.click(`#cmp-asig-recientes [data-cmp-asig-pick="${camp}"]`);
    else await page.selectOption('#cmp-asignar-camp', camp);
    const boton = await page.textContent('#btn-cmp-asignar');
    if(boton !== `🔗 Asignar ${cargas.length} a ${camp}`) verificar(false, `Botón: "${boton}"`);
    await page.click('#btn-cmp-asignar');
    await page.waitForFunction(([cargas, camp])=> /asignada/.test($('cmp-msg').textContent) && cargas.every(c=> (cmpCargas.find(x=> x.correlativo === c).campanas || []).includes(camp)), [cargas, camp], { timeout: 10000 });
    await page.waitForTimeout(400);
    return barra;
  };
  let barra = await asignar(['COM-00012','COM-00011'], 'REG-00050', true);
  verificar(barra === '2 COM-00011,COM-00012 · true', `Al marcar cargas aparece la barra (botón desactivado hasta elegir campaña) y se asigna con el acceso rápido: "${barra}"`);
  await asignar(['COM-00011','COM-00010'], 'REG-00051');
  const bdc = await page.evaluate(async ()=> (await comprasCargasRef.get()).docs.map(d=> d.data()).filter(c=> (c.campanas||[]).length).map(c=> c.correlativo + ':' + c.campanas.slice().sort().join('+')).sort().join(' '));
  verificar(bdc === 'COM-00010:REG-00051 COM-00011:REG-00050+REG-00051 COM-00012:REG-00050', `Guardado: varias cargas por campaña y una carga en dos campañas (${bdc})`);
  const chips = await page.evaluate(()=> [...document.querySelectorAll('#cmp-cargas-body tr')].find(r=> r.cells[1].innerText === 'COM-00011').cells[3].innerText.replace(/[✕\s]+/g, ' ').trim());
  verificar(chips === 'REG-00050 REG-00051', `Columna Campaña(s) de COM-00011: ${chips}`);
  await ver('REG-00050');
  let v = await visibles();
  const res = await page.evaluate(()=> $('cmp-camp-resumen').innerText.replace(/\s+/g, ' ').trim());
  verificar(v === 'COM-00012,COM-00011' && /^REG-00050 CAMPAÑA 14-10 2 CARGAS 2 UNID\. VALIDADAS S\/ 2\.00 COSTO$/i.test(res), `Ver REG-00050: ${v} · "${res}"`);
  await ver('REG-00051');
  v = await visibles();
  verificar(v === 'COM-00011,COM-00010', `Ver REG-00051: ${v}`);
  await ver('__SIN');
  v = await visibles();
  verificar(v === 'COM-00004,COM-00002,COM-00001', `Ver "Sin campaña": ${v}`);
  await page.check('#cmp-sel-todas');
  const todas = await page.evaluate(()=> $('cmp-sel-cuenta').textContent + ' · ' + document.querySelectorAll('#cmp-cargas-body tr.cmp-marcada').length);
  verificar(todas === '3 · 3', `Marcar todas: 3 seleccionadas y resaltadas (${todas})`);
  const grupos = await page.evaluate(()=> [...document.querySelectorAll('#cmp-grupos .cmp-grupo')].map(g=> g.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
  verificar(/^🛒 TODAS 6 CARGA\(S\) \| ◌ SIN CAMPAÑA 3 CARGA\(S\) \| REG-00051 CAMPAÑA 15-10 2 CARGA\(S\) · S\/ [\d.,]+ \| REG-00050 CAMPAÑA 14-10 2 CARGA\(S\)/i.test(grupos), `Tarjetas por campaña: ${grupos}`);
  await page.click('#cmp-asig-recientes [data-cmp-asig-pick="REG-00051"]');
  await page.waitForTimeout(500);
  await page.locator('#cmp-cargas-panel').screenshot({ path: require('path').join(__dirname, 'salida', 'compras_asignar.png') });
  await page.click('#btn-cmp-sel-limpiar');
  await ver('REG-00050');
  await page.click('#cmp-cargas-body [data-cmp-carga="COM-00011"][data-cmp-quitar-camp="REG-00050"]');
  await page.waitForFunction(()=> !(cmpCargas.find(x=> x.correlativo === 'COM-00011').campanas || []).includes('REG-00050'), null, { timeout: 10000 });
  await page.waitForTimeout(400);
  v = await visibles();
  const quedan = await page.evaluate(async ()=> (await comprasCargasRef.doc('COM-00011').get()).data().campanas.join(','));
  verificar(v === 'COM-00012' && quedan === 'REG-00051', `✕ quita COM-00011 de REG-00050 (sigue en ${quedan}); REG-00050 muestra ${v}`);
  const anchosCamp = await anchos();
  verificar(anchosCamp === anchosAntes, `Las columnas mantienen su ancho al filtrar por campaña (${anchosCamp})`);
  await page.locator('#cmp-cargas-panel').screenshot({ path: require('path').join(__dirname, 'salida', 'compras_campanas.png') });

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
