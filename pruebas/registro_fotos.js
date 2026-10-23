// Productos e inventario → Registro fotográfico: cabecera (participante, fecha, correlativo,
// posición y su foto) y detalle (SKU, descripción, cantidad y una o varias fotos), con la cámara
// del navegador. La cámara se simula con un lienzo animado (no hay cámara real en las pruebas).
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const { abrirApp, limpiarEmuladores, detectorXss } = require('./app');
const bwipjs = require('bwip-js');
const XLSX = require('xlsx');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
// Cámara falsa: un lienzo que cambia de color, entregado como si fuera la cámara.
function camaraFalsa(){
  navigator.mediaDevices.getUserMedia = async ()=>{
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const ctx = cv.getContext('2d'); let t = 0;
    setInterval(()=>{ t++;
      if(window.__codigoImg){ ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 480); const im = window.__codigoImg; ctx.drawImage(im, (640 - im.width) / 2, (480 - im.height) / 2); return; }
      ctx.fillStyle = `hsl(${t * 7 % 360},70%,50%)`; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = '#fff'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('CAMARA ' + t, 60, 260); }, 50);
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
  // Reglas: cantidad mayor a 0 y no se agrega otro producto sin foto (lo que falta se marca en rojo).
  await page.keyboard.press('Enter');
  const c0 = await page.evaluate(()=> ({ msg: $('rf-msg').textContent, cam: $('cam-modal').hidden, rojo: document.querySelector('#rf-items [data-rf-item="0"] [data-rf-campo="cantidad"]').classList.contains('rf-falta') }));
  await page.click('#btn-rf-add');
  const c1 = await page.evaluate(()=> ({ msg: $('rf-msg').textContent, n: rfItems.length, cant: document.querySelector('#rf-items [data-rf-item="0"] [data-rf-campo="cantidad"]').classList.contains('rf-falta'), fotos: document.querySelector('#rf-items [data-rf-item="0"] .rf-fotos').classList.contains('rf-falta') }));
  verificar(/mayor a 0/.test(c0.msg) && c0.cam && c0.rojo, 'Cantidad vacía o 0: no avanza y se marca en rojo');
  verificar(/No se agrega sin foto/.test(c1.msg) && /cantidad/.test(c1.msg) && /foto/.test(c1.msg) && c1.n === 1 && c1.cant && c1.fotos, `"+ Agregar producto" sin foto ni cantidad: no agrega y marca lo que falta ("${c1.msg}")`);
  for(let k = 0; k < 4; k++) await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="1"]');
  await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="-1"]');
  await page.focus('#rf-items [data-rf-item="0"] [data-rf-campo="cantidad"]'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=> !$('cam-modal').hidden && !$('cam-disparar').disabled && $('cam-video').videoWidth > 0, null, { timeout: 10000 });
  await page.click('#cam-disparar'); await page.waitForTimeout(300); await page.click('#cam-disparar');
  await page.waitForFunction(()=> document.querySelectorAll('#cam-tomadas img').length === 2, null, { timeout: 10000 });
  await page.click('#cam-cerrar');
  await page.waitForFunction(()=> rfItems.length === 2 && document.activeElement.dataset.rfCampo === 'sku' && document.activeElement.closest('[data-rf-item]').dataset.rfItem === '1', null, { timeout: 5000 });
  verificar(await page.evaluate(()=> rfItems[0].cantidad === '3' && rfItems[0].fotos.length === 2 && !!document.querySelector('#rf-items [data-rf-item="0"].completo') && !document.querySelector('#rf-items [data-rf-item="0"] .rf-falta')),
    'Cantidad con + / − (3); Enter abre la cámara; al terminar las fotos aparece el producto 2 con el cursor en el SKU');
  // Producto 2: SKU nuevo, descripción a mano (texto malicioso para probar el escape), foto desde la galería.
  // Escáner de código de barras al lado del SKU (Code 128 "X-55" frente a la cámara).
  const codigo = 'data:image/png;base64,' + (await bwipjs.toBuffer({ bcid:'code128', text:'X-55', scale:3, height:14, paddingwidth:12, paddingheight:12, backgroundcolor:'FFFFFF' })).toString('base64');
  await page.evaluate(src=> new Promise(ok=>{ const im = new Image(); im.onload = ()=>{ window.__codigoImg = im; ok(); }; im.src = src; }), codigo);
  await page.click('#rf-items [data-rf-item="1"] [data-rf-scan]');
  await page.waitForFunction(()=> !$('cam-modal').hidden && $('cam-modal').classList.contains('escaneando'), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_escaner.png') });
  await page.waitForFunction(()=> $('cam-modal').hidden && rfItems[1].sku === 'X-55', null, { timeout: 20000 });
  await page.evaluate(()=>{ window.__codigoImg = null; });
  verificar(await page.evaluate(()=> document.activeElement.dataset.rfCampo === 'descripcion' && !$('cam-modal').classList.contains('escaneando')),
    'Botón ▦ al lado del SKU: escanea el código de barras (X-55), lo pone en el SKU y como no está en Productos pasa a la descripción');
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
  const g1 = await page.textContent('#rf-lightbox-pie');
  await page.click('#rf-lb-sig'); const g2 = await page.textContent('#rf-lightbox-pie');
  await page.keyboard.press('ArrowRight'); const g3 = await page.textContent('#rf-lightbox-pie');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); const g4 = await page.textContent('#rf-lightbox-pie');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_galeria_ver.png') });
  verificar(/2 \/ 4/.test(g1) && /3 \/ 4/.test(g2) && /4 \/ 4/.test(g3) && /1 \/ 4/.test(g4) && /Posición A01/.test(g4), `Revisar fotos del registro: en grande con ‹ › y flechas (${g1.trim()} → ${g4.trim()})`);
  await page.keyboard.press('Escape');
  await page.click('#btn-rf-ver-todas');
  verificar(/1 \/ 4/.test(await page.textContent('#rf-lightbox-pie')) && !(await page.evaluate(()=> $('rf-lightbox').hidden)), 'Botón "Ver las 4 fotos" abre la galería desde la primera');
  await page.keyboard.press('Escape');

  // Exportar a Excel (matriz sin fotos) y a PDF (con fotos).
  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-rf-excel')]);
  const xlPath = path.join(__dirname, 'salida', 'rf_export.xlsx'); await xl.saveAs(xlPath);
  const filas = XLSX.utils.sheet_to_json(XLSX.readFile(xlPath).Sheets['Registro fotográfico']);
  verificar(filas.length === 2 && filas[0]['Correlativo'] === 'RF-00001' && filas[0]['Posición'] === 'A01' && filas[0]['SKU'] === 'P100' && filas[0]['Cantidad'] === 3 && filas[1]['SKU'] === 'X-55' && filas[1]['Cantidad'] === 5 && !Object.keys(filas[0]).some(k=> /url|foto_/i.test(k)),
    `Excel como matriz (una fila por producto, sin fotos): ${Object.keys(filas[0]).join(' | ')}`);
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btn-rf-pdf')]);
  const pdfPath = path.join(__dirname, 'salida', 'rf_export.pdf'); await pdf.saveAs(pdfPath);
  const crudo = fs.readFileSync(pdfPath, 'latin1'), imagenes = (crudo.match(/\/Subtype \/Image/g) || []).length;
  const textoPdf = await page.evaluate(async b64=>{ pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; return (await (await d.getPage(1)).getTextContent()).items.map(i=> i.str).join(' '); }, fs.readFileSync(pdfPath).toString('base64'));
  verificar(imagenes >= 4 && /RF-00001/.test(textoPdf) && /A01/.test(textoPdf) && /P100/.test(textoPdf) && /X-55/.test(textoPdf) && /CD VENEZUELA/.test(textoPdf),
    `PDF con fotos: ${imagenes} imágenes, cabecera y productos`);
  await page.evaluate(async b64=>{ const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; const pg = await d.getPage(1), vp = pg.getViewport({ scale: 1.3 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height * 0.6; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; window.__pdfPng = cv.toDataURL('image/png'); }, fs.readFileSync(pdfPath).toString('base64'));
  fs.writeFileSync(path.join(__dirname, 'salida', 'rf_export_pdf.png'), Buffer.from((await page.evaluate(()=> window.__pdfPng)).split(',')[1], 'base64'));
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
  verificar(quedan === 0 && log === 'reg_foto_creado,reg_foto_creado,reg_foto_eliminado,reg_foto_exportado,reg_foto_exportado', `Eliminar borra el registro y sus ${paths.length} fotos; bitácora: ${log}`);
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
