// Campañas → Cargar → Compras: pegar filas copiadas de Excel en la
// cuadrícula, validar (números, fecha, hora, código de barras científico),
// corregir a mano, guardar por campaña, volver a cargarlas y reemplazarlas.
// Requiere los emuladores encendidos (npm run emuladores).
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
  await page.evaluate(async ()=>{
    const hoy = firebase.firestore.Timestamp.now();
    for(const c of ['REG-00001','REG-00002']) await campanaRegistrosRef.doc(c).set({ correlativo:c, campana:'CAMPAÑA '+c, estado:'ACTIVO', fecha_carga: hoy, fecha_transaccion:'2026-10-08' });
    await cargarRegistrosCampana(true);
    switchTab('campanas');
  });
  const grupo = await page.evaluate(()=> [...document.querySelectorAll('#view-campanas .subgrupo')][0].innerText.replace(/\s+/g,' '));
  verificar(/CARGAR.*Campaña.*Guía.*Compras/.test(grupo), `"Compras" está en el grupo Cargar: ${grupo}`);
  await page.click('#campsub-compras');
  await page.waitForFunction(()=> $('cmp-campana-select').options.length > 2, null, { timeout: 10000 });
  await page.selectOption('#cmp-campana-select', 'REG-00001');
  await page.waitForFunction(()=> /aún no tiene compras/.test($('cmp-msg').textContent), null, { timeout: 10000 });

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
  verificar(g.filas.length === 3 && g.filas[0].startsWith('VALIDADO|08/10/2026|14:35|06X-1919|CINTA MÉTRICA SUAVE 30 CM|7750000000012'), `Pega 3 filas sin la de títulos (descripción con salto de línea en una sola celda)`);
  verificar(g.err.length === 0 && /3 filas/.test(g.resumen) && /1,236 unid\. validadas/.test(g.resumen) && /Costo S\/ 14,918\.00/.test(g.resumen) && /Cambios sin guardar/.test(g.resumen), `Totales: ${g.resumen}`);

  // 2. Fila con errores: no deja guardar
  await pegar(tsv([['VALIDADO','31-13-x','25 horas','','MALA','7.75E+12','1kg','abc','10','10','UND','1','LUIS']]));
  g = await grilla();
  verificar(g.err.join(',') === '3:1,3:2,3:3,3:5,3:6,3:7', `Marca en rojo fecha, hora, SKU vacío, código científico, peso y costo inválidos (${g.err.join(', ')})`);
  await page.click('#btn-cmp-guardar');
  await page.waitForTimeout(300);
  verificar(/Corrige las 6 celda\(s\) en rojo/.test(await page.textContent('#cmp-msg')) && /código de barras en formato científico/.test(g.avisoErr), `No guarda con errores: "${await page.textContent('#cmp-msg')}"`);

  // 3. Corregir a mano (escribiendo) y pegando un bloque desde una celda
  await pegar(tsv([['09/10/2026','09:15','X-1917','REGLA','7750000000036','0.1','2.40']]), '#cmp-body tr[data-r="3"] td[data-c="1"]');
  g = await grilla();
  verificar(g.err.length === 0 && g.filas[3] === 'VALIDADO|09/10/2026|09:15|X-1917|REGLA|7750000000036|0.1|2.40|10|10|UND|1|LUIS', `Pegar un bloque desde una celda reemplaza esas celdas: ${g.filas[3]}`);
  await page.click('#cmp-body tr[data-r="2"] td[data-c="9"]');
  await page.keyboard.type('20');
  g = await grilla();
  verificar(g.filas[2].split('|')[9] === '20' && /1,266 unid\. validadas/.test(g.resumen), `Escribir en una celda actualiza los totales: ${g.resumen}`);

  // 4. Guardar
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado!/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const bd = await page.evaluate(async ()=>{
    const it = (await comprasCampanaItemsRef.where('campana_correlativo','==','REG-00001').get()).docs.map(d=> d.data()).sort((a,b)=> a.orden - b.orden);
    const cab = (await comprasCampanaRef.doc('REG-00001').get()).data();
    return { n: it.length, p: it[0], s3: it[2].sku, peso2: it[1].peso_kg, cab };
  });
  verificar(bd.n === 4 && bd.p.costo_unit === 12.5 && bd.p.cant_preliminar === 1200 && bd.p.cant_validada === 1180 && bd.p.codigo_barras === '7750000000012' && bd.peso2 === 1.5 && bd.s3 === 'X-10110',
    `Guarda 4 filas con números convertidos (S/ 12.50 → 12.5, 1,200 → 1200, 1,5 → 1.5) y SKU en mayúsculas`);
  verificar(bd.cab.filas === 4 && bd.cab.unidades_validadas === 1266 && bd.cab.costo_total === 14958 && bd.cab.campana_nombre === 'CAMPAÑA REG-00001', `Cabecera: ${bd.cab.filas} filas, ${bd.cab.unidades_validadas} unidades, S/ ${bd.cab.costo_total}`);
  await page.locator('#campsub-panel-compras').screenshot({ path: path.join(__dirname, 'salida', 'compras.png') });

  // 5. Otra campaña y volver: se cargan las guardadas
  await page.selectOption('#cmp-campana-select', 'REG-00002');
  await page.waitForFunction(()=> /aún no tiene compras/.test($('cmp-msg').textContent), null, { timeout: 10000 });
  await page.selectOption('#cmp-campana-select', 'REG-00001');
  await page.waitForFunction(()=> /tiene 4 compra/.test($('cmp-msg').textContent), null, { timeout: 10000 });
  g = await grilla();
  verificar(g.filas.length === 4 && g.filas[1].split('|')[3] === 'ZJ-7193' && /✓ Guardado/.test(g.resumen), 'Al volver a la campaña se cargan sus 4 compras en orden');

  // 6. Quitar una fila y guardar: reemplaza
  await page.click('#cmp-body [data-cmp-quitar="0"]');
  await page.click('#btn-cmp-guardar');
  await page.waitForFunction(()=> /Guardado! 3/.test($('cmp-msg').textContent), null, { timeout: 20000 });
  const n = await page.evaluate(async ()=> (await comprasCampanaItemsRef.where('campana_correlativo','==','REG-00001').get()).size);
  verificar(n === 3, `Guardar de nuevo reemplaza (quedan ${n} filas, sin duplicar)`);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data()).filter(m=> m.tipo === 'compras_campana_guardadas').map(m=> m.detalle).join(' | '));
  verificar(/REG-00001: 4 compra/.test(log) && /reemplazan 4/.test(log), `Bitácora: ${log}`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
