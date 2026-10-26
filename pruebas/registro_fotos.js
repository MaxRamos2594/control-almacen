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
  await page.evaluate(async ()=>{
    await productosRef.doc('P100').set({ codigo:'P100', descripcion:'PELOTA ROJA', costo:1 });
    // Layout: BLOQUE A, nicho A con 4 posiciones de rack (A01 ocupada).
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    await bloquesRef.doc('B1').set({ nombre:'BLOQUE A', creado_en: ts });
    await nichosRef.doc('A').set({ bloque_id:'B1', orden:0, pos_visual:0, tipo:'solo_rack', niveles:2, creado_en: ts });
    for(const [cod, nivel, estado] of [['A01','arriba','ocupado'],['A02','arriba','vacio'],['A03','abajo','vacio'],['A04','abajo','vacio']])
      await posicionesRef.doc(cod).set({ tipo:'rack', nicho:'A', bloque_id:'B1', nivel, estado, bloqueada:false, pallet_codigo: estado === 'ocupado' ? 'CD0001' : null, actualizado: ts });
  });
  await page.waitForFunction(()=> !!productos['P100'] && !!posiciones['A04'] && !!bloques['B1'], null, { timeout: 10000 });

  // Menú: nueva opción dentro de "Productos e inventario".
  const grupo = await page.evaluate(()=>{ const g = $('tab-regfoto').closest('.drawer-group'); return g.querySelector('.drawer-group-title').innerText + ': ' + [...g.querySelectorAll('button[data-tab]')].map(b=> b.innerText).join(', '); });
  verificar(/PRODUCTOS E INVENTARIO: .*Toma de Inventario, Registro fotográfico/i.test(grupo), `Opción nueva en el menú: ${grupo}`);
  await page.click('#btn-menu'); await page.click('#tab-regfoto');
  await page.waitForSelector('#btn-rf-iniciar');
  verificar(await page.evaluate(()=> !$('rf-inicio').hidden && $('rf-form').hidden), 'Al entrar se ve "▶ Iniciar registro" (todavía no hay formulario)');

  // Iniciar: se asigna el correlativo y se guarda como borrador; se abre el selector de posiciones del layout.
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> !$('rf-pos-modal').hidden && $('rf-correlativo').value === 'RF-00001', null, { timeout: 15000 });
  const ini = await page.evaluate(async ()=> ({ bd: (await registrosFotoRef.doc('RF-00001').get()).data(), cab: { part: $('rf-participante').value, fecha: $('rf-fecha').value, usu: $('rf-usuario').value, barra: $('rf-bar-corr').textContent } }));
  verificar(ini.bd && ini.bd.estado === 'BORRADOR' && ini.bd.usuario === 'Administrador' && /@/.test(ini.bd.usuario_email) && ini.cab.part === 'CD VENEZUELA' && /\d/.test(ini.cab.fecha) && ini.cab.usu === 'Administrador' && ini.cab.barra === 'RF-00001',
    `Al iniciar: correlativo RF-00001 guardado como BORRADOR con el usuario que lo genera (${ini.bd.usuario}, ${ini.bd.usuario_email})`);
  const sel = await page.evaluate(()=> $('rf-pos-lista').innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_posiciones.png') });
  verificar(/BLOQUE A/.test(sel) && /Nicho A/.test(sel) && /A01/.test(sel) && /A04/.test(sel), `Selector de posiciones según el layout: ${sel.slice(0, 80)}…`);
  await page.click('#btn-rf-pos-cerrar');
  await page.click('#btn-rf-guardar');
  verificar(/Elige la posición/.test(await page.textContent('#rf-msg')), 'Para confirmar pide la posición');
  verificar(await page.evaluate(()=> !$('rf-aviso').hidden), 'Sale el aviso emergente: ' + (await page.textContent('#rf-aviso-tit')));
  await page.click('#btn-rf-aviso-ok');
  verificar(await page.evaluate(()=> $('rf-posicion').readOnly), 'La posición no se escribe a mano: se elige del layout');
  // Elegir A02 buscando; se abre sola la cámara de la posición.
  await page.click('#rf-posicion');
  await page.fill('#rf-pos-q', 'a02'); await page.press('#rf-pos-q', 'Enter');
  await page.waitForFunction(()=> $('rf-posicion').value === 'A02' && !$('cam-modal').hidden && $('cam-video').videoWidth > 0 && !$('cam-disparar').disabled, null, { timeout: 10000 });
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_camara.png') });
  await page.click('#cam-disparar');
  await page.waitForFunction(()=> $('cam-modal').hidden && document.activeElement && document.activeElement.dataset.rfCampo === 'sku', null, { timeout: 10000 });
  await page.waitForFunction(async ()=>{ const d = (await registrosFotoRef.doc('RF-00001').get()).data(); return d.posicion === 'A02' && d.foto_posicion && /^http/.test(d.foto_posicion.url); }, null, { timeout: 15000, polling: 500 });
  await page.waitForFunction(()=> /Guardado/.test($('rf-nube').textContent), null, { timeout: 10000 });
  const nube = await page.evaluate(()=> [!$('cam-video').srcObject, $('rf-pasos').innerText.replace(/\s+/g, ''), $('rf-nube').textContent]);
  verificar(nube[0] && /✓Posición/.test(nube[1]) && /Guardado/.test(nube[2]),
    'Elegir A02 abre la cámara; la foto se sube al instante y el borrador se guarda solo (posición y foto)');

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
  const c1 = await page.evaluate(()=> ({ msg: $('rf-aviso-txt').textContent, n: rfItems.length, cant: document.querySelector('#rf-items [data-rf-item="0"] [data-rf-campo="cantidad"]').classList.contains('rf-falta'), fotos: document.querySelector('#rf-items [data-rf-item="0"] .rf-fotos').classList.contains('rf-falta') }));
  verificar(/mayor a 0/.test(c0.msg) && c0.cam && c0.rojo, 'Cantidad vacía o 0: no avanza y se marca en rojo');
  verificar(/No se agrega sin foto/.test(c1.msg) && /cantidad/.test(c1.msg) && /foto/.test(c1.msg) && c1.n === 1 && c1.cant && c1.fotos, `"+ Agregar producto" sin foto ni cantidad: no agrega y marca lo que falta ("${c1.msg}")`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_aviso.png') });
  verificar(await page.evaluate(()=> !$('rf-aviso').hidden), 'Sale el aviso emergente: ' + (await page.textContent('#rf-aviso-tit')));
  await page.click('#btn-rf-aviso-ok');
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
  // "+ Agregar producto" con el producto 2 todavía en blanco: aviso emergente y no agrega otro.
  await page.click('#btn-rf-add');
  await page.waitForFunction(()=> !$('rf-aviso').hidden, null, { timeout: 5000 });
  const av = await page.evaluate(()=> ({ tit: $('rf-aviso-tit').textContent, txt: $('rf-aviso-txt').textContent, n: rfItems.length }));
  await page.click('#btn-rf-aviso-ok');
  await page.waitForFunction(()=> document.activeElement.dataset.rfCampo === 'sku', null, { timeout: 3000 }).catch(()=>{});
  verificar(/Registra el producto 2/.test(av.tit) && /antes de agregar uno nuevo/i.test(av.txt) && av.n === 2 && (await page.evaluate(()=> rfItems.length === 2 && document.activeElement.dataset.rfCampo === 'sku')),
    `Producto anterior en blanco: pop up "${av.tit}" y no agrega otro`);
  // Autoguardado: se recarga la página a mitad del registro y se continúa el borrador sin perder nada.
  await page.waitForFunction(async ()=>{ const d = (await registrosFotoRef.doc('RF-00001').get()).data(); return d.items.length === 1 && d.items[0].sku === 'P100' && d.items[0].cantidad === 3 && d.items[0].fotos.length === 2; }, null, { timeout: 15000, polling: 500 });
  await page.reload();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('nuevo'); });
  await page.waitForSelector('#rf-mis-borradores [data-rf-continuar="RF-00001"]', { timeout: 10000 });
  await page.click('#rf-mis-borradores [data-rf-continuar="RF-00001"]');
  await page.waitForFunction(()=> !$('rf-form').hidden && $('rf-posicion').value === 'A02' && rfPosFotos.length === 1 && rfItems[0].sku === 'P100' && rfItems[0].fotos.length === 2 && rfItems.length === 2, null, { timeout: 10000 });
  verificar(true, 'Recargando la página: "Continuar RF-00001" recupera la posición, su foto y el producto 1 con sus 2 fotos');
  await page.focus('#rf-items [data-rf-item="1"] [data-rf-campo="sku"]');
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
  const tras = await page.evaluate(()=> ({ ok: $('rf-ok').innerText, inicio: !$('rf-inicio').hidden, form: $('rf-form').hidden, foco: document.activeElement.id, borr: rfBorrador }));
  verificar(/RF-00001\s+confirmado/.test(tras.ok) && tras.inicio && tras.form && tras.foco === 'btn-rf-iniciar' && !tras.borr,
    `Confirmar: "${tras.ok.replace(/\s+/g, ' ')}" y queda listo para iniciar el siguiente`);
  const bd = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-00001').get()).data());
  verificar(bd && bd.estado === 'CONFIRMADO' && bd.confirmado_por === 'Administrador' && !!bd.confirmado_en && bd.participante === 'CD VENEZUELA' && bd.posicion === 'A02' && /^http/.test(bd.foto_posicion.url) && bd.items.length === 2 && bd.items[0].sku === 'P100' && bd.items[0].cantidad === 3 &&
    bd.items[0].fotos.length === 2 && bd.items[1].sku === 'X-55' && bd.items[1].fotos.length === 1 && bd.unidades === 8 && !!bd.fecha_creacion,
    'RF-00001 CONFIRMADO (quién y cuándo): cabecera, posición A02 con foto y 2 productos con sus fotos');
  await page.click('#btn-rf-ver-ultimo');
  await page.waitForFunction(()=> !!document.querySelector('#rf-detalle .rf-det-items'), null, { timeout: 15000 });
  const det = await page.evaluate(()=> ({ txt: $('rf-detalle').innerText, fotos: document.querySelectorAll('#rf-detalle .rf-thumb img').length, fila: document.querySelectorAll('#rf-lista .rf-fila').length }));
  verificar(/RF-00001/.test(det.txt) && /A02/.test(det.txt) && /CONFIRMADO/.test(det.txt) && /Generado por\s*Administrador/i.test(det.txt) && /PELOTA ROJA/.test(det.txt) && det.fotos === 4 && det.fila === 1, `"Ver" abre la lista y el detalle con ${det.fotos} fotos`);
  await page.click('#rf-detalle .rf-thumb >> nth=1');
  const g1 = await page.textContent('#rf-lightbox-pie');
  await page.click('#rf-lb-sig'); const g2 = await page.textContent('#rf-lightbox-pie');
  await page.keyboard.press('ArrowRight'); const g3 = await page.textContent('#rf-lightbox-pie');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); const g4 = await page.textContent('#rf-lightbox-pie');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_galeria_ver.png') });
  verificar(/2 \/ 4/.test(g1) && /3 \/ 4/.test(g2) && /4 \/ 4/.test(g3) && /1 \/ 4/.test(g4) && /Posición A02/.test(g4), `Revisar fotos del registro: en grande con ‹ › y flechas (${g1.trim()} → ${g4.trim()})`);
  await page.keyboard.press('Escape');
  await page.click('#btn-rf-ver-todas');
  verificar(/1 \/ 4/.test(await page.textContent('#rf-lightbox-pie')) && !(await page.evaluate(()=> $('rf-lightbox').hidden)), 'Botón "Ver las 4 fotos" abre la galería desde la primera');
  await page.keyboard.press('Escape');

  // Exportar a Excel (matriz sin fotos) y a PDF (con fotos).
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_registro.png'), fullPage: true });
  verificar(/1–1 de 1 · página 1 de 1/.test(await page.textContent('#rf-pag-txt')), 'Registros: paginado de 10 en 10 (siempre visible)');
  // Los reportes (Excel y PDF) están en la pestaña "Reportes".
  verificar(await page.evaluate(()=> !document.querySelector('#rfsub-panel-lista #btn-rf-excel') && !!document.querySelector('#rfsub-panel-reportes #btn-rf-excel')), 'Excel y PDF migrados a "📊 Reportes"');
  await page.click('#rfsub-reportes');
  await page.waitForFunction(()=> document.querySelectorAll('#rf-rep-visual .rf-rep-tile').length >= 4, null, { timeout: 10000 });
  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-rf-excel')]);
  const xlPath = path.join(__dirname, 'salida', 'rf_export.xlsx'); await xl.saveAs(xlPath);
  const filas = XLSX.utils.sheet_to_json(XLSX.readFile(xlPath).Sheets['Registro fotográfico']);
  verificar(filas.length === 2 && filas[0]['Correlativo'] === 'RF-00001' && filas[0]['Posición'] === 'A02' && filas[0]['Estado'] === 'CONFIRMADO' && filas[0]['Generado por'] === 'Administrador' && filas[0]['Confirmado por'] === 'Administrador' && filas[0]['SKU'] === 'P100' && filas[0]['Cantidad'] === 3 && filas[1]['SKU'] === 'X-55' && filas[1]['Cantidad'] === 5 && !Object.keys(filas[0]).some(k=> /url|foto_/i.test(k)),
    `Excel como matriz (una fila por producto, sin fotos): ${Object.keys(filas[0]).join(' | ')}`);
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btn-rf-pdf')]);
  const pdfPath = path.join(__dirname, 'salida', 'rf_export.pdf'); await pdf.saveAs(pdfPath);
  const crudo = fs.readFileSync(pdfPath, 'latin1'), imagenes = (crudo.match(/\/Subtype \/Image/g) || []).length;
  const textoPdf = await page.evaluate(async b64=>{ pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; return (await (await d.getPage(1)).getTextContent()).items.map(i=> i.str).join(' '); }, fs.readFileSync(pdfPath).toString('base64'));
  verificar(imagenes >= 4 && /RF-00001/.test(textoPdf) && /A02/.test(textoPdf) && /CONFIRMADO/.test(textoPdf) && /P100/.test(textoPdf) && /X-55/.test(textoPdf) && /CD VENEZUELA/.test(textoPdf),
    `PDF con fotos: ${imagenes} imágenes, cabecera y productos`);
  await page.evaluate(async b64=>{ const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; const pg = await d.getPage(1), vp = pg.getViewport({ scale: 1.3 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height * 0.6; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; window.__pdfPng = cv.toDataURL('image/png'); }, fs.readFileSync(pdfPath).toString('base64'));
  fs.writeFileSync(path.join(__dirname, 'salida', 'rf_export_pdf.png'), Buffer.from((await page.evaluate(()=> window.__pdfPng)).split(',')[1], 'base64'));
  await page.click('#rfsub-lista');

  // Búsqueda y segundo registro (correlativo siguiente).
  await page.fill('#rf-q', 'pelota'); await page.waitForTimeout(150);
  const b1 = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.fill('#rf-q', 'no-existe'); await page.waitForTimeout(150);
  const b2 = await page.evaluate(()=> rfFiltrados().length);
  await page.fill('#rf-q', '');
  verificar(b1 === 'RF-00001' && b2 === 0, 'Buscador por SKU/descripción');
  await page.click('#rfsub-nuevo');
  verificar(await page.evaluate(()=> !$('rf-inicio').hidden && $('rf-form').hidden && !rfBorrador), 'En "Nuevo registro" espera a que se inicie el siguiente');
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> !$('rf-pos-modal').hidden && $('rf-correlativo').value === 'RF-00002', null, { timeout: 15000 });
  await page.click('#rf-pos-lista [data-rf-pos="A03"]');
  await page.waitForFunction(()=> !$('cam-modal').hidden && $('cam-video').videoWidth > 0 && !$('cam-disparar').disabled, null, { timeout: 10000 });
  await page.click('#cam-disparar');
  await page.waitForFunction(()=> $('cam-modal').hidden && document.activeElement.dataset.rfCampo === 'sku', null, { timeout: 10000 });
  await page.keyboard.type('P100'); await page.keyboard.press('Enter');
  await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="1"]');
  await page.focus('#rf-items [data-rf-item="0"] [data-rf-campo="cantidad"]'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=> !$('cam-modal').hidden && !$('cam-disparar').disabled && $('cam-video').videoWidth > 0, null, { timeout: 10000 });
  await page.click('#cam-disparar'); await page.click('#cam-cerrar');
  await page.waitForFunction(()=> $('btn-rf-guardar').classList.contains('listo'), null, { timeout: 15000 });
  await page.click('#btn-rf-guardar');
  await page.waitForFunction(()=> /RF-00002/.test($('rf-ok').innerText), null, { timeout: 30000 });
  verificar(true, 'Segundo registro RF-00002 (posición A03) iniciado y confirmado');
  // Tercero: posición fuera del layout no se confirma; descartar borra el borrador.
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> $('rf-correlativo').value === 'RF-00003' && !$('rf-pos-modal').hidden, null, { timeout: 15000 });
  await page.click('#btn-rf-pos-cerrar');
  await page.evaluate(()=>{ $('rf-posicion').value = 'ZZ9'; });
  await page.click('#btn-rf-guardar');
  verificar(/ZZ9 no existe en el layout/.test(await page.textContent('#rf-msg')), 'Una posición que no está en el layout no se puede confirmar');
  verificar(await page.evaluate(()=> !$('rf-aviso').hidden), 'Sale el aviso emergente: ' + (await page.textContent('#rf-aviso-tit')));
  await page.click('#btn-rf-aviso-ok');
  await page.click('#btn-rf-descartar');
  await page.waitForFunction(()=> !rfBorrador && !$('rf-inicio').hidden, null, { timeout: 10000 });
  verificar(!(await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-00003').get()).exists)), '"Descartar" borra el borrador RF-00003');
  // Cuarto: queda como borrador; se ve con el filtro "Borradores" y se continúa desde su detalle.
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> $('rf-correlativo').value === 'RF-00004' && !$('rf-pos-modal').hidden, null, { timeout: 15000 });
  await page.click('#rf-pos-lista [data-rf-pos="A04"]');
  await page.waitForFunction(()=> !$('cam-modal').hidden, null, { timeout: 10000 }); await page.click('#cam-cerrar');
  await page.evaluate(()=> rfGuardarAhora());
  await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.some(r=> r.id === 'RF-00004'), null, { timeout: 15000 });
  await page.selectOption('#rf-estado-f', 'BORRADOR');
  const borrs = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.selectOption('#rf-estado-f', 'CONFIRMADO');
  const confs = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.selectOption('#rf-estado-f', '');
  await page.evaluate(()=> rfAbrir('RF-00004'));
  const cont = await page.evaluate(()=> !!$('btn-rf-continuar') && /Pendiente \(borrador\)/.test($('rf-detalle').innerText));
  verificar(borrs === 'RF-00004' && confs === 'RF-00002,RF-00001' && cont, `Filtro por estado: borradores ${borrs} · confirmados ${confs}; el borrador se puede continuar desde su detalle`);

  // Reporte visual: posición · inventarios (cantidad de RF) · bloque; clic → los RF de cada uno.
  await page.click('#rfsub-reportes');
  await page.waitForFunction(()=> document.querySelectorAll('#rf-rep-visual .rf-rep-tile').length >= 4, null, { timeout: 10000 });
  const vis = await page.evaluate(()=>{ const t = c=> (document.querySelector(`#rf-rep-visual [data-rfr-pos="${c}"] .c`) || {}).textContent;
    return { a1: t('A01'), a2: t('A02'), a3: t('A03'), a4: t('A04'), bloque: document.querySelector('#rf-rep-resumen tbody tr').innerText.replace(/\s+/g, ' '), tabla: document.querySelectorAll('#rf-rep-tabla tbody tr').length }; });
  verificar(vis.a1 === '0' && vis.a2 === '1' && vis.a3 === '1' && vis.a4 === '0' && /BLOQUE A 2 de 4 2/.test(vis.bloque) && vis.tabla === 2,
    `Reporte visual (solo confirmados): A01 ${vis.a1} · A02 ${vis.a2} · A03 ${vis.a3} · A04 ${vis.a4}; bloque "${vis.bloque}"`);
  await page.click('#rf-rep-visual [data-rfr-pos="A02"]');
  const detPos = await page.evaluate(()=> [...document.querySelectorAll('#rf-rep-detalle [data-rfr-ver]')].map(r=> r.dataset.rfrVer).join(','));
  await page.click('#rf-rep-visual [data-rfr-bloque="BLOQUE A"]');
  const detBlo = await page.evaluate(()=> [...document.querySelectorAll('#rf-rep-detalle [data-rfr-ver]')].map(r=> r.dataset.rfrVer).sort().join(','));
  await page.selectOption('#rfr-estado', '');
  const a4Todos = await page.evaluate(()=> document.querySelector('#rf-rep-visual [data-rfr-pos="A04"] .c').textContent);
  await page.selectOption('#rfr-estado', 'CONFIRMADO');
  await page.click('#rf-rep-visual [data-rfr-pos="A02"]');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_reportes.png'), fullPage: true });
  await page.click('#rf-rep-detalle [data-rfr-ver="RF-00001"]');
  await page.waitForFunction(()=> $('rfsub-panel-lista').style.display === 'block' && /RF-00001/.test(($('rf-detalle').querySelector('h2') || {}).textContent || ''), null, { timeout: 10000 });
  verificar(detPos === 'RF-00001' && detBlo === 'RF-00001,RF-00002' && a4Todos === '1', `Clic en A02 → ${detPos}; clic en BLOQUE A → ${detBlo}; con "Todos" A04 cuenta su borrador; clic en un RF abre su detalle`);

  // Modificar un registro confirmado: vuelve a la pantalla de registro y se confirma de nuevo.
  await page.evaluate(()=> rfAbrir('RF-00002'));
  const fotoVieja = await page.evaluate(()=> rfLista.find(r=> r.id === 'RF-00002').items[0].fotos[0].path);
  await page.click('#btn-rf-modificar');
  await page.waitForFunction(()=> $('rfsub-panel-nuevo').style.display === 'block' && !$('rf-form').hidden && $('rf-correlativo').value === 'RF-00002' && rfItems[0].sku === 'P100', null, { timeout: 15000 });
  const mod = await page.evaluate(async ()=> ({ chip: document.querySelector('.rf-chip-borrador').textContent, btn: $('btn-rf-guardar').textContent, desc: $('btn-rf-descartar').textContent, bd: (await registrosFotoRef.doc('RF-00002').get()).data() }));
  verificar(/MODIFICANDO/.test(mod.chip) && /Confirmar cambios/.test(mod.btn) && /Cancelar cambios/.test(mod.desc) && mod.bd.modificando === true && mod.bd.estado === 'BORRADOR' && !!mod.bd.respaldo,
    '"✏ Modificar" vuelve a la pantalla de registro con el RF en modificación (con respaldo)');
  await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="1"]');
  await page.click('#rf-items [data-rf-item="0"] .rf-add-foto');
  await page.waitForFunction(()=> !$('cam-modal').hidden && !$('cam-disparar').disabled && $('cam-video').videoWidth > 0, null, { timeout: 10000 });
  await page.click('#cam-disparar'); await page.click('#cam-cerrar');
  await page.waitForFunction(()=> rfItems[0].fotos.length === 2 && rfItems[0].fotos.every(f=> f.path && !f.subiendo), null, { timeout: 15000 });
  await page.click('#rf-items [data-rf-item="0"] .rf-thumb >> nth=0 >> .rf-quitar');
  const sigue = await page.evaluate(async p=> storage.ref().child(p).getMetadata().then(()=> true, ()=> false), fotoVieja);
  await page.click('#btn-rf-guardar');
  await page.waitForFunction(()=> /RF-00002\s+modificado/.test($('rf-ok').innerText), null, { timeout: 20000 });
  const tras2 = await page.evaluate(async p=> ({ bd: (await registrosFotoRef.doc('RF-00002').get()).data(), vieja: await storage.ref().child(p).getMetadata().then(()=> true, ()=> false) }), fotoVieja);
  verificar(sigue && tras2.bd.estado === 'CONFIRMADO' && tras2.bd.items[0].cantidad === 2 && tras2.bd.items[0].fotos.length === 1 && tras2.bd.modificado_por === 'Administrador' && !('modificando' in tras2.bd) && !('respaldo' in tras2.bd) && !tras2.vieja,
    'Confirmar cambios: queda CONFIRMADO con la cantidad nueva y quién lo modificó; la foto quitada se borra recién al confirmar');
  // Cancelar una modificación deja todo como estaba.
  await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.some(r=> r.id === 'RF-00002' && r.estado === 'CONFIRMADO'), null, { timeout: 10000 });
  await page.evaluate(()=> rfAbrir('RF-00002')); await page.click('#btn-rf-modificar');
  await page.waitForFunction(()=> !$('rf-form').hidden && $('rf-correlativo').value === 'RF-00002', null, { timeout: 15000 });
  await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="1"]'); await page.evaluate(()=> rfGuardarAhora());
  await page.click('#btn-rf-descartar');
  await page.waitForFunction(()=> !rfBorrador && !$('rf-inicio').hidden, null, { timeout: 10000 });
  const canc = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-00002').get()).data());
  verificar(canc.estado === 'CONFIRMADO' && canc.items[0].cantidad === 2 && !('modificando' in canc) && !('respaldo' in canc), '"↩ Cancelar cambios" deja el RF como estaba confirmado');
  await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.length >= 3, null, { timeout: 10000 });

  // Eliminar (borra también las fotos).
  const paths = await page.evaluate(()=> { const r = rfLista.find(x=> x.id === 'RF-00001'); return [r.foto_posicion.path, ...r.items.flatMap(it=> it.fotos.map(f=> f.path))]; });
  await page.evaluate(()=> rfAbrir('RF-00001'));
  await page.click('#btn-rf-eliminar');
  await page.waitForFunction(()=> !rfLista.some(r=> r.id === 'RF-00001'), null, { timeout: 15000 });
  const quedan = await page.evaluate(async ps=> (await Promise.all(ps.map(p=> storage.ref().child(p).getMetadata().then(()=> 1, ()=> 0)))).reduce((a, b)=> a + b, 0), paths);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^reg_foto/.test(t)).sort().join(','));
  verificar(quedan === 0 && log === 'reg_foto_confirmado,reg_foto_confirmado,reg_foto_descartado,reg_foto_eliminado,reg_foto_exportado,reg_foto_exportado,reg_foto_iniciado,reg_foto_iniciado,reg_foto_iniciado,reg_foto_iniciado,reg_foto_modificacion_cancelada,reg_foto_modificado,reg_foto_reabierto,reg_foto_reabierto', `Eliminar borra el registro y sus ${paths.length} fotos; bitácora: ${log}`);
  verificar(!(await page.evaluate(()=> window.__xss || (window.__xssOrigen || []).length)), 'El texto malicioso en la descripción no se ejecutó');

  // Tablet (800 px): el SKU va solo arriba, ancho completo; debajo Cantidad y Descripción en la misma fila.
  const medir = ()=> page.evaluate(()=>{ const it = document.querySelector('#rf-items .rf-item'), r = sel=> it.querySelector(sel).getBoundingClientRect(), ancho = it.getBoundingClientRect().width;
    return { sku: r('.rf-sku-box').width / ancho, skuInput: Math.round(r('[data-rf-campo="sku"]').width), cant: r('.rf-cant'), desc: r('.rf-desc'), skuAbajo: r('.rf-sku-box').bottom, scroll: document.documentElement.scrollWidth }; });
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.evaluate(()=> rfContinuar('RF-00004')); await page.waitForFunction(()=> !$('rf-form').hidden, null, { timeout: 10000 }); await page.waitForTimeout(300);
  let m = await medir();
  await page.locator('#rf-items').screenshot({ path: path.join(__dirname, 'salida', 'rf_tablet.png') });
  verificar(m.sku > 0.9 && m.skuInput > 550 && Math.abs(m.cant.top - m.desc.top) < 2 && m.cant.top >= m.skuAbajo && m.desc.width > m.cant.width && m.scroll <= 800,
    `Tablet: SKU con su fila completa (${m.skuInput}px) y debajo Cantidad + Descripción`);
  await page.setViewportSize({ width: 390, height: 860 }); await page.waitForTimeout(300);
  m = await medir();
  verificar(m.sku > 0.9 && m.desc.top > m.cant.top && m.cant.width > 300, 'Celular: SKU, Cantidad y Descripción uno debajo del otro, a lo ancho');

  // Celular: sin desplazamiento hacia los lados.
  await page.setViewportSize({ width: 390, height: 860 });
  await page.evaluate(()=> rfContinuar('RF-00004')); await page.waitForFunction(()=> !$('rf-form').hidden, null, { timeout: 10000 }); await page.waitForTimeout(300);
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
