// Recepciones: guía de remisión en PDF → recepción RC-… → validar cantidades recibidas con foto → confirmar →
// Registros con detalle, PDF / impresión y Excel. Cada usuario ve solo las suyas (también en las reglas).
// La guía de prueba se arma con la misma disposición que las de Bizlinks (no se usan archivos reales).
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { jsPDF } = require('jspdf');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
async function esperar(page, fn, arg, ms){
  const fin = Date.now() + ms;
  while(Date.now() < fin){ if(await page.evaluate(fn, arg)) return; await new Promise(r=> setTimeout(r, 300)); }
  throw new Error('Tiempo agotado esperando: ' + fn.toString().slice(0, 120));
}
const listo = page=> page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
const salida = path.join(__dirname, 'salida'), png = path.join(salida, 'rc_foto.png');

// Guía de remisión remitente con la misma disposición que las de Bizlinks (coordenadas como el PDF real).
function guia(nro, items){
  const pdf = new jsPDF({ unit:'pt', format:'a4' }); let y = 40;
  const t = (txt, x, yy)=> pdf.text(txt, x, yy);
  pdf.setFontSize(8);
  t('R.U.C N° 20000000001', 382, y); t('EMPRESA DE PRUEBA', 50, y += 14); t('GUÍA DE REMISIÓN', 389, y); t('ELECTRÓNICA', 406, y += 12); t('REMITENTE', 416, y += 12); t(nro, 398, y += 12);
  y += 20; t('Nombre/Razon Social:', 50, y); t('Empresa de Prueba Sac', 136, y); t('RUC:', 307, y); t('20000000001', 393, y);
  y += 14; t('Fecha Emisión:', 50, y); t('15/11/2026', 136, y); t('Fecha Traslado:', 307, y); t('16/11/2026', 393, y);
  y += 14; t('Punto de Partida:', 50, y); t('ALMACEN CENTRAL', 136, y); t('Punto de Llegada:', 307, y); t('Calle Prueba 123, Lima,', 393, y);
  y += 12; t('AV. PRUEBA KM8, VENTANILLA,', 136, y); t('Lima, Peru (Código: 0005)', 393, y);
  y += 12; t('CALLAO, Peru (Código: 0006)', 136, y);
  y += 14; t('Motivo de Traslado:', 50, y); t('Traslado entre establecimientos de la misma', 136, y); t('Modalidad de Traslado:', 307, y); t('Transporte privado', 393, y);
  y += 12; t('empresa', 136, y);
  y += 14; t('Peso:', 50, y); t('1.00 KG', 136, y);
  y += 14; t('RUC Destinatario:', 50, y); t('20000000001', 136, y); t('Razón Social', 307, y); t('Empresa de Prueba Sac', 393, y);
  y += 12; t('Destinatario:', 307, y);
  y += 20; [['Item', 57], ['Codigo', 101], ['Descripcion', 152], ['Unidad', 421], ['Cantidad', 480]].forEach(([s, x])=> t(s, x, y));
  items.forEach(([cod, desc, cant], i)=>{ y += 14; t(String(i + 1), 63, y); t(cod, 99, y); t(desc, 152, y); t('NIU', 429, y); t(cant.toFixed(2), 515, y); });
  y += 24; t('Datos del Vehiculo y Conductor', 50, y); t('PRINCIPAL', 55, y += 12);
  y += 12; t('Placa:', 55, y); t('ABC123', 250, y); y += 12; t('Nombres y Apellidos:', 55, y); t('Conductor de Prueba', 250, y);
  y += 20; t('Observaciones', 50, y); y += 12; t('Se traslada 2 cantidad de bultos. Traslado TRF-2026-00001 - Punto de emision: POS-PRUEBA', 50, y);
  const f = path.join(salida, nro + '.pdf'); fs.writeFileSync(f, Buffer.from(pdf.output('arraybuffer'))); return f;
}

