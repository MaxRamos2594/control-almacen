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
  // El detalle de un registro se abre encima de la lista: antes de cambiar de pestaña se cierra (como haría el usuario).
  const cerrarDet = ()=> page.evaluate(()=> typeof rfCerrarDetalle === 'function' && rfCerrarDetalle());
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
  await page.waitForFunction(()=> !$('rf-pos-modal').hidden && $('rf-correlativo').value === 'RF-ADM-00001', null, { timeout: 15000 });
  const ini = await page.evaluate(async ()=> ({ bd: (await registrosFotoRef.doc('RF-ADM-00001').get()).data(), cab: { part: $('rf-participante').value, fecha: $('rf-fecha').value, usu: $('rf-usuario').value, barra: $('rf-bar-corr').textContent } }));
  verificar(ini.bd && ini.bd.estado === 'BORRADOR' && ini.bd.usuario === 'Administrador' && /@/.test(ini.bd.usuario_email) && ini.cab.part === 'CD VENEZUELA' && /\d/.test(ini.cab.fecha) && ini.cab.usu === 'Administrador' && ini.cab.barra === 'RF-ADM-00001',
    `Al iniciar: correlativo RF-ADM-00001 guardado como BORRADOR con el usuario que lo genera (${ini.bd.usuario}, ${ini.bd.usuario_email})`);
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
  await page.waitForFunction(async ()=>{ const d = (await registrosFotoRef.doc('RF-ADM-00001').get()).data(); return d.posicion === 'A02' && d.foto_posicion && /^http/.test(d.foto_posicion.url); }, null, { timeout: 15000, polling: 500 });
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
  await page.waitForFunction(async ()=>{ const d = (await registrosFotoRef.doc('RF-ADM-00001').get()).data(); return d.items.length === 1 && d.items[0].sku === 'P100' && d.items[0].cantidad === 3 && d.items[0].fotos.length === 2; }, null, { timeout: 15000, polling: 500 });
  await page.reload();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('nuevo'); });
  await page.waitForSelector('#rf-mis-borradores [data-rf-continuar="RF-ADM-00001"]', { timeout: 10000 });
  await page.click('#rf-mis-borradores [data-rf-continuar="RF-ADM-00001"]');
  await page.waitForFunction(()=> !$('rf-form').hidden && $('rf-posicion').value === 'A02' && rfPosFotos.length === 1 && rfItems[0].sku === 'P100' && rfItems[0].fotos.length === 2 && rfItems.length === 2, null, { timeout: 10000 });
  verificar(true, 'Recargando la página: "Continuar RF-ADM-00001" recupera la posición, su foto y el producto 1 con sus 2 fotos');
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
  verificar(/RF-ADM-00001\s+confirmado/.test(tras.ok) && tras.inicio && tras.form && tras.foco === 'btn-rf-iniciar' && !tras.borr,
    `Confirmar: "${tras.ok.replace(/\s+/g, ' ')}" y queda listo para iniciar el siguiente`);
  const bd = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-ADM-00001').get()).data());
  verificar(bd && bd.estado === 'CONFIRMADO' && bd.confirmado_por === 'Administrador' && !!bd.confirmado_en && bd.participante === 'CD VENEZUELA' && bd.posicion === 'A02' && /^http/.test(bd.foto_posicion.url) && bd.items.length === 2 && bd.items[0].sku === 'P100' && bd.items[0].cantidad === 3 &&
    bd.items[0].fotos.length === 2 && bd.items[1].sku === 'X-55' && bd.items[1].fotos.length === 1 && bd.unidades === 8 && !!bd.fecha_creacion,
    'RF-ADM-00001 CONFIRMADO (quién y cuándo): cabecera, posición A02 con foto y 2 productos con sus fotos');
  await page.click('#btn-rf-ver-ultimo');
  await page.waitForFunction(()=> !!document.querySelector('#rf-detalle .rf-det-items'), null, { timeout: 15000 });
  const det = await page.evaluate(()=> ({ txt: $('rf-detalle').innerText, fotos: document.querySelectorAll('#rf-detalle .rf-thumb img').length, fila: document.querySelectorAll('#rf-lista .rf-fila').length }));
  verificar(/RF-ADM-00001/.test(det.txt) && /A02/.test(det.txt) && /CONFIRMADO/.test(det.txt) && /Generado por\s*Administrador/i.test(det.txt) && /PELOTA ROJA/.test(det.txt) && det.fotos === 4 && det.fila === 1, `"Ver" abre la lista y el detalle con ${det.fotos} fotos`);
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
  // El detalle es una ventana encima de la lista: Esc cierra la foto pero no el detalle; «← Volver a la lista» lo cierra.
  const modalAbierto = await page.evaluate(()=> !$('rf-det-modal').hidden && document.body.classList.contains('rf-modal-abierto') && getComputedStyle($('rf-det-modal')).position === 'fixed');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_detalle_ventana.png') });
  await page.click('#btn-rf-det-volver');
  const trasVolver = await page.evaluate(()=> ({ cerrado: $('rf-det-modal').hidden, lista: !!$('rf-lista').offsetParent, scroll: !document.body.classList.contains('rf-modal-abierto') }));
  await page.click('#rf-lista [data-rf-abrir="RF-ADM-00001"]');
  const reabre = await page.evaluate(()=> !$('rf-det-modal').hidden);
  await page.keyboard.press('Escape');
  const conEsc = await page.evaluate(()=> $('rf-det-modal').hidden);
  verificar(modalAbierto && trasVolver.cerrado && trasVolver.lista && trasVolver.scroll && reabre && conEsc,
    'El detalle se abre en una ventana encima de la lista; «← Volver a la lista» y Esc lo cierran y la lista queda donde estaba');

  // Exportar a Excel (matriz sin fotos) y a PDF (con fotos).
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_registro.png'), fullPage: true });
  verificar(/1–1 de 1 · página 1 de 1/.test(await page.textContent('#rf-pag-txt')), 'Registros: paginado de 10 en 10 (siempre visible)');
  // Los reportes (Excel y PDF) están en la pestaña "Reportes".
  verificar(await page.evaluate(()=> !document.querySelector('#rfsub-panel-lista #btn-rf-excel') && !!document.querySelector('#rfsub-panel-reportes #btn-rf-excel')), 'Excel y PDF migrados a "📊 Reportes"');
  await cerrarDet(); await page.click('#rfsub-reportes');
  await page.waitForSelector('#rf-rep-resumen [data-rfr-bloque="BLOQUE A"]', { timeout: 10000 });
  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-rf-excel')]);
  const xlPath = path.join(__dirname, 'salida', 'rf_export.xlsx'); await xl.saveAs(xlPath);
  const filas = XLSX.utils.sheet_to_json(XLSX.readFile(xlPath).Sheets['Registro fotográfico']);
  verificar(filas.length === 2 && filas[0]['Correlativo'] === 'RF-ADM-00001' && filas[0]['Posición'] === 'A02' && filas[0]['Estado'] === 'CONFIRMADO' && filas[0]['Generado por'] === 'Administrador' && filas[0]['Confirmado por'] === 'Administrador' && filas[0]['SKU'] === 'P100' && filas[0]['Cantidad'] === 3 && filas[1]['SKU'] === 'X-55' && filas[1]['Cantidad'] === 5 && !Object.keys(filas[0]).some(k=> /url|foto_/i.test(k)),
    `Excel como matriz (una fila por producto, sin fotos): ${Object.keys(filas[0]).join(' | ')}`);
  // Fechas: el día como fecha real de Excel (con formato dd/mm/yyyy) y la hora aparte.
  const hoja = XLSX.readFile(xlPath, { cellNF: true }).Sheets['Registro fotográfico'];
  const cab = Object.keys(hoja).filter(k=> /^[A-Z]+1$/.test(k)).reduce((m, k)=> (m[hoja[k].v] = k.replace('1', ''), m), {});
  const fc = hoja[cab['Fecha de creación'] + '2'], ff = hoja[cab['Fecha de confirmación'] + '2'];
  const hoy = await page.evaluate(()=>{ const d = new Date(); return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000; });
  verificar(fc.t === 'n' && fc.v === hoy && fc.z === 'dd/mm/yyyy' && ff.t === 'n' && ff.z === 'dd/mm/yyyy' && /^\d{2}:\d{2}$/.test(filas[0]['Hora de creación']) && /^\d{2}:\d{2}$/.test(filas[0]['Hora de confirmación']),
    `Excel: "Fecha de creación" y "Fecha de confirmación" son fechas de Excel solo con el día (${fc.w || fc.v}); la hora va aparte (${filas[0]['Hora de creación']})`);
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btn-rf-pdf')]);
  const pdfPath = path.join(__dirname, 'salida', 'rf_export.pdf'); await pdf.saveAs(pdfPath);
  const crudo = fs.readFileSync(pdfPath, 'latin1'), imagenes = (crudo.match(/\/Subtype \/Image/g) || []).length;
  const textoPdf = await page.evaluate(async b64=>{ pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; return (await (await d.getPage(1)).getTextContent()).items.map(i=> i.str).join(' '); }, fs.readFileSync(pdfPath).toString('base64'));
  verificar(imagenes >= 4 && /RF-ADM-00001/.test(textoPdf) && /A02/.test(textoPdf) && /CONFIRMADO/.test(textoPdf) && /P100/.test(textoPdf) && /X-55/.test(textoPdf) && /CD VENEZUELA/.test(textoPdf),
    `PDF con fotos: ${imagenes} imágenes, cabecera y productos`);
  await page.evaluate(async b64=>{ const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; const pg = await d.getPage(1), vp = pg.getViewport({ scale: 1.3 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height * 0.6; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; window.__pdfPng = cv.toDataURL('image/png'); }, fs.readFileSync(pdfPath).toString('base64'));
  fs.writeFileSync(path.join(__dirname, 'salida', 'rf_export_pdf.png'), Buffer.from((await page.evaluate(()=> window.__pdfPng)).split(',')[1], 'base64'));
  await cerrarDet(); await page.click('#rfsub-lista');

  // Búsqueda y segundo registro (correlativo siguiente).
  await page.fill('#rf-q', 'pelota'); await page.waitForTimeout(150);
  const b1 = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.fill('#rf-q', 'no-existe'); await page.waitForTimeout(150);
  const b2 = await page.evaluate(()=> rfFiltrados().length);
  await page.fill('#rf-q', '');
  verificar(b1 === 'RF-ADM-00001' && b2 === 0, 'Buscador por SKU/descripción');
  await cerrarDet(); await page.click('#rfsub-nuevo');
  verificar(await page.evaluate(()=> !$('rf-inicio').hidden && $('rf-form').hidden && !rfBorrador), 'En "Nuevo registro" espera a que se inicie el siguiente');
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> !$('rf-pos-modal').hidden && $('rf-correlativo').value === 'RF-ADM-00002', null, { timeout: 15000 });
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
  await page.waitForFunction(()=> /RF-ADM-00002/.test($('rf-ok').innerText), null, { timeout: 30000 });
  verificar(true, 'Segundo registro RF-ADM-00002 (posición A03) iniciado y confirmado');
  // Tercero: posición fuera del layout no se confirma; descartar borra el borrador.
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> $('rf-correlativo').value === 'RF-ADM-00003' && !$('rf-pos-modal').hidden, null, { timeout: 15000 });
  await page.click('#btn-rf-pos-cerrar');
  await page.evaluate(()=>{ $('rf-posicion').value = 'ZZ9'; });
  await page.click('#btn-rf-guardar');
  verificar(/ZZ9 no existe en el layout/.test(await page.textContent('#rf-msg')), 'Una posición que no está en el layout no se puede confirmar');
  verificar(await page.evaluate(()=> !$('rf-aviso').hidden), 'Sale el aviso emergente: ' + (await page.textContent('#rf-aviso-tit')));
  await page.click('#btn-rf-aviso-ok');
  await page.click('#btn-rf-descartar');
  await page.waitForFunction(()=> !rfBorrador && !$('rf-inicio').hidden, null, { timeout: 10000 });
  verificar(!(await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-ADM-00003').get()).exists)), '"Descartar" borra el borrador RF-ADM-00003');
  // Cuarto: queda como borrador; se ve con el filtro "Borradores" y se continúa desde su detalle.
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> $('rf-correlativo').value === 'RF-ADM-00004' && !$('rf-pos-modal').hidden, null, { timeout: 15000 });
  await page.click('#rf-pos-lista [data-rf-pos="A04"]');
  await page.waitForFunction(()=> !$('cam-modal').hidden, null, { timeout: 10000 }); await page.click('#cam-cerrar');
  await page.evaluate(()=> rfGuardarAhora());
  await cerrarDet(); await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.some(r=> r.id === 'RF-ADM-00004'), null, { timeout: 15000 });
  await page.selectOption('#rf-estado-f', 'BORRADOR');
  const borrs = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.selectOption('#rf-estado-f', 'CONFIRMADO');
  const confs = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(','));
  await page.selectOption('#rf-estado-f', '');
  await page.evaluate(()=> rfAbrir('RF-ADM-00004'));
  const cont = await page.evaluate(()=> !!$('btn-rf-continuar') && /Pendiente \(borrador\)/.test($('rf-detalle').innerText));
  verificar(borrs === 'RF-ADM-00004' && confs === 'RF-ADM-00002,RF-ADM-00001' && cont, `Filtro por estado: borradores ${borrs} · confirmados ${confs}; el borrador se puede continuar desde su detalle`);

  // Reporte por bloque y por posición: comprimidos; al tocar uno se despliegan sus RF y se pueden ocultar.
  await cerrarDet(); await page.click('#rfsub-reportes');
  await page.waitForSelector('#rf-rep-resumen [data-rfr-bloque="BLOQUE A"]', { timeout: 10000 });
  const ids = ()=> page.evaluate(()=> [...document.querySelectorAll('#rfsub-panel-reportes [data-rfr-ver]')].map(r=> r.dataset.rfrVer).sort().join(','));
  const nTiles = ()=> page.evaluate(()=> document.querySelectorAll('#rfsub-panel-reportes .rf-rep-tile').length);
  const comprimido = await nTiles() === 0 && await ids() === '';
  const vis = await page.evaluate(()=> ({ bloque: document.querySelector('#rf-rep-resumen tbody tr').innerText.replace(/\s+/g, ' '), tabla: document.querySelectorAll('#rf-rep-tabla tbody tr').length }));
  await page.click('#rf-rep-resumen [data-rfr-bloque="BLOQUE A"]');
  const t = await page.evaluate(()=>{ const t = c=> (document.querySelector(`#rf-rep-resumen [data-rfr-tile="${c}"] .c`) || {}).textContent; return [t('A01'), t('A02'), t('A03'), t('A04')].join(' '); });
  const detBlo = await ids();
  await page.click('#rf-rep-resumen [data-rfr-tile="A02"]'); const detTile = await ids();
  await page.click('#rf-rep-resumen [data-rfr-tile="A02"]'); const detTile2 = await ids();
  await page.selectOption('#rfr-estado', '');
  const a4Todos = await page.evaluate(()=> document.querySelector('#rf-rep-resumen [data-rfr-tile="A04"] .c').textContent);
  await page.selectOption('#rfr-estado', 'CONFIRMADO');
  await page.click('#rf-rep-resumen [data-rfr-ocultar]'); const ocultoBtn = await nTiles() === 0 && await ids() === '';
  await page.click('#rf-rep-resumen [data-rfr-bloque="BLOQUE A"]'); await page.click('#rf-rep-resumen tr[data-rfr-bloque="BLOQUE A"]');
  const ocultoFila = await nTiles() === 0;
  verificar(comprimido && /BLOQUE A 2 de 4 2/.test(vis.bloque) && vis.tabla === 2 && t === '0 1 1 0' && detBlo === 'RF-ADM-00001,RF-ADM-00002' && detTile === 'RF-ADM-00001' && detTile2 === detBlo && a4Todos === '1' && ocultoBtn && ocultoFila,
    `Reporte por bloque comprimido → "${vis.bloque}"; al tocarlo: A01–A04 ${t}, RF ${detBlo}; A02 → ${detTile}; con "Todos" A04 ${a4Todos}; «Ocultar» y tocar de nuevo lo comprimen`);
  await page.click('#rf-rep-tabla [data-rfr-pos="A02"]'); const detPos = await ids();
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_reportes.png'), fullPage: true });
  await page.click('#rf-rep-tabla [data-rfr-ocultar]'); const posOculta = await ids() === '';
  await page.click('#rf-rep-tabla [data-rfr-pos="A02"]'); await page.click('#rf-rep-tabla tr[data-rfr-pos="A02"]'); const posOculta2 = await ids() === '';
  await page.click('#rf-rep-tabla [data-rfr-pos="A02"]');
  await page.click('#rf-rep-tabla [data-rfr-ver="RF-ADM-00001"]');
  await page.waitForFunction(()=> $('rfsub-panel-lista').style.display === 'block' && /RF-ADM-00001/.test(($('rf-detalle').querySelector('h2') || {}).textContent || ''), null, { timeout: 10000 });
  verificar(detPos === 'RF-ADM-00001' && posOculta && posOculta2, `Reporte por posición: A02 → ${detPos}; se oculta con «Ocultar» o tocándola otra vez; clic en un RF abre su detalle`);

  // Layout: gris sin RF, verde con 1, naranja con más de 1; tocar una posición muestra sus RF.
  await cerrarDet(); await page.click('#rfsub-layout');
  await page.waitForSelector('#rfl-mapa .slot[data-id="A02"]', { timeout: 10000 });
  const clases = ()=> page.evaluate(()=> ['A01','A02','A03','A04'].map(c=>{ const el = document.querySelector(`#rfl-mapa .slot[data-id="${c}"]`); return c + ':' + (el.classList.contains('rfl-n') ? 'n' : el.classList.contains('rfl-1') ? '1' : '0'); }).join(' '));
  const lay1 = await clases();
  const resumen1 = await page.evaluate(()=> $('rfl-resumen').innerText.replace(/\s+/g, ' '));
  const color = await page.evaluate(()=> ['A01','A02'].map(c=> getComputedStyle(document.querySelector(`#rfl-mapa .slot[data-id="${c}"]`)).backgroundColor).join(' | '));
  // Un segundo RF confirmado en A02 (solo en memoria) la vuelve naranja y muestra la cantidad.
  await page.evaluate(()=>{ rfLista.push(Object.assign({}, rfLista.find(r=> r.id === 'RF-ADM-00001'), { id:'RF-09999' })); renderRfLayout(); });
  const lay2 = await clases();
  const naranja = await page.evaluate(()=> { const el = document.querySelector('#rfl-mapa .slot[data-id="A02"]'); return el.textContent + ' ' + getComputedStyle(el).backgroundColor; });
  // Tocar la posición abre la ventana del detalle; con varios registros avisa y se recorren uno por uno.
  await page.click('#rfl-mapa .slot[data-id="A02"]');
  await page.waitForFunction(()=> !$('rf-det-modal').hidden && !$('rf-det-grupo').hidden, null, { timeout: 10000 });
  const vistos = [await page.evaluate(()=> ($('rf-detalle').querySelector('h2') || {}).textContent)];
  const grupoLay = await page.evaluate(()=> ({ txt: $('rf-det-grupo').innerText.replace(/\s+/g, ' '), volver: $('btn-rf-det-volver').textContent, ant: document.querySelector('[data-rf-grupo="-1"]').disabled }));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_layout.png'), fullPage: true });
  await page.click('[data-rf-grupo="1"]');
  vistos.push(await page.evaluate(()=> ($('rf-detalle').querySelector('h2') || {}).textContent));
  const ultimo = await page.evaluate(()=> ({ pag: $('rf-det-grupo-txt').textContent, sig: document.querySelector('[data-rf-grupo="1"]').disabled }));
  await page.click('#btn-rf-det-volver');
  const detLay = vistos.slice().sort().join(',');
  const layOculto = await page.evaluate(()=> $('rf-det-modal').hidden && $('rfsub-panel-layout').style.display === 'block');
  verificar(/La posición A02 tiene 2 registros/.test(grupoLay.txt) && /1 de 2/.test(grupoLay.txt) && grupoLay.ant && ultimo.pag === '2 de 2' && ultimo.sig && /Volver al layout/.test(grupoLay.volver) && layOculto,
    `Layout: tocar A02 abre la ventana del registro con el aviso "${grupoLay.txt}"; «Siguiente» pasa al otro (${ultimo.pag}); «← Volver al layout» la cierra`);
  await page.evaluate(()=>{ rfLista = rfLista.filter(r=> r.id !== 'RF-09999'); });
  await page.selectOption('#rfl-estado', '');
  const lay3 = await clases();
  await page.selectOption('#rfl-estado', 'CONFIRMADO');
  const idsDup = await page.evaluate(()=> document.querySelectorAll('#rfl-mapa [id^="slot-"]').length);
  verificar(lay1 === 'A01:0 A02:1 A03:1 A04:0' && /2 con 1 RF 0 con más de 1 2 sin RF/.test(resumen1) && color === 'rgb(228, 230, 234) | rgb(46, 158, 91)' &&
    lay2 === 'A01:0 A02:n A03:1 A04:0' && naranja === '2 rgb(242, 107, 15)' && detLay === 'RF-09999,RF-ADM-00001' && layOculto && lay3 === 'A01:0 A02:1 A03:1 A04:1' && idsDup === 0,
    `Layout: ${lay1} (gris/verde); con 2 RF A02 queda naranja y muestra "2"; al tocarla ${detLay}; con "Todos" ${lay3}`);

  // Modificar un registro confirmado: vuelve a la pantalla de registro y se confirma de nuevo.
  await cerrarDet(); await page.click('#rfsub-lista');
  await page.evaluate(()=> rfAbrir('RF-ADM-00002'));
  // Apto para ajuste: se marca desde el detalle (el admin puede).
  await page.click('#rf-detalle [data-rf-apto="SI"]');
  await page.waitForFunction(()=> /SÍ/.test(($('rf-apto-valor') || {}).textContent || ''), null, { timeout: 10000 });
  const apto = await page.evaluate(async ()=> ({ bd: (await registrosFotoRef.doc('RF-ADM-00002').get()).data(), chip: (document.querySelector('#rf-lista [data-rf-abrir="RF-ADM-00002"] .rf-apto-chip') || {}).textContent || '' }));
  verificar(apto.bd.apto_ajuste === 'SI' && apto.bd.apto_ajuste_por === 'Administrador' && !!apto.bd.apto_ajuste_en && /APTO AJUSTE/.test(apto.chip), `Apto para ajuste: SÍ desde el detalle (queda quién y cuándo; en la lista: "${apto.chip}")`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_apto.png'), fullPage: true });
  const fotoVieja = await page.evaluate(()=> rfLista.find(r=> r.id === 'RF-ADM-00002').items[0].fotos[0].path);
  await page.click('#btn-rf-modificar');
  await page.waitForFunction(()=> $('rfsub-panel-nuevo').style.display === 'block' && !$('rf-form').hidden && $('rf-correlativo').value === 'RF-ADM-00002' && rfItems[0].sku === 'P100', null, { timeout: 15000 });
  const mod = await page.evaluate(async ()=> ({ chip: document.querySelector('.rf-chip-borrador').textContent, btn: $('btn-rf-guardar').textContent, desc: $('btn-rf-descartar').textContent, bd: (await registrosFotoRef.doc('RF-ADM-00002').get()).data() }));
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
  await page.waitForFunction(()=> /RF-ADM-00002\s+modificado/.test($('rf-ok').innerText), null, { timeout: 20000 });
  const tras2 = await page.evaluate(async p=> ({ bd: (await registrosFotoRef.doc('RF-ADM-00002').get()).data(), vieja: await storage.ref().child(p).getMetadata().then(()=> true, ()=> false) }), fotoVieja);
  verificar(sigue && tras2.bd.estado === 'CONFIRMADO' && tras2.bd.items[0].cantidad === 2 && tras2.bd.items[0].fotos.length === 1 && tras2.bd.modificado_por === 'Administrador' && !('modificando' in tras2.bd) && !('respaldo' in tras2.bd) && !tras2.vieja,
    'Confirmar cambios: queda CONFIRMADO con la cantidad nueva y quién lo modificó; la foto quitada se borra recién al confirmar');
  verificar(!('apto_ajuste' in tras2.bd) && !('apto_ajuste_por' in tras2.bd), 'Al modificar un registro, su marca "apto para ajuste" vuelve a quedar sin marcar');
  // Cancelar una modificación deja todo como estaba.
  await cerrarDet(); await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.some(r=> r.id === 'RF-ADM-00002' && r.estado === 'CONFIRMADO'), null, { timeout: 10000 });
  await page.evaluate(()=> rfAbrir('RF-ADM-00002')); await page.click('#btn-rf-modificar');
  await page.waitForFunction(()=> !$('rf-form').hidden && $('rf-correlativo').value === 'RF-ADM-00002', null, { timeout: 15000 });
  await page.click('#rf-items [data-rf-item="0"] [data-rf-paso="1"]'); await page.evaluate(()=> rfGuardarAhora());
  await page.click('#btn-rf-descartar');
  await page.waitForFunction(()=> !rfBorrador && !$('rf-inicio').hidden, null, { timeout: 10000 });
  const canc = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-ADM-00002').get()).data());
  verificar(canc.estado === 'CONFIRMADO' && canc.items[0].cantidad === 2 && !('modificando' in canc) && !('respaldo' in canc), '"↩ Cancelar cambios" deja el RF como estaba confirmado');
  await cerrarDet(); await page.click('#rfsub-lista'); await page.waitForFunction(()=> rfLista.length >= 3, null, { timeout: 10000 });

  // Eliminar (borra también las fotos).
  const paths = await page.evaluate(()=> { const r = rfLista.find(x=> x.id === 'RF-ADM-00001'); return [r.foto_posicion.path, ...r.items.flatMap(it=> it.fotos.map(f=> f.path))]; });
  await page.evaluate(()=> rfAbrir('RF-ADM-00001'));
  await page.click('#btn-rf-eliminar');
  await page.waitForFunction(()=> !rfLista.some(r=> r.id === 'RF-ADM-00001'), null, { timeout: 15000 });
  const quedan = await page.evaluate(async ps=> (await Promise.all(ps.map(p=> storage.ref().child(p).getMetadata().then(()=> 1, ()=> 0)))).reduce((a, b)=> a + b, 0), paths);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^reg_foto/.test(t)).sort().join(','));
  verificar(quedan === 0 && log === 'reg_foto_apto_ajuste,reg_foto_confirmado,reg_foto_confirmado,reg_foto_descartado,reg_foto_eliminado,reg_foto_exportado,reg_foto_exportado,reg_foto_iniciado,reg_foto_iniciado,reg_foto_iniciado,reg_foto_iniciado,reg_foto_modificacion_cancelada,reg_foto_modificado,reg_foto_reabierto,reg_foto_reabierto', `Eliminar borra el registro y sus ${paths.length} fotos; bitácora: ${log}`);
  verificar(!(await page.evaluate(()=> window.__xss || (window.__xssOrigen || []).length)), 'El texto malicioso en la descripción no se ejecutó');

  // Tablet (800 px): el SKU va solo arriba, ancho completo; debajo Cantidad y Descripción en la misma fila.
  const medir = ()=> page.evaluate(()=>{ const it = document.querySelector('#rf-items .rf-item'), r = sel=> it.querySelector(sel).getBoundingClientRect(), ancho = it.getBoundingClientRect().width;
    return { sku: r('.rf-sku-box').width / ancho, skuInput: Math.round(r('[data-rf-campo="sku"]').width), cant: r('.rf-cant'), desc: r('.rf-desc'), skuAbajo: r('.rf-sku-box').bottom, scroll: document.documentElement.scrollWidth }; });
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.evaluate(()=> rfContinuar('RF-ADM-00004')); await page.waitForFunction(()=> !$('rf-form').hidden, null, { timeout: 10000 }); await page.waitForTimeout(300);
  let m = await medir();
  await page.locator('#rf-items').screenshot({ path: path.join(__dirname, 'salida', 'rf_tablet.png') });
  verificar(m.sku > 0.9 && m.skuInput > 550 && Math.abs(m.cant.top - m.desc.top) < 2 && m.cant.top >= m.skuAbajo && m.desc.width > m.cant.width && m.scroll <= 800,
    `Tablet: SKU con su fila completa (${m.skuInput}px) y debajo Cantidad + Descripción`);
  await page.setViewportSize({ width: 390, height: 860 }); await page.waitForTimeout(300);
  m = await medir();
  verificar(m.sku > 0.9 && m.desc.top > m.cant.top && m.cant.width > 300, 'Celular: SKU, Cantidad y Descripción uno debajo del otro, a lo ancho');

  // Celular: sin desplazamiento hacia los lados.
  await page.setViewportSize({ width: 390, height: 860 });
  await page.evaluate(()=> rfContinuar('RF-ADM-00004')); await page.waitForFunction(()=> !$('rf-form').hidden, null, { timeout: 10000 }); await page.waitForTimeout(300);
  const ancho = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_celular.png') });
  await page.click('#rf-pos-fotos .rf-add-foto');
  await page.waitForFunction(()=> !$('cam-modal').hidden && $('cam-video').videoWidth > 0, null, { timeout: 10000 });
  const camW = await page.evaluate(()=> document.querySelector('.cam-caja').getBoundingClientRect().width);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_camara_celular.png') });
  await page.click('#cam-cerrar');
  verificar(ancho <= 390 && camW >= 389, `En celular entra en la pantalla (${ancho}px) y la cámara ocupa toda la pantalla (${Math.round(camW)}px)`);

  // Celular: Reportes comprimidos; un bloque desplegado entra en la pantalla.
  await cerrarDet(); await page.click('#rfsub-reportes');
  await page.waitForSelector('#rf-rep-resumen [data-rfr-bloque="BLOQUE A"]', { timeout: 10000 });
  await page.click('#rf-rep-resumen [data-rfr-bloque="BLOQUE A"]'); await page.evaluate(()=> $('toast-container').innerHTML = ''); await page.waitForTimeout(200);
  const anchoRep = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_reportes_celular.png'), fullPage: true });
  verificar(anchoRep <= 390, `Celular: Reportes con un bloque desplegado entra en la pantalla (${anchoRep}px)`);

  // Ubicación vacía: sin productos pregunta; "No" no confirma; "Sí" guarda sin detalle, marcada como vacía.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(()=> rfContinuar('RF-ADM-00004')); await page.waitForFunction(()=> !$('rf-form').hidden && rfBorrador && rfBorrador.id === 'RF-ADM-00004', null, { timeout: 10000 });
  await page.click('#rf-pos-fotos .rf-add-foto');
  await page.waitForFunction(()=> !$('cam-modal').hidden && $('cam-video').videoWidth > 0 && !$('cam-disparar').disabled, null, { timeout: 10000 });
  await page.click('#cam-disparar');
  await page.waitForFunction(()=> $('cam-modal').hidden || rfPosFotos.length === 1, null, { timeout: 10000 });
  if(await page.evaluate(()=> !$('cam-modal').hidden)) await page.click('#cam-cerrar');
  await page.waitForFunction(()=> rfPosFotos.length === 1 && rfPosFotos[0].path && !rfPosFotos[0].subiendo, null, { timeout: 20000 });
  await page.click('#btn-rf-guardar');
  await page.waitForFunction(()=> !$('rf-aviso').hidden && !$('btn-rf-aviso-no').hidden, null, { timeout: 10000 });
  const preg = await page.evaluate(()=> ({ tit: $('rf-aviso-tit').textContent, txt: $('rf-aviso-txt').textContent, si: $('btn-rf-aviso-ok').textContent, no: $('btn-rf-aviso-no').textContent }));
  await page.click('#btn-rf-aviso-no');
  await page.waitForTimeout(300);
  const trasNo = await page.evaluate(async ()=> ({ estado: (await registrosFotoRef.doc('RF-ADM-00004').get()).data().estado, msg: $('rf-msg').textContent, abierto: !$('rf-form').hidden }));
  await page.click('#btn-rf-guardar');
  await page.waitForFunction(()=> !$('rf-aviso').hidden && !$('btn-rf-aviso-no').hidden, null, { timeout: 10000 });
  await page.click('#btn-rf-aviso-ok');
  await page.waitForFunction(()=> /RF-ADM-00004/.test($('rf-ok').innerText), null, { timeout: 30000 });
  const vac = await page.evaluate(async ()=>{ const d = (await registrosFotoRef.doc('RF-ADM-00004').get()).data(); await rfCargar(true); rfAbrir('RF-ADM-00004');
    return { d, ok: $('rf-ok').innerText, chip: !!document.querySelector('#rf-lista [data-rf-abrir="RF-ADM-00004"] .rf-vacia'), det: $('rf-detalle').innerText }; });
  verificar(preg.tit === '¿La ubicación está vacía?' && /No registraste productos en A04/.test(preg.txt) && /Sí, está vacía/.test(preg.si) && /No, falta registrar/.test(preg.no) &&
    trasNo.estado === 'BORRADOR' && /Registra al menos un producto/.test(trasNo.msg) && trasNo.abierto,
    `Sin productos pregunta "${preg.tit}"; con "No" no se confirma y queda el borrador`);
  verificar(vac.d.estado === 'CONFIRMADO' && vac.d.ubicacion_vacia === true && vac.d.items.length === 0 && vac.d.unidades === 0 && !!vac.d.foto_posicion && /ubicación vacía/.test(vac.ok) && vac.chip && /Ubicación vacía: se registró sin productos/.test(vac.det),
    'Con "Sí, está vacía" se confirma sin detalle (ubicacion_vacia, 0 und, con la foto de la posición); la lista y el detalle lo muestran');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_vacia.png'), fullPage: true });

  // Cambiar solo la posición desde el detalle: no se abre otra pantalla y la marca de apto se mantiene.
  await page.evaluate(async ()=>{ await rfMarcarApto('RF-ADM-00004', 'SI'); setRfSubtab('lista'); });
  await page.waitForFunction(()=> rfLeidos, null, { timeout: 10000 });
  await page.evaluate(()=> rfAbrir('RF-ADM-00004'));
  await page.click('#rf-detalle [data-rf-cambiar-pos]');
  await page.fill('#rf-pos-nueva', 'zz9'); await page.click('#rf-detalle [data-rf-pos-guardar]');
  const malaPos = await page.evaluate(async ()=> ({ bd: (await registrosFotoRef.doc('RF-ADM-00004').get()).data().posicion, sigue: !!$('rf-pos-nueva') }));
  await page.fill('#rf-pos-nueva', 'a01'); await page.press('#rf-pos-nueva', 'Enter');
  await page.waitForFunction(()=> /A01/.test(($('rf-det-pos') || {}).innerText || '') && !$('rf-pos-nueva'), null, { timeout: 10000 });
  const cambioPos = await page.evaluate(async ()=> ({ bd: (await registrosFotoRef.doc('RF-ADM-00004').get()).data(), abierto: !$('rf-det-modal').hidden, pestana: $('rfsub-panel-lista').style.display,
    apto: ($('rf-apto-valor') || {}).textContent }));
  verificar(malaPos.bd === 'A04' && malaPos.sigue && cambioPos.bd.posicion === 'A01' && cambioPos.bd.apto_ajuste === 'SI' && cambioPos.bd.estado === 'CONFIRMADO' && cambioPos.bd.cambios_posicion.length === 1 &&
    cambioPos.bd.cambios_posicion[0].de === 'A04' && cambioPos.bd.posicion_cambiada_por === 'Administrador' && cambioPos.abierto && cambioPos.pestana === 'block' && cambioPos.apto === 'SÍ',
    'Cambiar posición desde el detalle: ZZ9 (fuera del layout) se rechaza; A04 → A01 se guarda ahí mismo, queda quién y cuándo, y el apto para ajuste sigue en SÍ');
  await page.evaluate(()=> rfCerrarDetalle());

  // Layout en celular: con muchos nichos no entra; se puede desplazar de punta a punta y hay zoom.
  await page.evaluate(async ()=>{
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    for(const [i, n] of ['B','C','D','E','F','G','H','I','J','K'].entries()){
      await nichosRef.doc(n).set({ bloque_id:'B1', orden: i + 1, pos_visual: i + 1, tipo:'solo_rack', niveles:2, creado_en: ts });
      for(const [k, nivel] of [['01','arriba'],['02','arriba'],['03','abajo'],['04','abajo']]) await posicionesRef.doc(n + k).set({ tipo:'rack', nicho:n, bloque_id:'B1', nivel, estado:'vacio', bloqueada:false, pallet_codigo:null, actualizado: ts });
    }
  });
  await page.waitForFunction(()=> !!posiciones['K04'], null, { timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 860 });
  await page.evaluate(()=>{ try{ localStorage.removeItem('rf:layout-zoom'); }catch(e){} rflZoom = 1; setRfSubtab('layout'); });
  await page.waitForSelector('#rfl-mapa .slot[data-id="K04"]', { timeout: 10000 });
  await page.waitForTimeout(300);
  const desplaza = await page.evaluate(()=>{
    const m = $('rfl-mapa'), caja = m.getBoundingClientRect(), x = id=> document.querySelector(`#rfl-mapa .slot[data-id="${id}"]`).getBoundingClientRect();
    const r = { desborda: m.scrollWidth > m.clientWidth + 20, inicioDerecha: Math.abs(m.scrollLeft - (m.scrollWidth - m.clientWidth)) < 3, pagina: document.documentElement.scrollWidth };
    m.scrollLeft = 0; const izq = x('K01'); r.izquierdaVisible = izq.left >= caja.left - 1 && izq.right <= caja.right + 1;
    m.scrollLeft = m.scrollWidth; const der = x('A02'); r.derechaVisible = der.right <= caja.right + 1 && der.left >= caja.left - 1;
    return r; });
  await page.click('[data-rfl-zoom="ajustar"]'); await page.waitForTimeout(200);
  const ajuste = await page.evaluate(()=>{ const m = $('rfl-mapa'); return { entra: m.scrollWidth <= m.clientWidth + 2, txt: $('rfl-zoom-txt').textContent, zoom: rflZoom }; });
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_layout_celular.png'), fullPage: true });
  await page.click('[data-rfl-zoom="1"]');
  const mas = await page.evaluate(()=> $('rfl-zoom-txt').textContent);
  verificar(desplaza.desborda && desplaza.inicioDerecha && desplaza.izquierdaVisible && desplaza.derechaVisible && desplaza.pagina <= 390 && ajuste.entra && ajuste.zoom < 1 && /^\d+%$/.test(ajuste.txt) && mas !== ajuste.txt,
    `Layout en celular: abre en el lado derecho, se desliza hasta el primer y el último nicho sin salirse de la página; «Ajustar» lo deja en ${ajuste.txt} y entra completo; «+» lo acerca (${mas})`);
  await page.setViewportSize({ width: 1280, height: 900 });

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
