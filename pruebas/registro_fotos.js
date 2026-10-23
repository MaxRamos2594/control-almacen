// Productos e inventario → Registro fotográfico: cabecera (participante, fecha, correlativo,
// posición y su foto) y detalle (SKU, descripción, cantidad y una o varias fotos), con la cámara
// del navegador. La cámara se simula con un lienzo animado (no hay cámara real en las pruebas).
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const { abrirApp, limpiarEmuladores, detectorXss } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
// Cámara falsa: un lienzo que cambia de color, entregado como si fuera la cámara.
function camaraFalsa(){
  navigator.mediaDevices.getUserMedia = async ()=>{
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const ctx = cv.getContext('2d'); let t = 0;
    setInterval(()=>{ t++; ctx.fillStyle = `hsl(${t * 7 % 360},70%,50%)`; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = '#fff'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('CAMARA ' + t, 60, 260); }, 50);
    window.__camaraPedida = (window.__camaraPedida || 0) + 1;
    return cv.captureStream(20);
  };
}
const MALICIOSO = `<img src=x onerror="window.__xss=(window.__xss||0)+1">`;

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp({ scriptInicial: `(${detectorXss.toString()})(); (${camaraFalsa.toString()})();` });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{ await productosRef.doc('P100').set({ codigo:'P100', descripcion:'PELOTA ROJA', costo:1 }); });
  await page.waitForFunction(()=> !!productos['P100'], null, { timeout: 10000 });

  // Menú: nueva opción dentro de "Productos e inventario".
  const grupo = await page.evaluate(()=>{ const g = $('tab-regfoto').closest('.drawer-group'); return g.querySelector('.drawer-group-title').innerText + ': ' + [...g.querySelectorAll('button[data-tab]')].map(b=> b.innerText).join(', '); });
  verificar(/PRODUCTOS E INVENTARIO: .*Toma de Inventario, Registro fotográfico/i.test(grupo), `Opción nueva en el menú: ${grupo}`);
  await page.click('#btn-menu'); await page.click('#tab-regfoto');
  await page.waitForSelector('#rf-pos-fotos .rf-add-foto');
  const cab = await page.evaluate(()=> ({ part: $('rf-participante').value, fecha: $('rf-fecha').value, corr: $('rf-correlativo').value }));
  verificar(cab.part === 'CD VENEZUELA' && /\d/.test(cab.fecha) && /al guardar/.test(cab.corr), `Cabecera: participante ${cab.part}, fecha ${cab.fecha}, correlativo "${cab.corr}"`);

  verificar(/Posición/.test(await page.textContent('#rf-pasos')), 'Pasos a la vista: Posición · Foto posición · Productos');
  await page.click('#btn-rf-guardar');
  verificar(/posición/.test(await page.textContent('#rf-msg')), 'Pide la posición');

  // Flujo del operario: posición + Enter → se abre sola la cámara de la posición.
  await page.fill('#rf-posicion', 'a01'); await page.press('#rf-posicion', 'Enter');
  await page.waitForFunction(()=> !$('cam-modal').hidden && $('cam-video').videoWidth > 0 && !$('cam-disparar').disabled, null, { timeout: 10000 });
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_camara.png') });
  await page.click('#cam-disparar');
  await page.waitForFunction(()=> $('cam-modal').hidden && document.activeElement && document.activeElement.dataset.rfCampo === 'sku', null, { timeout: 10000 });
  verificar(await page.evaluate(()=> rfPosFotos[0].blob.type === 'image/jpeg' && !$('cam-video').srcObject && /✓Posición/.test($('rf-pasos').innerText.replace(/\s+/g, '')) ), 'Posición + Enter abre la cámara; tras la foto se apaga y el cursor pasa al SKU');

  // SKU por descripción: sugerencias para tocar; Enter elige la primera y pasa a Cantidad.
  await page.keyboard.type('pelo');
  await page.waitForSelector('#rf-items [data-rf-item="0"] .rf-sug:not([hidden]) [data-rf-sug="P100"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=> rfItems[0].sku === 'P100' && rfItems[0].descripcion === 'PELOTA ROJA' && document.activeElement.dataset.rfCampo === 'cantidad', null, { timeout: 5000 });
  verificar(true, 'Buscar "pelo" sugiere P100 · PELOTA ROJA; Enter la elige, completa la descripción y pasa a Cantidad');
  // Cantidad con + y −, luego Enter → cámara del producto; 2 fotos y "Listo" → aparece el producto 2.
  for(let k = 0; k < 4; k++) await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="1"]');
  await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="-1"]');
  await page.focus('#rf-items [data-rf-item="0"] [data-rf-campo="cantidad"]'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=> !$('cam-modal').hidden && !$('cam-disparar').disabled && $('cam-video').videoWidth > 0, null, { timeout: 10000 });
  await page.click('#cam-disparar'); await page.waitForTimeout(300); await page.click('#cam-disparar');
  await page.waitForFunction(()=> document.querySelectorAll('#cam-tomadas img').length === 2, null, { timeout: 10000 });
  await page.click('#cam-cerrar');
  await page.waitForFunction(()=> rfItems.length === 2 && document.activeElement.dataset.rfCampo === 'sku' && document.activeElement.closest('[data-rf-item]').dataset.rfItem === '1', null, { timeout: 5000 });
  verificar(await page.evaluate(()=> rfItems[0].cantidad === '3' && rfItems[0].fotos.length === 2 && !!document.querySelector('#rf-items [data-rf-item="0"].completo')),
    'Cantidad con + / − (3); Enter abre la cámara; al terminar las fotos aparece el producto 2 con el cursor en el SKU');
  // Producto 2: SKU nuevo, descripción a mano (texto malicioso para probar el escape), foto desde la galería.
  await page.keyboard.type('x-55'); await page.keyboard.press('Enter');
  await page.fill('#rf-items [data-rf-item="1"] [data-rf-campo="descripcion"]', 'CAJA ' + MALICIOSO);
  await page.fill('#rf-items [data-rf-item="1"] [data-rf-campo="cantidad"]', '5'); await page.press('#rf-items [data-rf-item="1"] [data-rf-campo="cantidad"]', 'Enter');
  await page.waitForFunction(()=> !$('cam-modal').hidden, null, { timeout: 10000 });
  const png = path.join(__dirname, 'salida', 'rf_galeria.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await page.setInputFiles('#cam-file', [png]);
  await page.waitForFunction(()=> rfItems[1].fotos.length === 1, null, { timeout: 10000 });
  await page.click('#cam-cerrar');
  await page.waitForFunction(()=> rfItems.length === 3, null, { timeout: 5000 });
  const res = await page.textContent('#rf-resumen'), listo = await page.evaluate(()=> $('btn-rf-guardar').classList.contains('listo'));
  verificar(/2 producto\(s\) listo\(s\) · 8 und · 4 foto\(s\)/.test(res) && listo, `Resumen: ${res}; el botón Guardar se pone verde (el producto 3 en blanco no cuenta)`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_nuevo.png'), fullPage: true });
  await page.click('#btn-rf-guardar');
  await page.waitForFunction(()=> !$('rf-ok').hidden, null, { timeout: 30000 });
  const tras = await page.evaluate(()=> ({ ok: $('rf-ok').innerText, panel: $('rfsub-panel-nuevo').style.display, pos: $('rf-posicion').value, foco: document.activeElement.id, items: rfItems.length, part: $('rf-participante').value }));
  verificar(/RF-00001\s+guardado/.test(tras.ok) && tras.panel !== 'none' && tras.pos === '' && tras.foco === 'rf-posicion' && tras.items === 1 && tras.part === 'CD VENEZUELA',
    `Al guardar se queda listo para el siguiente: "${tras.ok.replace(/\s+/g, ' ')}", cursor en Posición`);
  const bd = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-00001').get()).data());
  verificar(bd && bd.participante === 'CD VENEZUELA' && bd.posicion === 'A01' && /^http/.test(bd.foto_posicion.url) && bd.items.length === 2 && bd.items[0].sku === 'P100' && bd.items[0].cantidad === 3 &&
    bd.items[0].fotos.length === 2 && bd.items[1].sku === 'X-55' && bd.items[1].fotos.length === 1 && bd.unidades === 8 && !!bd.fecha_creacion,
    'Guardado RF-00001: cabecera, posición con foto y 2 productos con sus fotos en Storage');
  await page.click('#btn-rf-ver-ultimo');
  await page.waitForFunction(()=> !!document.querySelector('#rf-detalle .rf-det-items'), null, { timeout: 15000 });
  const det = await page.evaluate(()=> ({ txt: $('rf-detalle').innerText, fotos: document.querySelectorAll('#rf-detalle .rf-thumb img').length, fila: document.querySelectorAll('#rf-lista .rf-fila').length }));
  verificar(/RF-00001/.test(det.txt) && /A01/.test(det.txt) && /PELOTA ROJA/.test(det.txt) && det.fotos === 4 && det.fila === 1, `"Ver" abre la lista y el detalle con ${det.fotos} fotos`);
  await page.click('#rf-detalle .rf-thumb >> nth=1');
  verificar(await page.evaluate(()=> !$('rf-lightbox').hidden && /^http/.test($('rf-lightbox-img').src)), 'Clic en una foto la abre en grande');
  await page.click('#rf-lightbox');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_registro.png'), fullPage: true });

  // Búsqueda y segundo registro (correlativo siguiente).
  await page.fill('#rf-q', 'pelota'); await page.waitForTimeout(150);
  const b1 = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.fill('#rf-q', 'no-existe'); await page.waitForTimeout(150);
  const b2 = await page.evaluate(()=> rfFiltrados().length);
  await page.fill('#rf-q', '');
  verificar(b1 === 'RF-00001' && b2 === 0, 'Buscador por SKU/descripción');
  await page.click('#rfsub-nuevo');
  verificar(await page.evaluate(()=> $('rf-posicion').value === '' && rfPosFotos.length === 0 && rfItems.length === 1 && !rfItems[0].sku), 'El formulario sigue limpio para el siguiente');
  await page.fill('#rf-posicion', 'B02');
  await page.evaluate(async ()=>{ const r = await rfComprimir(await (await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')).blob());
    rfPosFotos = [r]; rfItems[0] = { sku:'P100', descripcion:'PELOTA ROJA', cantidad:'1', fotos:[await rfComprimir(r.blob)] }; renderRfForm(); });
  await page.click('#btn-rf-guardar');
  await page.waitForFunction(()=> /RF-00002/.test($('rf-ok').innerText), null, { timeout: 30000 });
  await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.some(r=> r.id === 'RF-00002'), null, { timeout: 15000 });
  verificar(true, 'Segundo registro con correlativo RF-00002');

  // Eliminar (borra también las fotos).
  const paths = await page.evaluate(()=> { const r = rfLista.find(x=> x.id === 'RF-00001'); return [r.foto_posicion.path, ...r.items.flatMap(it=> it.fotos.map(f=> f.path))]; });
  await page.evaluate(()=> rfAbrir('RF-00001'));
  await page.click('#btn-rf-eliminar');
  await page.waitForFunction(()=> !rfLista.some(r=> r.id === 'RF-00001'), null, { timeout: 15000 });
  const quedan = await page.evaluate(async ps=> (await Promise.all(ps.map(p=> storage.ref().child(p).getMetadata().then(()=> 1, ()=> 0)))).reduce((a, b)=> a + b, 0), paths);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^reg_foto/.test(t)).sort().join(','));
  verificar(quedan === 0 && log === 'reg_foto_creado,reg_foto_creado,reg_foto_eliminado', `Eliminar borra el registro y sus ${paths.length} fotos; bitácora: ${log}`);
  verificar(!(await page.evaluate(()=> window.__xss || (window.__xssOrigen || []).length)), 'El texto malicioso en la descripción no se ejecutó');

  // Celular: sin desplazamiento hacia los lados.
  await page.setViewportSize({ width: 390, height: 860 });
  await page.click('#rfsub-nuevo'); await page.waitForTimeout(300);
  const ancho = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_celular.png') });
  await page.click('#rf-pos-fotos .rf-add-foto');
  await page.waitForFunction(()=> !$('cam-modal').hidden && $('cam-video').videoWidth > 0, null, { timeout: 10000 });
  const camW = await page.evaluate(()=> document.querySelector('.cam-caja').getBoundingClientRect().width);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_camara_celular.png') });
  await page.click('#cam-cerrar');
  verificar(ancho <= 390 && camW >= 389, `En celular entra en la pantalla (${ancho}px) y la cámara ocupa toda la pantalla (${Math.round(camW)}px)`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
