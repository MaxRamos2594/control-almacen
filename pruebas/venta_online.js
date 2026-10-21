// Campañas → Venta Online: cargar comprobantes de Agencia (boletas/facturas
// electrónicas en PDF) y, en "Subir voucher", el multibuscador, el detalle con
// visor de PDF y la carga de uno o varios vouchers por comprobante.
// Los comprobantes de prueba se generan aquí (sin datos reales).
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
// Comprobante con la misma disposición que los de Bizlinks (coordenadas desde abajo, como el PDF real).
function comprobante({ tipo, nro, nombre, docLabel, doc, fecha, items, total }){
  const pdf = new jsPDF({ unit:'pt', format:'a4' }), H = 842, Y = y=> H - y;
  pdf.setFontSize(8);
  pdf.text('EMPRESA DE PRUEBA SAC', 20, Y(691)); pdf.text('R.U.C.', 396, Y(799)); pdf.text('20000000001', 448, Y(799));
  pdf.text(tipo === 'FACTURA' ? 'FACTURA' : 'BOLETA DE VENTA', 392, Y(776)); pdf.text('ELECTRÓNICA', 409, Y(753)); pdf.text(nro, 408, Y(730));
  pdf.text(tipo === 'FACTURA' ? 'Razón Social:' : 'Nombre/Razón Social:', 20, Y(653)); pdf.text(nombre, 99, Y(653)); pdf.text(docLabel, 306, Y(653)); pdf.text(doc, 418, Y(653));
  pdf.text('Dirección:', 20, Y(638)); pdf.text('Fecha Emisión:', 306, Y(638)); pdf.text(fecha, 418, Y(638));
  pdf.text('Moneda:', 20, Y(623)); pdf.text('Sol', 99, Y(623));
  [['Ítem',24],['Código',56],['Descripción',162],['Und.',276],['Cantidad',305],['V. Unitario',358],['P. Unitario',418],['Descuento',472],['Valor Venta',526]].forEach(([t, x])=> pdf.text(t, x, Y(592)));
  let y = 573;
  items.forEach(([cod, desc, cant, tot], i)=>{ pdf.text(String(i + 1), 30, Y(y)); if(cod) pdf.text(cod, 49, Y(y)); pdf.text(desc, 95, Y(y)); pdf.text('NIU', 277, Y(y)); pdf.text(cant.toFixed(2), 330, Y(y)); pdf.text('0.00', 500, Y(y)); pdf.text(tot.toFixed(2), 556, Y(y)); y -= 13; });
  pdf.text('Op. Gravada', 284, Y(527)); pdf.text('S/', 452, Y(527)); pdf.text('1.00', 556, Y(527));
  pdf.text('Importe Total', 284, Y(449)); pdf.text('S/', 452, Y(449)); pdf.text(total, 556, Y(449));
  pdf.text(`Código Hash: X  20000000001-${nro}`, 20, Y(24));
  const f = path.join(__dirname, 'salida', nro + '.pdf'); fs.writeFileSync(f, Buffer.from(pdf.output('arraybuffer'))); return f;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  const g = await page.evaluate(()=> { const b = $('tab-ventaonline'), grupo = b.closest('.drawer-group');
    return grupo.querySelector('.drawer-group-title').innerText + ': ' + [...grupo.querySelectorAll('button[data-tab]')].map(x=> x.innerText).join(', '); });
  verificar(/^CAMPAÑAS: .*Rótulos PDF, Venta Online$/i.test(g), `"Venta Online" está en el menú, dentro de Campañas: ${g}`);
  await page.click('#btn-menu'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'vo_menu.png'), clip: { x:0, y:0, width:340, height:900 } });
  await page.click('#tab-ventaonline');
  const subs = await page.evaluate(()=> [...document.querySelectorAll('#view-ventaonline .subtabs button')].map(b=> b.innerText.trim()).join(' | ') + (document.querySelector('#view-campanas [id^="campsub-vo-"]') ? ' (sigue en Campañas)' : ''));
  verificar(subs === '🧾 Comprobantes Agencia | 📎 Subir voucher', `Venta Online con sus dos subapartados (${subs}) y ya no dentro de Campañas (PDF)`);

  const b1 = comprobante({ tipo:'BOLETA', nro:'BV01-00000721', nombre:'ANA PRUEBA TORRES', docLabel:'DNI:', doc:'12345678', fecha:'13/10/2026 03:56:27', total:'17.40',
    items: [['08SZ-60337','LUCES CON SENSORES',1,10.59],['0019','CINTA DOBLE CONTACTO/KB-9',1,3.31],['XDYH-0010','LUPA/2XDYH-0010',2,0.85]] });
  const f1 = comprobante({ tipo:'FACTURA', nro:'F001-00000045', nombre:'COMERCIAL EJEMPLO EIRL', docLabel:'RUC:', doc:'20999888777', fecha:'15/10/2026 10:00:00', total:'1,250.00',
    items: [['M161','AUDIFONO BLUT',10,1000]] });
  await page.click('#vosub-cargar');
  await page.setInputFiles('#vo-pdf-input', [b1, f1]);
  await page.click('#btn-vo-procesar');
  await page.waitForFunction(()=> !$('btn-vo-procesar').disabled && $('vo-batch-wrap').style.display === 'block', null, { timeout: 30000 });
  const lote = await page.evaluate(()=> [...document.querySelectorAll('#vo-batch-body tr')].map(r=> [...r.cells].slice(1).map(c=> c.innerText.trim()).join('|')));
  verificar(lote[0] === 'BOLETA|BV01-00000721|13/10/2026 03:56:27|DNI 12345678|ANA PRUEBA TORRES|3|S/ 17.40|AGENCIA|✓ Listo para guardar', `Boleta leída: ${lote[0]}`);
  verificar(lote[1] === 'FACTURA|F001-00000045|15/10/2026 10:00:00|RUC 20999888777|COMERCIAL EJEMPLO EIRL|1|S/ 1,250.00|AGENCIA|✓ Listo para guardar', `Factura leída: ${lote[1]}`);
  await page.click('#btn-vo-guardar');
  await page.waitForFunction(()=> /Guardado! 2 comprobante/.test($('vo-msg').textContent), null, { timeout: 30000 });
  const bd = await page.evaluate(async ()=> (await voComprobantesRef.doc('BV01-00000721').get()).data());
  verificar(bd.canal === 'AGENCIA' && bd.fecha_emision === '2026-10-13' && bd.importe_total === 17.4 && bd.cant_codigos === 3 && bd.unidades === 4 && bd.items[2].codigo === 'XDYH-0010' && /^http/.test(bd.pdf_url),
    `Guardado con canal AGENCIA, fecha ${bd.fecha_emision}, ${bd.cant_codigos} códigos, importe ${bd.importe_total} y su PDF`);
  await page.setInputFiles('#vo-pdf-input', [b1]);
  await page.click('#btn-vo-procesar');
  await page.waitForFunction(()=> !$('btn-vo-procesar').disabled && $('vo-batch-wrap').style.display === 'block', null, { timeout: 30000 });
  verificar(/Ya está cargado \(BV01-00000721\)/.test(await page.textContent('#vo-batch-body')), 'Volver a subir el mismo comprobante avisa que ya está cargado');
  verificar(await page.evaluate(()=> !!document.querySelector('#vo-batch-body tr.vo-dup') && /Duplicado: no se guardará/.test($('vo-batch-body').textContent) && $('btn-vo-guardar').style.display === 'none'),
    'El duplicado sale en rojo y, si no hay nada nuevo, no aparece el botón Guardar');
  // Mismo comprobante dos veces en el lote + otro usuario lo guarda antes de presionar Guardar.
  const b2 = comprobante({ tipo:'BOLETA', nro:'BV01-00000722', nombre:'LUIS PRUEBA', docLabel:'DNI:', doc:'87654321', fecha:'14/10/2026 09:00:00', total:'5.00', items: [['0019','CINTA',1,5]] });
  await page.setInputFiles('#vo-pdf-input', [b2, b2]);
  await page.click('#btn-vo-procesar');
  await page.waitForFunction(()=> !$('btn-vo-procesar').disabled && $('vo-batch-wrap').style.display === 'block', null, { timeout: 30000 });
  verificar(/Repetido en este mismo lote/.test(await page.textContent('#vo-batch-body')) && /1 para guardar, 1 duplicado/.test(await page.textContent('#vo-batch-resumen')), 'El mismo PDF dos veces en el lote: solo uno se guardaría');
  await page.evaluate(()=> voComprobantesRef.doc('BV01-00000722').set({ tipo:'BOLETA', nombre:'CARGADO POR OTRO', estado:'ACTIVO', importe_total:5, vouchers:[] }));
  await page.click('#btn-vo-guardar');
  await page.waitForFunction(()=> /No se guardaron 1 porque ya estaban cargados: BV01-00000722/.test($('vo-msg').textContent), null, { timeout: 30000 });
  const otro = await page.evaluate(async ()=> (await voComprobantesRef.doc('BV01-00000722').get()).data().nombre);
  verificar(otro === 'CARGADO POR OTRO', 'Si otro usuario lo cargó mientras tanto, al guardar no se duplica ni se sobrescribe');
  await page.evaluate(()=> voComprobantesRef.doc('BV01-00000722').delete());
  await page.setInputFiles('#vo-pdf-input', [b1]);
  await page.click('#btn-vo-procesar');
  await page.waitForFunction(()=> !$('btn-vo-procesar').disabled && $('vo-batch-wrap').style.display === 'block', null, { timeout: 30000 });
  await page.locator('#vosub-panel-cargar').screenshot({ path: path.join(__dirname, 'salida', 'vo_cargar.png') });

  // Subir voucher: multibuscador
  await page.click('#vosub-vouchers');
  await page.waitForFunction(()=> document.querySelectorAll('#vo-res .vo-fila').length === 2, null, { timeout: 15000 });
  const buscar = async q=>{ await page.fill('#vo-q', q); await page.waitForTimeout(250); return page.evaluate(()=> [...document.querySelectorAll('#vo-res .vo-fila')].map(b=> b.dataset.voId).join(',')); };
  const casos = [['12345678','BV01-00000721'],['comercial','F001-00000045'],['lupa','BV01-00000721'],['m161','F001-00000045'],['17.40','BV01-00000721'],['1250','F001-00000045'],['15/10/2026','F001-00000045'],['agencia','F001-00000045,BV01-00000721'],['ana boleta','BV01-00000721']];
  const res = [];
  for(const [q, esp] of casos){ const r = await buscar(q); res.push(`${q}→${r}`); if(r !== esp) verificar(false, `Buscar "${q}": ${r} (esperado ${esp})`); }
  verificar(true, `Multibuscador por DNI, nombre, producto, código, importe, fecha, canal y varias palabras: ${res.join(' · ')}`);
  const marca = await page.evaluate(()=> [...document.querySelectorAll('#vo-res mark')].map(m=> m.textContent).join(','));
  verificar(/ANA/.test(marca), `Resalta lo buscado (${marca})`);
  await buscar('');
  await page.click('#vo-seg [data-vo-f="sin"]');
  verificar((await page.evaluate(()=> document.querySelectorAll('#vo-res .vo-fila').length)) === 2, 'Filtro "Sin voucher": los 2');

  // Teclado: ↓ abre el primero
  await page.focus('#vo-q'); await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=> !!document.querySelector('#vo-detalle .vo-visor'), null, { timeout: 5000 });
  await page.waitForFunction(()=> !!document.querySelector('#vo-visor canvas.vo-hoja'), null, { timeout: 15000 });
  let det = await page.evaluate(()=> ({ sel: voSel, iframe: $('vo-visor').dataset.url, nativo: !!document.querySelector('#vo-visor iframe'), datos: $('vo-detalle').innerText }));
  verificar(det.sel === 'F001-00000045' && /^http/.test(det.iframe) && !det.nativo && /COMERCIAL EJEMPLO EIRL/.test(det.datos) && /20999888777/.test(det.datos), `Con ↓ se abre el detalle con el visor del PDF del comprobante (${det.sel})`);

  // Subir 2 vouchers (PDF e imagen)
  const vpdf = path.join(__dirname, 'salida', 'voucher_prueba.pdf'); const vp = new jsPDF(); vp.text('VOUCHER DE PAGO 1250.00', 20, 20); fs.writeFileSync(vpdf, Buffer.from(vp.output('arraybuffer')));
  const vpng = path.join(__dirname, 'salida', 'voucher_prueba.png'); fs.writeFileSync(vpng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await page.setInputFiles('#vo-voucher-input', [vpdf, vpng]);
  await page.waitForFunction(()=> (voLista.find(c=> c.id === 'F001-00000045').vouchers || []).length === 2 && !document.querySelector('#vo-subidas .vo-subiendo'), null, { timeout: 30000 });
  det = await page.evaluate(async ()=> ({ docs: [...document.querySelectorAll('#vo-detalle .vo-doc')].map(d=> d.innerText.replace(/[↗✕]/g, '').replace(/\s+/g, ' ').trim()).join(' | '), img: await new Promise(ok=> { const t0 = Date.now(); (function ver(){ const cv = document.querySelector('#vo-visor canvas.vo-hoja'); if(cv && /voucher_prueba\.png/.test(decodeURIComponent($('vo-visor').dataset.url))) ok(true); else if(Date.now() - t0 > 10000) ok(false); else setTimeout(ver, 100); })(); }),
    bd: (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.map(v=> v.nombre).join(','), fila: document.querySelector('#vo-res [data-vo-id="F001-00000045"]') ? 1 : 0 }));
  verificar(det.bd === 'voucher_prueba.pdf,voucher_prueba.png' && det.docs === '🧾 COMPROBANTE | 📄 VOUCHER 1 | 🖼 VOUCHER 2' && det.img, `2 vouchers subidos y visibles; se muestra el último (${det.docs})`);
  verificar(det.fila === 0, 'Con el filtro "Sin voucher", el que ya tiene voucher sale de la lista');
  await page.click('#vo-seg [data-vo-f="con"]');
  verificar(await buscar('voucher_prueba') === 'F001-00000045', 'Filtro "Con voucher" y búsqueda por nombre del voucher');
  await page.click('#vo-detalle [data-vo-doc="1"]');
  await page.waitForFunction(()=> /voucher/.test(decodeURIComponent($('vo-visor').dataset.url)) && !!document.querySelector('#vo-visor canvas.vo-hoja'), null, { timeout: 15000 });
  verificar(true, 'Clic en un voucher PDF lo muestra en el visor propio (sin depender del visor del navegador)');
  const tam = ()=> page.evaluate(()=> { const cv = document.querySelector('#vo-visor canvas.vo-hoja'); return cv ? [parseFloat(cv.style.width), parseFloat(cv.style.height)] : null; });
  const t0 = await tam();
  await page.click('#vo-detalle [data-vo-girar]'); await page.waitForTimeout(600);
  const t1 = await tam();
  await page.waitForTimeout(800);
  const giroBd = await page.evaluate(async ()=> (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.find(v=> v.nombre === 'voucher_prueba.pdf').giro);
  await page.evaluate(async ()=>{ await voCargar(true); voAbrir('F001-00000045'); voDocSel = 1; renderVoDetalle(); });
  await page.waitForTimeout(800);
  const tR = await tam();
  verificar(giroBd === 90 && tR[0] > tR[1], `El giro queda guardado: al volver a abrir el voucher sigue girado (${giroBd}°)`);
  await page.click('#vo-detalle [data-vo-zoom="+"]'); await page.waitForTimeout(600);
  const t2 = await tam(), zl = await page.textContent('#vo-vb-zoom');
  await page.click('#vo-detalle [data-vo-zoom="fit"]'); await page.waitForTimeout(600);
  verificar(t0[1] > t0[0] && t1[0] > t1[1] && t2[0] > t1[0] * 1.2 && /%$/.test(zl) && (await page.textContent('#vo-vb-zoom')) === 'Ajustado',
    `Visor: girar (${t0.map(Math.round).join('×')} → ${t1.map(Math.round).join('×')}), acercar (${zl}) y ajustar`);
  await page.locator('#vosub-panel-vouchers').screenshot({ path: path.join(__dirname, 'salida', 'vo_vouchers.png') });
  await page.click('#vo-detalle .vo-doc[data-vo-doc="2"] [data-vo-quitar]');
  await page.waitForFunction(()=> (voLista.find(c=> c.id === 'F001-00000045').vouchers || []).length === 1, null, { timeout: 10000 });
  verificar((await page.evaluate(async ()=> (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.length)) === 1, 'Quitar un voucher');
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^vo_/.test(t)).sort().join(','));
  verificar(log === 'vo_comprobante_cargado,vo_comprobante_cargado,vo_voucher_quitado,vo_voucher_subido,vo_voucher_subido', `Bitácora: ${log}`);

  // Reductor de tamaño: un voucher pesado (foto/escaneo en PDF de 2 páginas) se comprime antes de subir.
  const red = await page.evaluate(async ()=>{
    const cv = document.createElement('canvas'); cv.width = 1800; cv.height = 2500; const ctx = cv.getContext('2d'), im = ctx.createImageData(cv.width, cv.height);
    for(let i = 0; i < im.data.length; i += 4){ const v = 120 + Math.random() * 120 | 0; im.data[i] = v; im.data[i+1] = v; im.data[i+2] = v; im.data[i+3] = 255; }
    ctx.putImageData(im, 0, 0); ctx.fillStyle = '#000'; ctx.font = 'bold 120px sans-serif'; ctx.fillText('VOUCHER 1250.00', 200, 400);
    const jpg = cv.toDataURL('image/jpeg', 1);
    const pdf = new jspdf.jsPDF({ unit:'pt', format:'a4' }); pdf.addImage(jpg, 'JPEG', 0, 0, 595, 842); pdf.addPage(); pdf.addImage(jpg, 'JPEG', 0, 0, 595, 842);
    const f = new File([pdf.output('blob')], 'voucher_pesado.pdf', { type:'application/pdf' });
    await voSubirVouchers([f]);
    const v = (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.find(x=> x.nombre === 'voucher_pesado.pdf');
    const doc = await pdfjsLib.getDocument({ data: await (await fetch(v.url)).arrayBuffer() }).promise;
    const chico = new File([new Uint8Array(1000)], 'chico.pdf', { type:'application/pdf' });
    return { antes: f.size, tam: v.tam, orig: v.tam_original, paginas: doc.numPages, intacto: (await voReducir(chico)) === chico };
  });
  verificar(red.orig === red.antes && red.tam < red.antes * 0.6 && red.paginas === 2 && red.intacto,
    `Voucher pesado reducido antes de subir: ${(red.antes/1048576).toFixed(1)} MB → ${(red.tam/1048576).toFixed(2)} MB, ${red.paginas} páginas; uno liviano se sube tal cual`);

  // Permiso "solo Subir voucher" (área comercial), asignado desde Usuarios.
  await page.evaluate(()=> switchTab('usuarios'));
  await page.fill('#us-email', 'comercial@ejemplo.com'); await page.fill('#us-alias', 'comercial');
  await page.click('[data-us-plantilla="comercial"]');
  await page.click('#btn-guardar-usuario');
  await page.waitForFunction(()=> /Permisos guardados/.test($('us-msg').textContent), null, { timeout: 10000 });
  const perm = await page.evaluate(async ()=> (await usuariosRef.doc('comercial@ejemplo.com').get()).data().permisos);
  verificar(perm.venta_online === true && JSON.stringify(perm.subs) === '{"ventaonline":["vosub-vouchers"]}' && !perm.campanas && !perm.rotulos && !perm.admin, 'Usuarios: plantilla "Área comercial" guarda solo Venta Online → Subir voucher');
  await browser.close();

  const com = await abrirApp({ usuario: { email:'comercial@ejemplo.com', pass:'prueba123' } });
  await com.page.waitForFunction(()=> $('view-ventaonline').classList.contains('active') && voLista.length === 2, null, { timeout: 20000 });
  const vista = await com.page.evaluate(()=> ({
    tabs: [...document.querySelectorAll('nav.tabs button[data-tab]')].filter(b=> b.offsetParent).map(b=> b.dataset.tab).join(','),
    subs: [...document.querySelectorAll('#view-ventaonline .subtabs button')].filter(b=> b.offsetParent).map(b=> b.id).join(','),
    panel: $('vosub-panel-vouchers').style.display, otros: $('vosub-panel-cargar').style.display }));
  verificar(vista.tabs === 'ventaonline' && vista.subs === 'vosub-vouchers' && vista.panel === 'block' && vista.otros === 'none',
    `Usuario comercial: solo ve Venta Online → Subir voucher (${vista.tabs} / ${vista.subs})`);
  await com.page.click('#vo-seg [data-vo-f="todos"]');
  await com.page.click('#vo-res [data-vo-id="F001-00000045"]');
  await com.page.waitForFunction(()=> !!document.querySelector('#vo-visor canvas.vo-hoja'), null, { timeout: 15000 });
  const sl = await com.page.evaluate(async ()=>{
   const r = { clave: !document.querySelector('#vo-clave') && /Sin clave/.test(document.querySelector('.vo-clave').innerText), desp: !!document.querySelector('#vo-despacho') || !/Pendiente/.test(document.querySelector('.vo-dato.desp').innerText), drop: !!document.querySelector('#vo-drop, #vo-voucher-input'), quitar: !!document.querySelector('[data-vo-quitar]'), aviso: (document.querySelector('.vo-solo-ver') || {}).innerText || '',
      tabs: [...document.querySelectorAll('#vo-detalle .vo-doc')].map(d=> d.innerText.replace(/[↗✕]/g, '').replace(/\s+/g, ' ').trim()).join(' | ') };
    await voSubirVouchers([new File(['x'], 'x.pdf', { type:'application/pdf' })]);
    r.n = (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.length;
    return r;
  });
  verificar(sl.clave && !sl.desp && !sl.drop && !sl.quitar && /Solo consulta/.test(sl.aviso) && sl.n === 2 && sl.tabs === '🧾 COMPROBANTE | 📄 VOUCHER 1 | 📄 VOUCHER 2',
    `Usuario sin permiso de editar: solo consulta (sin editar despacho, sin zona para subir ni quitar; ${sl.tabs})`);
  await com.page.click('#vo-detalle [data-vo-doc="0"]'); await com.page.click('#vo-detalle [data-vo-girar]'); await com.page.waitForTimeout(1000);
  verificar((await com.page.evaluate(async ()=> (await voComprobantesRef.doc('F001-00000045').get()).data().pdf_giro)) === 90, 'Usuario de solo consulta también puede girar y queda guardado (comprobante)');
  await com.page.screenshot({ path: path.join(__dirname, 'salida', 'vo_comercial.png') });
  errores.push(...com.errores);
  await com.browser.close();

  // Despacho, filtros, paginado de 10 y exportar PDF (como administrador).
  const ad = await abrirApp({ scriptInicial: ()=>{ const W = window.Worker; window.__workers = 0; window.Worker = function(...a){ window.__workers++; return new W(...a); }; window.Worker.prototype = W.prototype; } });
  await ad.page.evaluate(async ()=>{
    const lote = db.batch();
    for(let i = 1; i <= 13; i++){
      const nro = 'BV02-' + String(i).padStart(8, '0');
      lote.set(voComprobantesRef.doc(nro), { tipo:'BOLETA', nro, nombre:'CLIENTE ' + i, doc_tipo:'DNI', doc_numero:String(40000000 + i), fecha_emision:`2026-09-${String(i).padStart(2, '0')}`,
        fecha_texto:'', importe_total: 10 * i, cant_codigos:1, unidades:i, items:[], canal:'AGENCIA', vouchers:[], estado:'ACTIVO', ...(i <= 3 ? { fecha_despacho:`2026-09-2${i}` } : {}) });
    }
    await lote.commit();
    switchTab('ventaonline'); setVoSubtab('vouchers');
  });
  await ad.page.waitForFunction(()=> voLista.length === 15 && document.querySelectorAll('#vo-res .vo-fila').length > 0, null, { timeout: 15000 });
  const pag = ()=> ad.page.evaluate(()=> ({ filas: document.querySelectorAll('#vo-res .vo-fila').length, txt: $('vo-pag-txt').textContent }));
  let pg = await pag();
  verificar(pg.filas === 10 && /1–10 de 15 · página 1 de 2/.test(pg.txt), `Lista paginada de 10 en 10: ${pg.txt}`);
  await ad.page.click('#vo-mas [data-vo-pag="1"]');
  pg = await pag();
  verificar(pg.filas === 5 && /11–15 de 15 · página 2 de 2/.test(pg.txt), `Siguiente página: ${pg.txt}`);
  await ad.page.click('#vo-mas [data-vo-pag="-1"]');
  await ad.page.click('#vo-res [data-vo-id="BV01-00000721"]').catch(()=>{});
  await ad.page.evaluate(()=> voAbrir('BV01-00000721'));
  await ad.page.fill('#vo-despacho', '2026-10-20'); await ad.page.dispatchEvent('#vo-despacho', 'change');
  await ad.page.waitForFunction(()=> /guardada/.test($('vo-desp-ok').textContent), null, { timeout: 10000 });
  const dsp = await ad.page.evaluate(async ()=> ({ bd: (await voComprobantesRef.doc('BV01-00000721').get()).data().fecha_despacho, chip: document.querySelector('#vo-res [data-vo-id="BV01-00000721"] .vo-desp').innerText }));
  verificar(dsp.bd === '2026-10-20' && /20\/10\/2026/.test(dsp.chip), `Fecha de despacho editable en el comprobante y visible en la lista (${dsp.chip})`);
  // Rapidez: varios PDF abiertos usan un solo worker de pdf.js y lo ya visto abre al instante.
  for(const id of ['F001-00000045', 'BV01-00000721', 'F001-00000045', 'BV01-00000721']){
    await ad.page.evaluate(id=> voAbrir(id), id);
    await ad.page.waitForFunction(()=> !!document.querySelector('#vo-visor canvas.vo-hoja'), null, { timeout: 15000 });
  }
  const t0v = Date.now(); await ad.page.evaluate(()=> voAbrir('F001-00000045'));
  await ad.page.waitForFunction(()=> !!document.querySelector('#vo-visor canvas.vo-hoja') && $('vo-visor').dataset.url.includes('F001'), null, { timeout: 15000 });
  const rap = { ms: Date.now() - t0v, workers: await ad.page.evaluate(()=> window.__workers) };
  verificar(rap.workers === 1 && rap.ms < 1500, `Visor rápido: ${rap.workers} worker de pdf.js para todos los PDF; uno ya visto abre en ${rap.ms} ms`);
  await ad.page.evaluate(()=> voAbrir('BV01-00000721'));
  await ad.page.waitForFunction(()=> !!document.querySelector('#vo-clave'), null, { timeout: 15000 });
  await ad.page.fill('#vo-clave', 'ab-4521'); await ad.page.press('#vo-clave', 'Enter');
  await ad.page.waitForFunction(()=> /Clave guardada/.test(($('vo-clave-ok') || {}).textContent || ''), null, { timeout: 10000 });
  const clv = await ad.page.evaluate(async ()=> ({ bd: (await voComprobantesRef.doc('BV01-00000721').get()).data().clave, chip: document.querySelector('#vo-res [data-vo-id="BV01-00000721"] .vo-clave-chip').innerText,
    caja: getComputedStyle($('vo-clave-box')).backgroundColor }));
  verificar(clv.bd === 'AB-4521' && /AB-4521/.test(clv.chip) && clv.caja === 'rgb(223, 255, 0)', `Clave guardada en mayúsculas, a la vista en la lista y en fosforescente (${clv.chip})`);
  await ad.page.fill('#vo-q', 'ab-4521'); await ad.page.waitForTimeout(300);
  verificar((await ad.page.evaluate(()=> voFiltrados().map(c=> c.id).join(','))) === 'BV01-00000721', 'El multibuscador encuentra por clave');
  await ad.page.fill('#vo-q', ''); await ad.page.waitForTimeout(300);
  await ad.page.click('#vo-seg-desp [data-vo-d="con"]');
  let ids = await ad.page.evaluate(()=> voFiltrados().map(c=> c.id).join(','));
  verificar(ids === 'BV01-00000721,BV02-00000003,BV02-00000002,BV02-00000001', `Filtro "Despachados": ${ids}`);
  await ad.page.click('#vo-seg-desp [data-vo-d="todos"]');
  await ad.page.selectOption('#vo-fcampo', 'despacho'); await ad.page.fill('#vo-desde', '2026-09-22'); await ad.page.dispatchEvent('#vo-desde', 'change');
  await ad.page.fill('#vo-hasta', '2026-09-30'); await ad.page.dispatchEvent('#vo-hasta', 'change');
  ids = await ad.page.evaluate(()=> voFiltrados().map(c=> c.id).join(','));
  verificar(ids === 'BV02-00000003,BV02-00000002', `Rango por fecha de despacho (22–30/09): ${ids}`);
  await ad.page.locator('#vosub-panel-vouchers').screenshot({ path: path.join(__dirname, 'salida', 'vo_despacho.png') });
  await ad.page.evaluate(()=>{ $('vo-desde').value = ''; $('vo-hasta').value = ''; $('vo-fcampo').value = 'emision'; voBuscar(); voAbrir('BV01-00000721'); });
  await ad.page.waitForTimeout(500);
  await ad.page.locator('#vosub-panel-vouchers').screenshot({ path: path.join(__dirname, 'salida', 'vo_clave.png') });
  await ad.page.evaluate(()=>{ $('vo-fcampo').value = 'despacho'; $('vo-desde').value = '2026-09-22'; $('vo-hasta').value = '2026-09-30'; voBuscar(); });
  const [descarga] = await Promise.all([ad.page.waitForEvent('download'), ad.page.click('#btn-vo-pdf')]);
  const pdfPath = path.join(__dirname, 'salida', 'vo_export.pdf'); await descarga.saveAs(pdfPath);
  const texto = await ad.page.evaluate(async b64=>{
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise;
    return (await (await d.getPage(1)).getTextContent()).items.map(i=> i.str).join(' ');
  }, fs.readFileSync(pdfPath).toString('base64'));
  verificar(/Despacho: 22\/09\/2026 a 30\/09\/2026/.test(texto) && /BV02-00000003/.test(texto) && /BV02-00000002/.test(texto) && !/BV02-00000001/.test(texto) && /F\. despacho/.test(texto) && /Clave/.test(texto) && /CLIENTE 3/.test(texto) && /2 comprobante/.test(texto),
    'Exportar PDF: solo lo filtrado, con los filtros y las mismas columnas de la lista');
  // Link público para el cliente: solo se copia con el botón y queda como "enviado".
  await ad.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5055' });
  await ad.page.evaluate(()=>{ $('vo-desde').value = ''; $('vo-hasta').value = ''; $('vo-fcampo').value = 'emision'; voBuscar(); voAbrir('BV01-00000721'); });
  await ad.page.waitForFunction(()=> !!document.querySelector('#btn-vo-link'), null, { timeout: 10000 });
  let lk = await ad.page.evaluate(()=>{ const ev = new ClipboardEvent('copy', { bubbles:true, cancelable:true }); $('vo-link-url').dispatchEvent(ev);
    return { bloqueado: ev.defaultPrevented, sel: getComputedStyle($('vo-link-url')).userSelect, est: $('vo-link-box').innerText }; });
  verificar(lk.bloqueado && lk.sel === 'none' && /Aún no enviado/.test(lk.est), 'Link debajo de la clave: no se puede seleccionar ni copiar con Ctrl+C');
  await ad.page.click('#btn-vo-link');
  await ad.page.waitForFunction(()=> /Enviado el/.test(($('vo-link-box') || {}).innerText || ''), null, { timeout: 10000 });
  lk = await ad.page.evaluate(async ()=>{ const c = (await voComprobantesRef.doc('BV01-00000721').get()).data();
    return { clip: await navigator.clipboard.readText(), c, chip: !!document.querySelector('#vo-res [data-vo-id="BV01-00000721"] .vo-link-chip'), pub: (await voPublicoRef.doc(c.link_token).get()).data() }; });
  verificar(lk.clip === `http://127.0.0.1:5055/?envio=${lk.c.link_token}` && lk.c.link_token.length === 32 && lk.c.link_enviado === true && lk.c.link_copias === 1 && lk.chip && lk.pub.clave === 'AB-4521',
    `Botón "Copiar link": copia el link (código de ${lk.c.link_token.length} caracteres) y marca "Link enviado"`);
  await ad.page.click('#btn-vo-link'); await ad.page.waitForTimeout(800);
  const copias = await ad.page.evaluate(async ()=> (await voComprobantesRef.doc('BV01-00000721').get()).data().link_copias);
  await ad.page.selectOption('#vo-link-f', 'enviado');
  const envs = await ad.page.evaluate(()=> voFiltrados().map(c=> c.id).join(','));
  await ad.page.selectOption('#vo-link-f', 'pendiente');
  const pends = await ad.page.evaluate(()=> voFiltrados().length);
  verificar(copias === 2 && envs === 'BV01-00000721' && pends === 14, `Filtro de link: enviados ${envs} · por enviar ${pends} · copias ${copias}`);
  await ad.page.selectOption('#vo-link-f', '');
  await ad.page.locator('#vo-detalle').screenshot({ path: path.join(__dirname, 'salida', 'vo_link.png'), clip: undefined }).catch(()=>{});
  await ad.page.evaluate(()=> voAbrir('BV01-00000721')); await ad.page.waitForTimeout(400);
  await ad.page.screenshot({ path: path.join(__dirname, 'salida', 'vo_link.png') });
  // El cliente abre el link sin iniciar sesión.
  const pub = await (await ad.browser.newContext({ viewport:{ width: 430, height: 900 } })).newPage();
  await pub.goto(lk.clip);
  await pub.waitForFunction(()=> !!document.querySelector('#vo-publico canvas.vo-hoja'), null, { timeout: 20000 });
  const vpub = await pub.evaluate(async ()=> {
    let lista = 'permitido'; try{ await voPublicoRef.get(); }catch(e){ lista = 'bloqueado'; }
    let privado = 'permitido'; try{ await voComprobantesRef.doc('BV01-00000721').get(); }catch(e){ privado = 'bloqueado'; }
    return { txt: $('vo-publico').innerText, login: getComputedStyle($('login-screen')).display, sesion: !!auth.currentUser, lista, privado };
  });
  verificar(/BV01-00000721/.test(vpub.txt) && /AB-4521/.test(vpub.txt) && /20\/10\/2026/.test(vpub.txt) && /COMPROBANTE/.test(vpub.txt) && vpub.login === "none" && !vpub.sesion,
    'El cliente abre el link sin iniciar sesión: ve N°, clave, fecha de despacho y sus documentos');
  verificar(vpub.lista === "bloqueado" && vpub.privado === "bloqueado", 'Seguro: sin sesión no se puede listar los links ni leer los datos internos');
  await pub.screenshot({ path: path.join(__dirname, 'salida', 'vo_link_cliente.png'), fullPage: true });
  await pub.goto('http://127.0.0.1:5055/?envio=noexiste123');
  await pub.waitForFunction(()=> /Enlace no válido/.test($('vo-publico').innerText), null, { timeout: 10000 });
  verificar(true, 'Un link inventado muestra "Enlace no válido"');
  errores.push(...ad.errores);
  await ad.browser.close();

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