(async ()=>{
  await limpiarEmuladores();
  fs.mkdirSync(salida, { recursive: true });
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const g1 = guia('TG04-00000901', [['MEDTL01', 'MEDIA ANTIDESLIZANTE TALLA L', 10], ['P200', 'PELOTA DE PRUEBA', 5]]);
  const g2 = guia('TG04-00000902', [['P300', 'CAJA DE PRUEBA', 3]]);
  let { browser, page, errores } = await abrirApp();
  await listo(page);
  await page.evaluate(async ()=> usuariosRef.doc('yolanda@ejemplo.com').set({ email:'yolanda@ejemplo.com', alias:'YOLANDA', permisos:{ recepciones:true } }));
  const grupo = await page.evaluate(()=>{ const g = $('tab-recepciones').closest('.drawer-group'); return g.querySelector('.drawer-group-title').innerText + ': ' + [...g.querySelectorAll('button[data-tab]')].map(b=> b.innerText).join(', '); });
  verificar(/PRODUCTOS E INVENTARIO: .*Saldos, Kardex, Merma, Recepciones$/i.test(grupo), `"Recepciones" en el menú: ${grupo}`);
  await page.click('#btn-menu'); await page.click('#tab-recepciones');

  // 1) Leer dos guías a la vez: una recepción por guía, con cabecera y detalle.
  await page.setInputFiles('#rc-pdf-input', [g1, g2]);
  await page.click('#btn-rc-leer');
  await page.waitForFunction(()=> /recepción\(es\) creada/.test($('rc-msg').textContent), null, { timeout: 60000 });
  const res1 = await page.evaluate(()=> $('rc-resultado').innerText.replace(/\s+/g, ' '));
  const d1 = await page.evaluate(async ()=> (await recepcionesRef.doc('RC-00001').get()).data());
  await page.screenshot({ path: path.join(salida, 'rc_carga.png'), fullPage: true });
  verificar(/RC-00001 · guía TG04-00000901 · 2 producto\(s\) · 15 und/.test(res1) && /RC-00002 · guía TG04-00000902 · 1 producto\(s\) · 3 und/.test(res1),
    `Dos guías → dos recepciones: ${res1}`);
  verificar(d1.estado === 'PENDIENTE' && d1.nro_guia === 'TG04-00000901' && d1.fecha_emision === '2026-11-15' && d1.fecha_traslado === '2026-11-16' && d1.remitente === 'Empresa de Prueba Sac' && d1.ruc_remitente === '20000000001' &&
    /ALMACEN CENTRAL AV\. PRUEBA KM8/i.test(d1.punto_partida) && /CALLE PRUEBA 123/i.test(d1.punto_llegada) && d1.motivo === 'Traslado entre establecimientos de la misma empresa' && d1.modalidad === 'Transporte privado' &&
    d1.destinatario === 'Empresa de Prueba Sac' && d1.placa === 'ABC123' && d1.conductor === 'Conductor de Prueba' && d1.bultos === 2 && /TRF-2026-00001/.test(d1.observaciones) &&
    d1.items.map(it=> `${it.codigo}:${it.cantidad_guia}:${it.cantidad_recibida}`).join() === 'MEDTL01:10:10,P200:5:5' && d1.unidades_guia === 15 && /^recepciones\/RC-00001\/guia_/.test(d1.guia_pdf.path) && d1.usuario === 'Administrador',
    `Cabecera y detalle leídos: emisión ${d1.fecha_emision}, traslado ${d1.fecha_traslado}, ${d1.remitente}, motivo "${d1.motivo}", ${d1.placa} · ${d1.conductor}, bultos ${d1.bultos}; ${d1.items.map(it=> it.codigo + ' ' + it.cantidad_guia).join(', ')}; guía guardada en ${d1.guia_pdf.path}`);
  // La misma guía otra vez: no se carga dos veces.
  await page.setInputFiles('#rc-pdf-input', [g1]);
  await page.click('#btn-rc-leer');
  await page.waitForFunction(()=> /guía\(s\) con problema|0 recepción/.test($('rc-msg').textContent), null, { timeout: 30000 });
  const dup = await page.evaluate(()=> $('rc-resultado').innerText);
  verificar(/ya se cargó en RC-00001/.test(dup), `La misma guía no se carga dos veces: "${dup.trim()}"`);

  // 2) Validar RC-00001: 8 de 10 (falta 2), 0 de P200 (no pide foto); sin foto no confirma.
  await page.click('[data-rc-validar="RC-00001"]');
  await page.waitForSelector('#rc-form .rc-item', { timeout: 10000 });
  await page.fill('[data-rc-cant="0"]', '8'); await page.fill('[data-rc-cant="1"]', '0');
  const difs = await page.evaluate(()=> [...document.querySelectorAll('#rc-form .rc-dif')].map(x=> x.textContent).join(' | '));
  await page.click('[data-rc-confirmar]');
  const sinFoto = await page.evaluate(()=> $('rc-form-msg').textContent);
  await page.click('#btn-rf-aviso-ok').catch(()=>{});
  await page.click('[data-rc-foto="0"]');
  await page.waitForFunction(()=> !$('cam-modal').hidden, null, { timeout: 5000 });
  await page.setInputFiles('#cam-file', [png]);
  await page.waitForFunction(()=> rcActual && rcActual.items[0].fotos.length === 1 && rcActual.items[0].fotos[0].path, null, { timeout: 15000 });
  await page.click('#cam-cerrar');
  await page.screenshot({ path: path.join(salida, 'rc_validar.png'), fullPage: true });
  await page.click('[data-rc-confirmar]');
  await page.waitForFunction(()=> !$('rc-ok').hidden && /RC-00001/.test($('rc-ok').textContent), null, { timeout: 15000 });
  const c1 = await page.evaluate(async ()=> (await recepcionesRef.doc('RC-00001').get()).data());
  verificar(/Faltan 2/.test(difs) && /Faltan 5/.test(difs) && /falta la foto/.test(sinFoto) && !/P200: falta la foto/.test(sinFoto),
    `Diferencias al escribir (${difs}); sin foto no confirma ("${sinFoto.slice(0, 90)}…"); con 0 no pide foto`);
  verificar(c1.estado === 'CONFIRMADA' && c1.confirmado_por === 'Administrador' && !!c1.confirmado_en && c1.items.map(it=> `${it.codigo}:${it.cantidad_recibida}:${it.fotos.length}`).join() === 'MEDTL01:8:1,P200:0:0' &&
    c1.unidades_recibidas === 8 && c1.con_diferencia === 2,
    `Confirmada por ${c1.confirmado_por}: ${c1.items.map(it=> `${it.codigo} ${it.cantidad_recibida}/${it.cantidad_guia}`).join(', ')} · ${c1.con_diferencia} con diferencia`);

  // 3) Registros: lista, filtro con diferencias, detalle, PDF, impresión y Excel.
  await page.click('[data-rc-ver-reg="RC-00001"]');
  await page.waitForFunction(()=> !$('rc-det-modal').hidden, null, { timeout: 10000 });
  const det = await page.evaluate(()=> $('rc-detalle').innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(salida, 'rc_detalle.png'), fullPage: true });
  const pdf = await page.evaluate(async ()=>{
    const { jsPDF } = window.jspdf, orig = jsPDF.API.save; let b64 = '', nombre = '';
    jsPDF.API.save = function(n){ nombre = n; b64 = this.output('datauristring').split(',')[1]; };
    try{ document.querySelector('[data-rc-det-pdf]').click(); for(let i = 0; i < 100 && !b64; i++) await new Promise(r=> setTimeout(r, 200)); } finally { jsPDF.API.save = orig; }
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; let txt = '', fotos = 0;
    for(let i = 1; i <= d.numPages; i++){ const pg = await d.getPage(i); txt += (await pg.getTextContent()).items.map(x=> x.str).join(' ') + ' '; fotos += (await pg.getOperatorList()).fnArray.filter(f=> f === pdfjsLib.OPS.paintImageXObject || f === pdfjsLib.OPS.paintJpegXObject).length; }
    const v = (await d.getPage(1)).getViewport({ scale: 1.5 }), cv = document.createElement('canvas'); cv.width = v.width; cv.height = v.height; await (await d.getPage(1)).render({ canvasContext: cv.getContext('2d'), viewport: v }).promise;
    window.__rcNoImprimir = true; document.querySelector('[data-rc-det-imprimir]').click(); for(let i = 0; i < 50 && !window.__rcImpreso; i++) await new Promise(r=> setTimeout(r, 200));
    return { nombre, txt, fotos, png: cv.toDataURL('image/png').split(',')[1], imprime: /^blob:/.test(window.__rcImpreso || '') };
  });
  fs.writeFileSync(path.join(salida, 'rc_pdf.png'), Buffer.from(pdf.png, 'base64'));
  verificar(/Guía de remisión TG04-00000901/i.test(det) && /MEDTL01/.test(det) && /Faltan 2/.test(det) && /Confirmada por Administrador/i.test(det),
    `Detalle de la recepción: "${det.slice(0, 120)}…"`);
  verificar(pdf.nombre === 'recepcion_RC-00001.pdf' && /Recepción RC-00001/.test(pdf.txt) && /TG04-00000901/.test(pdf.txt) && /Faltan 2/.test(pdf.txt) && /TOTAL\s+15\s+8/.test(pdf.txt) && /Recibido por \(firma\)/.test(pdf.txt) && pdf.fotos >= 1 && pdf.imprime,
    `PDF de la recepción (${pdf.nombre}, ${pdf.fotos} foto(s)) e «🖨 Imprimir» abre el PDF para imprimir`);
  await page.evaluate(()=> rcCerrarDetalle());
  await page.selectOption('#rc-dif-f', 'SI');
  const filtrado = await page.evaluate(()=> [...document.querySelectorAll('#rc-lista [data-rc-abrir]')].map(b=> b.dataset.rcAbrir).join());
  await page.selectOption('#rc-dif-f', '');
  const todas = await page.evaluate(()=> ({ ids: [...document.querySelectorAll('#rc-lista [data-rc-abrir]')].map(b=> b.dataset.rcAbrir).join(), res: $('rc-lista-res').textContent }));
  await page.screenshot({ path: path.join(salida, 'rc_registros.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-rc-excel')]);
  const xl = path.join(salida, 'recepciones.xlsx'); await dl.saveAs(xl);
  const wb = XLSX.readFile(xl), h1 = XLSX.utils.sheet_to_json(wb.Sheets['Recepciones']), h2 = XLSX.utils.sheet_to_json(wb.Sheets['Detalle']);
  verificar(filtrado === 'RC-00001' && todas.ids === 'RC-00002,RC-00001' && /2 recepción\(es\)/.test(todas.res) && h1.length === 2 && h2.length === 3 &&
    h2.some(x=> x['Código'] === 'MEDTL01' && x['Cantidad recibida'] === 8 && x['Diferencia'] === -2) && h1.some(x=> x['Recepción'] === 'RC-00001' && x['Estado'] === 'CONFIRMADA' && x['Confirmada por'] === 'Administrador'),
    `Registros: ${todas.ids} (${todas.res}); "Con diferencias" → ${filtrado}; Excel con ${h1.length} recepciones y ${h2.length} filas de detalle`);

  // 4) Descartar una por validar: se borra y la guía se puede volver a cargar.
  await page.click('#rcsub-nueva');
  await page.click('[data-rc-validar="RC-00002"]');
  await page.waitForSelector('[data-rc-descartar]', { timeout: 10000 });
  await page.click('[data-rc-descartar]');
  await esperar(page, async ()=> !(await recepcionesRef.doc('RC-00002').get()).exists && !(await recepcionesGuiasRef.doc('TG04-00000902').get()).exists, null, 10000);
  await page.setInputFiles('#rc-pdf-input', [g2]);
  await page.click('#btn-rc-leer');
  await page.waitForFunction(()=> /1 recepción\(es\) creada/.test($('rc-msg').textContent), null, { timeout: 30000 });
  const otraVez = await page.evaluate(()=> $('rc-resultado').innerText.replace(/\s+/g, ' '));
  verificar(/RC-00003 · guía TG04-00000902/.test(otraVez), `Descartar borra la recepción y la guía se puede volver a cargar: ${otraVez}`);
  verificar(!errores.length, 'Sin errores de JavaScript (admin)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  // 5) Otro usuario (solo permiso Recepciones): no ve las del administrador (tampoco leyendo directo).
  ({ browser, page, errores } = await abrirApp({ usuario: { email: 'yolanda@ejemplo.com', pass: 'prueba123' } }));
  await listo(page);
  await page.waitForFunction(()=> $('view-recepciones').classList.contains('active'), null, { timeout: 10000 });
  await page.click('#rcsub-lista');
  await page.waitForFunction(()=> rcLeidos, null, { timeout: 10000 });
  const yo = await page.evaluate(async ()=> ({ n: rcLista.length, txt: $('rc-lista').innerText.trim(), regla: await recepcionesRef.doc('RC-00001').get().then(()=> 'leyó', e=> e.code) }));
  verificar(yo.n === 0 && /Aún no hay recepciones/.test(yo.txt) && yo.regla === 'permission-denied', `Otro usuario entra directo a Recepciones y no ve las del administrador (reglas: ${yo.regla})`);
  verificar(!errores.length, 'Sin errores de JavaScript (usuario)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
