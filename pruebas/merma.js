// Merma: traslado de merma por cajas (Productos e inventario → Merma).
// Tienda + fecha de hoy → crear caja (CM-00001) → productos como en el registro fotográfico → otra caja →
// cerrar traslado (bultos = cajas) → se ve en Registros. Cada usuario ve solo lo suyo (también en las reglas).
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { abrirApp, limpiarEmuladores, ADMIN } = require('./app');

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
const YOLANDA = { email: 'yolanda@ejemplo.com', pass: 'prueba123' };
const listo = page=> page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
const png = path.join(__dirname, 'salida', 'sd_foto.png');

(async ()=>{
  await limpiarEmuladores();
  fs.mkdirSync(path.join(__dirname, 'salida'), { recursive: true });
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  let { browser, page, errores } = await abrirApp();
  await listo(page);
  await page.evaluate(async ()=>{
    await participantesMaestroRef.doc('COMAS').set({ nombre:'COMAS' });
    await productosRef.doc('P100').set({ descripcion:'PELOTA ROJA', costo: 1 });
    await usuariosRef.doc('yolanda@ejemplo.com').set({ email:'yolanda@ejemplo.com', alias:'YOLANDA', permisos:{ merma:true } });
  });
  await page.waitForFunction(()=> !!productos['P100'], null, { timeout: 10000 });

  // Menú: Merma dentro de "Productos e inventario".
  const grupo = await page.evaluate(()=>{ const g = $('tab-merma').closest('.drawer-group'); return g.querySelector('.drawer-group-title').innerText + ': ' + [...g.querySelectorAll('button[data-tab]')].map(b=> b.innerText).join(', '); });
  await page.click('#btn-menu'); await page.click('#tab-merma');
  await page.waitForFunction(()=> [...$('mm-tienda').options].some(o=> o.value === 'COMAS'), null, { timeout: 10000 });
  const hoy = await page.evaluate(()=> mmHoy() === $('mm-fecha').value && $('mm-fecha').value);
  verificar(/PRODUCTOS E INVENTARIO: .*Saldos, Kardex, Merma$/i.test(grupo) && !!hoy, `Opción "Merma" en ${grupo}; la fecha por defecto es hoy (${hoy})`);

  // Recargar la página estando en Merma: tiendas y fecha se llenan solas (antes quedaban vacías).
  await page.reload();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo' && $('view-merma').classList.contains('active'), null, { timeout: 20000 });
  const recarga = await page.waitForFunction(()=> [...$('mm-tienda').options].some(o=> o.value === 'COMAS') && $('mm-fecha').value === mmHoy(), null, { timeout: 10000 }).then(()=> true, ()=> false);
  verificar(recarga, 'Al recargar la página estando en Merma, la lista de tiendas y la fecha de hoy se llenan solas');
  // 1-2) Tienda + fecha → iniciar traslado.
  await page.selectOption('#mm-tienda', 'COMAS');
  await page.click('#btn-mm-iniciar');
  await page.waitForFunction(()=> !$('mm-form').hidden && $('mm-bar-corr').textContent === 'TM-00001', null, { timeout: 10000 });
  // 3) Crear caja → correlativo CM-00001.
  await page.click('#btn-mm-caja');
  await page.waitForFunction(()=> $('mm-caja-tit').textContent.includes('CM-00001') && document.activeElement.dataset.mmCampo === 'sku', null, { timeout: 10000 });
  // 4) Producto como en el registro fotográfico: SKU (autocompleta la descripción), cantidad, foto.
  const producto = async (i, sku, cant, desc)=>{
    await page.fill(`#mm-items [data-mm-item="${i}"] [data-mm-campo="sku"]`, sku);
    if(desc) await page.fill(`#mm-items [data-mm-item="${i}"] [data-mm-campo="descripcion"]`, desc);
    await page.fill(`#mm-items [data-mm-item="${i}"] [data-mm-campo="cantidad"]`, String(cant));
    await page.press(`#mm-items [data-mm-item="${i}"] [data-mm-campo="cantidad"]`, 'Enter');   // Enter abre la cámara
    await page.waitForFunction(()=> !$('cam-modal').hidden, null, { timeout: 10000 });
    await page.setInputFiles('#cam-file', [png]);
    await page.waitForFunction(i=> mmCaja().items[i].fotos.length === 1, i, { timeout: 10000 });
    await page.click('#cam-cerrar');
    await page.waitForFunction(i=> mmCaja().items.length === i + 2, i, { timeout: 5000 });   // aparece el siguiente en blanco
  };
  await producto(0, 'P100', 5);
  const desc1 = await page.evaluate(()=> mmCaja().items[0].descripcion);
  // Cerrar caja: queda en solo lectura, con su estado guardado.
  await page.click('#btn-mm-caja-cerrar');
  await page.waitForFunction(()=> mmCajas[0].cerrada && !$('btn-mm-caja-abrir').hidden, null, { timeout: 10000 });
  const cerrada = await page.evaluate(async ()=> ({ chip: document.querySelector('#mm-cajas [data-mm-caja="0"]').innerText.replace(/\s+/g, ' '), lect: !document.querySelector('#mm-items [data-mm-campo]') && /Caja cerrada/.test($('mm-items').innerText),
    add: $('btn-mm-add').hidden, est: (await mermaCajasRef.doc('CM-00001').get()).data().estado }));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'merma_caja_cerrada.png'), fullPage: true });
  verificar(/CERRADA/.test(cerrada.chip) && cerrada.lect && cerrada.add && cerrada.est === 'CERRADA', `"🔒 Cerrar caja": ${cerrada.chip}; queda en solo lectura (estado ${cerrada.est})`);
  // 5) Otra caja.
  await page.click('#btn-mm-caja');
  await page.waitForFunction(()=> $('mm-caja-tit').textContent.includes('CM-00002'), null, { timeout: 10000 });
  // Caja vacía: no deja crear otra.
  await page.click('#btn-mm-caja');
  await page.waitForFunction(()=> !$('rf-aviso').hidden, null, { timeout: 5000 });
  const avisoVacia = await page.textContent('#rf-aviso-tit'); await page.click('#btn-rf-aviso-ok');
  await page.waitForFunction(()=> document.activeElement.dataset.mmCampo === 'sku', null, { timeout: 3000 });   // al cerrar el aviso, el cursor va al SKU
  // Sin descripción (código que no está en Productos): no está completo.
  await page.fill('#mm-items [data-mm-item="0"] [data-mm-campo="sku"]', 'X-9');
  await page.fill('#mm-items [data-mm-item="0"] [data-mm-campo="cantidad"]', '2');
  await page.click('#btn-mm-add');
  await page.waitForFunction(()=> !$('rf-aviso').hidden, null, { timeout: 5000 });
  const avisoDesc = await page.textContent('#rf-aviso-txt'); await page.click('#btn-rf-aviso-ok');
  await page.waitForFunction(()=> document.activeElement.dataset.mmCampo === 'descripcion', null, { timeout: 3000 });
  await producto(0, 'X-9', 2, 'CAJA AZUL');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'merma_nuevo.png'), fullPage: true });
  const chips = await page.evaluate(()=> [...document.querySelectorAll('#mm-cajas .mm-caja-chip')].map(b=> b.innerText.replace(/\s+/g, ' ')).join(' | '));
  const resumen = await page.textContent('#mm-resumen');
  // Nuevo traslado: conteo de ítems (códigos distintos) junto a los bultos.
  const itemsNuevo = await page.evaluate(()=> [$('mm-contador-it').innerText, $('mm-contador-it3').innerText].map(t=> t.replace(/\s+/g, ' ').trim()).join(' | '));
  verificar(itemsNuevo === '🧾 Ítems: 2 | 🧾 Ítems: 2', `Nuevo traslado muestra el conteo de ítems (${itemsNuevo})`);
  const contador = await page.evaluate(()=> [$('mm-contador').innerText, $('mm-contador2').innerText, $('mm-contador3').innerText].map(t=> t.replace(/\s+/g, ' ').trim()).join(' | '));
  const centrado = await page.evaluate(()=> ['sku', 'descripcion'].map(k=> getComputedStyle(document.querySelector(`#mm-items [data-mm-campo="${k}"]`)).textAlign).join());
  verificar(contador === '📦 Bultos: 2 | 📦 2 bultos | 📦 Bultos: 2' && centrado === 'center,center', `Contador de bultos visible (${contador}); código y descripción centrados`);
  verificar(desc1 === 'PELOTA ROJA' && /está vacía/.test(avisoVacia) && /falta la descripción/.test(avisoDesc) && /CM-00001 1 producto\(s\) · 5 und 🔒 CERRADA 🔓 Abrir caja \| .*CM-00002 1 producto\(s\) · 2 und ✏ ABIERTA 🔒 Cerrar caja/.test(chips) && /2 caja\(s\) = 2 bulto\(s\) \(1 cerrada\(s\)\)/.test(resumen),
    `Cajas: ${chips}; "${resumen}"; caja vacía → "${avisoVacia}"; sin descripción → "${avisoDesc}"; desc1=${desc1}`);
  // Autoguardado de cada caja.
  await esperar(page, async ()=>{ const d = (await mermaCajasRef.doc('CM-00002').get()).data(); return d && d.items.length === 1 && d.items[0].fotos.length === 1 && !!d.items[0].fotos[0].path; }, null, 15000);
  // Tocar la caja 1 (cerrada) la muestra; «🔓 Abrir caja» la abre y cierra sola la caja 2 (que estaba completa).
  await page.click('#mm-cajas [data-mm-caja="0"]');
  const vuelve = await page.evaluate(()=> $('mm-caja-tit').textContent + ' ' + mmCaja().items[0].sku);
  await page.click('#mm-cajas [data-mm-tg="0"]');   // botón «🔓 Abrir caja» en la tarjeta de la caja
  await page.waitForFunction(()=> !mmCajas[0].cerrada && mmCajas[1].cerrada && !!document.querySelector('#mm-items [data-mm-campo]'), null, { timeout: 10000 });
  const abre = await page.evaluate(async ()=> ({ edit: !!document.querySelector('#mm-items [data-mm-item="0"] [data-mm-campo="sku"]'), e1: (await mermaCajasRef.doc('CM-00001').get()).data().estado, e2: (await mermaCajasRef.doc('CM-00002').get()).data().estado,
    chips: [...document.querySelectorAll('#mm-cajas .mm-caja-chip i')].map(x=> x.textContent).join(' / ') }));
  verificar(/CM-00001 · 🔒 CERRADA P100/.test(vuelve) && abre.edit && abre.e1 === 'ABIERTA' && abre.e2 === 'CERRADA' && abre.chips === '✏ ABIERTA / 🔒 CERRADA',
    `Tocar una caja cerrada la muestra (${vuelve}); «🔓 Abrir caja» la abre para editar y cierra la otra (${abre.chips})`);

  // Celular: tarjetas de caja con su botón y el contador de bultos a la vista.
  await page.setViewportSize({ width: 390, height: 860 }); await page.evaluate(()=> window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'merma_celular.png') });
  const anchoCel = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.setViewportSize({ width: 1440, height: 900 });
  verificar(anchoCel <= 392, `En celular entra en la pantalla (${anchoCel}px)`);
  // 6, 8) Cerrar traslado del día, tienda → bultos = cajas.
  const txtCerrar = await page.textContent('#btn-mm-cerrar');
  await page.click('#btn-mm-cerrar');
  await page.waitForFunction(()=> !$('mm-ok').hidden, null, { timeout: 15000 });
  const ok = await page.evaluate(()=> $('mm-ok').innerText.replace(/\s+/g, ' '));
  const t = await page.evaluate(async ()=> (await mermaTrasladosRef.doc('TM-00001').get()).data());
  const c1 = await page.evaluate(async ()=> (await mermaCajasRef.doc('CM-00001').get()).data());
  verificar(/Cerrar traslado de merma del \d\d\/\d\d\/\d{4} · COMAS/.test(txtCerrar) && /TM-00001 cerrado · Bultos: 2/.test(ok) && /7 und/.test(ok) &&
    t.estado === 'CERRADO' && t.bultos === 2 && t.cajas_ids.join() === 'CM-00001,CM-00002' && t.unidades === 7 && t.tienda === 'COMAS' && t.fecha === hoy &&
    c1.traslado_id === 'TM-00001' && c1.estado === 'CERRADA' && c1.items[0].sku === 'P100' && c1.items[0].cantidad === 5 && c1.items[0].descripcion === 'PELOTA ROJA',
    `"${txtCerrar}" → "${ok}"; en la base: ${t.estado}, ${t.bultos} bultos (${t.cajas_ids.join(', ')})`);

  // Rótulos: uno por caja, 4 por hoja A4 horizontal (formato del Excel "ROTULO ENVIO A TIENDAS").
  const rot = await page.evaluate(async ()=>{
    const { jsPDF } = window.jspdf, saveOrig = jsPDF.API.save; let b64 = '', b64b = '';
    jsPDF.API.save = function(){ (b64 ? (s=> b64b = s) : (s=> b64 = s))(this.output('datauristring').split(',')[1]); };
    try{
      document.querySelector('#mm-ok [data-mm-rotulos]').click();
      // 5 cajas → 2 hojas (4 + 1).
      mmRotulosPdf({ id:'TM-09999', tienda:'SAN JUAN DE LURIGANCHO', fecha:'2026-11-11', usuario:'YOLANDA', cajasLista: [1,2,3,4,5].map(n=> ({ id: 'CM-0000' + n })) });
    } finally { jsPDF.API.save = saveOrig; }
    const leer = async b=>{ const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b), c=> c.charCodeAt(0)) }).promise; const pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 1 });
      const txt = []; for(let i = 1; i <= pdf.numPages; i++) txt.push((await (await pdf.getPage(i)).getTextContent()).items.map(x=> x.str).join(' '));
      // Imagen de la hoja 1 para revisarla.
      const v2 = pg.getViewport({ scale: 2 }), cv = document.createElement('canvas'); cv.width = v2.width; cv.height = v2.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: v2 }).promise;
      return { paginas: pdf.numPages, ancho: Math.round(vp.width), alto: Math.round(vp.height), txt, png: cv.toDataURL('image/png').split(',')[1] }; };
    return { a: await leer(b64), b: await leer(b64b), b64 };
  });
  fs.writeFileSync(path.join(__dirname, 'salida', 'merma_rotulos.pdf'), Buffer.from(rot.b64, 'base64'));
  fs.writeFileSync(path.join(__dirname, 'salida', 'merma_rotulos.png'), Buffer.from(rot.a.png, 'base64'));
  fs.writeFileSync(path.join(__dirname, 'salida', 'merma_rotulos_5.png'), Buffer.from(rot.b.png, 'base64'));
  const t1 = rot.a.txt[0], veces = (re, t)=> (t.match(re) || []).length;
  verificar(rot.a.paginas === 1 && rot.a.ancho === 842 && rot.a.alto === 595 && veces(/ORIGEN:/g, t1) === 2 && veces(/CD VENEZUELA/g, t1) === 2 && veces(/COMAS/g, t1) === 2 &&
    /CM-00001/.test(t1) && /CM-00002/.test(t1) && /\b1\/2\b/.test(t1) && /\b2\/2\b/.test(t1) && veces(/TM-00001/g, t1) === 2 && veces(/MERMA PREPARADA POR: Administrador/g, t1) === 2 && veces(/NRO TRANSACCIÓN/g, t1) === 2 && /TOTAL BULTOS:/.test(t1) && new RegExp(hoy.split('-').reverse().join('/')).test(t1),
    `Rótulos del traslado: ${rot.a.paginas} hoja A4 horizontal (${rot.a.ancho}×${rot.a.alto}) con 2 rótulos: origen CD VENEZUELA, destino COMAS, CM-00001 / CM-00002, TM-00001, "MERMA PREPARADA POR: Administrador"`);
  verificar(rot.b.paginas === 2 && veces(/ORIGEN:/g, rot.b.txt[0]) === 4 && veces(/ORIGEN:/g, rot.b.txt[1]) === 1 && /CM-00005/.test(rot.b.txt[1]) && /\b5\/5\b/.test(rot.b.txt[1]) && /\b1\/5\b/.test(rot.b.txt[0]) && /SAN JUAN DE LURIGANCHO/.test(rot.b.txt[0]),
    `5 cajas → ${rot.b.paginas} hojas (4 + 1 rótulos)`);
  // 9) Registros: el traslado con sus cajas.
  await page.click('#mm-ok [data-mm-ver-reg]');
  await page.waitForFunction(()=> !$('mm-det-modal').hidden, null, { timeout: 10000 });
  const det = await page.evaluate(()=> $('mm-detalle').innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'merma_detalle.png'), fullPage: true });
  await page.click('#btn-mm-det-volver');
  const fila = await page.evaluate(()=> $('mm-lista').innerText.replace(/\s+/g, ' '));
  const itemsLista = await page.evaluate(()=> ({ fila: document.querySelector('#mm-lista [data-mm-abrir="TM-00001"]').innerText.replace(/\s+/g, ' '), tabla: !!document.querySelector('#mm-lista table'), res: $('mm-lista-res').textContent }));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'merma_registros.png'), fullPage: true });
  verificar(/2 bulto\(s\) 2 ítem\(s\) · 7 und/.test(itemsLista.fila) && !itemsLista.tabla && /2 ítem\(s\)/.test(itemsLista.res), `Registros: cada traslado muestra el conteo de ítems ("${itemsLista.fila}"), sin la tabla`);
  // PDF para gerencia: exporta lo filtrado (aquí, solo COMAS).
  await page.selectOption('#mm-tienda-f', 'COMAS');
  const generarPdfG = ()=> page.evaluate(async ()=>{
    const { jsPDF } = window.jspdf, saveOrig = jsPDF.API.save; let b64 = '', nombre = '';
    jsPDF.API.save = function(n){ nombre = n; b64 = this.output('datauristring').split(',')[1]; };
    try{ document.getElementById('btn-mm-pdf').click(); for(let i = 0; i < 100 && !b64; i++) await new Promise(r=> setTimeout(r, 200)); } finally { jsPDF.API.save = saveOrig; }
    const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), c=> c.charCodeAt(0)) }).promise; let txt = '', fotos = 0;
    for(let i = 1; i <= d.numPages; i++){ const pg = await d.getPage(i); txt += (await pg.getTextContent()).items.map(x=> x.str).join(' ') + ' ';
      fotos += (await pg.getOperatorList()).fnArray.filter(f=> f === pdfjsLib.OPS.paintImageXObject || f === pdfjsLib.OPS.paintJpegXObject).length; }
    const vp1 = (await d.getPage(1)).getViewport({ scale: 1 }); window.__pdfG = { fotos, w: Math.round(vp1.width), h: Math.round(vp1.height) };
    const v = (await d.getPage(1)).getViewport({ scale: 1.5 }), cv = document.createElement('canvas'); cv.width = v.width; cv.height = v.height; await (await d.getPage(1)).render({ canvasContext: cv.getContext('2d'), viewport: v }).promise;
    return { nombre, txt, png: cv.toDataURL('image/png').split(',')[1] };
  });
  const pdfSin = await generarPdfG(), pdfSinX = await page.evaluate(()=> window.__pdfG);
  fs.writeFileSync(path.join(__dirname, 'salida', 'merma_gerencia_sin_fotos.png'), Buffer.from(pdfSin.png, 'base64'));
  await page.check('#mm-pdf-fotos');
  const pdfG = await generarPdfG();
  await page.uncheck('#mm-pdf-fotos');
  fs.writeFileSync(path.join(__dirname, 'salida', 'merma_gerencia.png'), Buffer.from(pdfG.png, 'base64'));
  const pdfGx = await page.evaluate(()=> window.__pdfG);
  await page.selectOption('#mm-tienda-f', '');
  verificar(/^merma_gerencia_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfG.nombre) && /Traslados de merma/.test(pdfG.txt) && /Tienda: COMAS/.test(pdfG.txt) && /1 traslado\(s\)\s+·\s+2 bulto\(s\)\s+·\s+2 ítem\(s\)\s+·\s+7 unidades/.test(pdfG.txt) && /TOTAL\s+2\s+7\s+2/.test(pdfG.txt) &&
    /TM-00001/.test(pdfG.txt) && /PELOTA ROJA/.test(pdfG.txt) && !/Total por código/.test(pdfG.txt) && /Página 1 de/.test(pdfG.txt) && pdfGx.w === 595 && pdfGx.h === 842 && pdfGx.fotos >= 1 && pdfGx.fotos <= 2 && /Foto/.test(pdfG.txt),
    `PDF para gerencia con lo filtrado (${pdfG.nombre}): A4 vertical (${pdfGx.w}×${pdfGx.h}), resumen por traslado; con «Incluir fotos»: ${pdfGx.fotos} foto(s) (1 por código), sin total por código`);
  verificar(pdfSinX.fotos === 0 && !/\bFoto\b/.test(pdfSin.txt) && /PELOTA ROJA/.test(pdfSin.txt) && /TOTAL\s+2\s+7\s+2/.test(pdfSin.txt) && !(await page.evaluate(()=> $('mm-pdf-fotos').checked)),
    `PDF para gerencia sin marcar «Incluir fotos» (por defecto): ${pdfSinX.fotos} foto(s), sin columna Foto, con los ítems y totales`);
  // Registros se abre con la fecha del día; un traslado de otra fecha solo se ve con «📅 Todas las fechas».
  await page.evaluate(async email=> mermaTrasladosRef.doc('TM-08888').set({ correlativo:'TM-08888', estado:'CERRADO', tienda:'COMAS', fecha:'2026-01-15', usuario:'Administrador', usuario_email: email, cajas: 0, bultos: 0, cajas_ids: [], fecha_creacion:'2026-01-15T10:00:00.000Z' }), ADMIN.email);
  await page.evaluate(()=>{ $('mm-desde').value = $('mm-hasta').value = ''; setMmSubtab('nuevo'); setMmSubtab('lista'); });
  await page.click('#btn-mm-recargar');
  await page.waitForFunction(()=> mmLista.some(t=> t.id === 'TM-08888'), null, { timeout: 10000 });
  await page.evaluate(()=> renderMmLista());
  const conHoy = await page.evaluate(()=> ({ d: $('mm-desde').value, h: $('mm-hasta').value, hoy: mmHoy(), ids: [...document.querySelectorAll('#mm-lista [data-mm-abrir]')].map(x=> x.dataset.mmAbrir).join() }));
  await page.click('#btn-mm-todas-fechas');
  const todas = await page.evaluate(()=> ({ d: $('mm-desde').value, ids: [...document.querySelectorAll('#mm-lista [data-mm-abrir]')].map(x=> x.dataset.mmAbrir).join() }));
  await page.evaluate(()=>{ setMmSubtab('nuevo'); setMmSubtab('lista'); });
  const otraVez = await page.evaluate(()=> $('mm-desde').value === mmHoy() && $('mm-hasta').value === mmHoy());
  verificar(conHoy.d === conHoy.hoy && conHoy.h === conHoy.hoy && conHoy.ids === 'TM-00001' && todas.d === '' && /TM-08888/.test(todas.ids) && /TM-00001/.test(todas.ids) && otraVez,
    `Registros filtra por defecto la fecha del día (${conHoy.d}): ${conHoy.ids}; «📅 Todas las fechas» → ${todas.ids}; al volver a entrar, otra vez hoy`);
  await page.evaluate(()=> mermaTrasladosRef.doc('TM-08888').delete());
  await page.evaluate(()=>{ mmLista = mmLista.filter(t=> t.id !== 'TM-08888'); renderMmLista(); });
  await page.fill('#mm-q', 'caja azul'); const busca = await page.evaluate(()=> document.querySelectorAll('#mm-lista [data-mm-abrir]').length);
  await page.fill('#mm-q', 'zzz'); const nada = await page.evaluate(()=> document.querySelectorAll('#mm-lista [data-mm-abrir]').length);
  await page.fill('#mm-q', '');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-mm-excel')]);
  const xl = path.join(__dirname, 'salida', 'merma.xlsx'); await dl.saveAs(xl);
  const wb = XLSX.readFile(xl), r1 = XLSX.utils.sheet_to_json(wb.Sheets['Traslados']), r2 = XLSX.utils.sheet_to_json(wb.Sheets['Detalle por caja']);
  verificar(/Rótulos A4/.test(det) && /Imprimir etiquetas \(Godex\)/.test(det) && !/PDF 4×3|Configurar Godex/.test(det) && /TM-00001/.test(det) && /CERRADO/.test(det) && /COMAS/.test(det) && /Bultos \(cajas\) 2/i.test(det) && /CM-00001/.test(det) && /CM-00002/.test(det) && /P100 PELOTA ROJA 5/.test(det) && /X-9 CAJA AZUL 2/.test(det) &&
    /TM-00001 🔒 CERRADO/.test(fila) && /2 bulto\(s\)/.test(fila) && busca === 1 && nada === 0 &&
    r1.length === 1 && r1[0]['Bultos (cajas)'] === 2 && r2.length === 2 && r2[0]['Caja'] === 'CM-00001' && r2[1]['SKU'] === 'X-9',
    `Registros: ${fila}; detalle con las 2 cajas y sus productos; búsqueda "caja azul" → ${busca}; Excel ${r1.length} traslado y ${r2.length} filas`);
  // Imprimir directo (sin PDF): una página por etiqueta de exactamente 4 × 3 pulgadas, sin márgenes.
  const htmlEtq = await page.evaluate(()=>{ window.__sdNoImprimir = true; mmEtiquetasImprimir(mmLista.find(t=> t.id === 'TM-00001')); return $('mm-etq-frame').contentDocument.documentElement.outerHTML; });
  const pEtq = await page.context().newPage();
  await pEtq.setViewportSize({ width: 384, height: 288 }); await pEtq.setContent(htmlEtq); await pEtq.waitForTimeout(300);
  const medida = await pEtq.evaluate(()=>{ const et = document.querySelectorAll('.et'), r = et[0].getBoundingClientRect();
    const desborde = [...document.querySelectorAll('.val span')].filter(s=> s.offsetWidth > s.parentNode.clientWidth || s.offsetHeight > s.parentNode.clientHeight).length;
    return { n: et.length, w: Math.round(r.width), h: Math.round(r.height), desborde, txt: et[0].innerText.replace(/\s+/g, ' ') }; });
  await (await pEtq.$('.et')).screenshot({ path: path.join(__dirname, 'salida', 'merma_etiqueta_directa.png') });
  const pdfEtq = await pEtq.pdf({ preferCSSPageSize: true, printBackground: true });
  await pEtq.close();
  const paginasEtq = await page.evaluate(async b=>{ const d = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b), c=> c.charCodeAt(0)) }).promise; const vp = (await d.getPage(1)).getViewport({ scale: 1 }); return { n: d.numPages, w: Math.round(vp.width), h: Math.round(vp.height) }; }, Buffer.from(pdfEtq).toString('base64'));
  const botonImp = await page.evaluate(()=> !!document.querySelector('[data-mm-det-imprimir], #mm-ok [data-mm-imprimir]') || /Imprimir etiquetas/.test(document.body.innerHTML));
  verificar(medida.n === 2 && medida.w === 384 && medida.h === 288 && medida.desborde === 0 && /ORIGEN: CD VENEZUELA DESTINO: COMAS/.test(medida.txt) && /TM-00001/.test(medida.txt) && /TOTAL BULTOS: NRO BULTO 1\/2 CM-00001/.test(medida.txt) &&
    paginasEtq.n === 2 && paginasEtq.w === 288 && paginasEtq.h === 216 && botonImp,
    `Imprimir directo: ${medida.n} etiquetas de 4 × 3 in (${medida.w}×${medida.h} px), ${paginasEtq.n} páginas de impresión de ${paginasEtq.w}×${paginasEtq.h} pt, todo el texto dentro de la etiqueta`);
  // Detalle sin «Ajustes de la etiqueta»; sin guía: aviso rojo animado (y en la lista, «⚠ Sin guía» en los cerrados).
  await page.evaluate(()=>{ switchTab('merma'); setMmSubtab('lista'); });
  await page.waitForSelector('#mm-lista [data-mm-abrir="TM-00001"]', { timeout: 10000 });
  await page.click('#mm-lista [data-mm-abrir="TM-00001"]');
  await page.waitForSelector('#mm-detalle .mm-sin-guia', { timeout: 10000 });
  const sinGuia = await page.evaluate(()=>{ const a = document.querySelector('#mm-detalle .mm-sin-guia'), cs = getComputedStyle(a);
    return { txt: a.innerText.replace(/\s+/g, ' '), anim: cs.animationName, caja: document.querySelector('#mm-detalle .mm-guia').classList.contains('falta'), ajustes: !!document.querySelector('.mm-etq-aj') || /Ajustes de la etiqueta/.test($('mm-detalle').innerText),
      chip: !!document.querySelector('#mm-lista [data-mm-abrir="TM-00001"] .mm-sin-guia-chip') }; });
  await (await page.$('#mm-detalle')).screenshot({ path: path.join(__dirname, 'salida', 'merma_sin_guia.png') });
  await page.evaluate(()=> mmCerrarDetalle());
  verificar(/SIN GUÍA DE REMISIÓN/.test(sinGuia.txt) && sinGuia.anim === 'mmGuiaLate' && sinGuia.caja && !sinGuia.ajustes && sinGuia.chip,
    `Sin guía: aviso "${sinGuia.txt}" animado (${sinGuia.anim}) y «⚠ Sin guía» en la lista; ya no aparece «Ajustes de la etiqueta»`);
  // Guía de remisión: un PDF pesado (más de 700 KB) se reduce antes de subir y queda en el traslado.
  const guiaPdf = path.join(__dirname, 'salida', 'guia_prueba.pdf');
  const b64g = await page.evaluate(()=>{ const cv = document.createElement('canvas'); cv.width = cv.height = 1400; const ctx = cv.getContext('2d'), im = ctx.createImageData(1400, 1400);
    for(let i = 0; i < im.data.length; i += 4){ const v = Math.random() * 255; im.data[i] = v; im.data[i + 1] = 255 - v; im.data[i + 2] = (v * 7) % 255; im.data[i + 3] = 255; } ctx.putImageData(im, 0, 0);
    const d = new jspdf.jsPDF({ unit:'pt', format:'a4' }); d.text('GUIA DE REMISION T001-123', 40, 40); d.addImage(cv.toDataURL('image/png'), 'PNG', 40, 60, 500, 500); return d.output('datauristring').split(',')[1]; });
  fs.writeFileSync(guiaPdf, Buffer.from(b64g, 'base64'));
  const pesoGuia = fs.statSync(guiaPdf).size;
  await page.evaluate(()=>{ setMmSubtab('lista'); });
  await page.waitForSelector('#mm-lista [data-mm-abrir="TM-00001"]', { timeout: 10000 });
  await page.click('#mm-lista [data-mm-abrir="TM-00001"]');
  await page.waitForSelector('[data-mm-guia-adjuntar]', { timeout: 10000 });
  // Un traslado antiguo con una sola guía (guia_pdf) se sigue viendo; al adjuntar se pasan todas a la lista.
  await page.evaluate(async ()=>{ const ref = storage.ref().child('merma_guias/TM-00001/1_antigua.pdf'); await ref.put(new Blob(['%PDF-1.4 antigua'], { type:'application/pdf' }));
    await mermaTrasladosRef.doc('TM-00001').update({ guia_pdf: { url: await ref.getDownloadURL(), path: ref.fullPath, nombre:'antigua.pdf', tam: 16, subido_por:'Administrador', subido_en: new Date().toISOString() } });
    const t = mmLista.find(x=> x.id === 'TM-00001'); t.guia_pdf = (await mermaTrasladosRef.doc('TM-00001').get()).data().guia_pdf; mmAbrir('TM-00001'); });
  const antigua = await page.evaluate(()=> document.querySelector('#mm-detalle .mm-guia').innerText.replace(/\s+/g, ' '));
  // Dos guías a la vez (selección múltiple).
  const guiaPdf2 = path.join(__dirname, 'salida', 'guia_prueba_2.pdf'); fs.copyFileSync(guiaPdf, guiaPdf2);
  await page.setInputFiles('#mm-guia-file', [guiaPdf, guiaPdf2]);
  await esperar(page, async ()=> ((await mermaTrasladosRef.doc('TM-00001').get()).data().guias_pdf || []).length === 3, null, 90000);
  await page.waitForFunction(()=> document.querySelectorAll('#mm-detalle .mm-guia-link').length === 3, null, { timeout: 10000 });
  const docG = await page.evaluate(async ()=> (await mermaTrasladosRef.doc('TM-00001').get()).data());
  const g = docG.guias_pdf.find(x=> x.nombre === 'guia_prueba.pdf');
  verificar(/antigua\.pdf/.test(antigua) && !docG.guia_pdf && docG.guias_pdf.map(x=> x.nombre).join() === 'antigua.pdf,guia_prueba.pdf,guia_prueba_2.pdf',
    `Varias guías: la antigua (${/antigua\.pdf/.test(antigua) ? 'se ve' : 'no se ve'}) + 2 a la vez → ${docG.guias_pdf.map(x=> x.nombre).join(', ')}`);
  const enStorage = await page.evaluate(p=> storage.ref().child(p).getMetadata().then(m=> m.size, ()=> 0), g.path);
  const detGuia = await page.evaluate(()=> document.querySelector('#mm-detalle .mm-guia').innerText.replace(/\s+/g, ' '));
  const conIcono = await page.evaluate(()=> /📄×3/.test(document.querySelector('#mm-lista [data-mm-abrir="TM-00001"]').innerText) && !document.querySelector('#mm-detalle .mm-sin-guia') && !document.querySelector('#mm-lista [data-mm-abrir="TM-00001"] .mm-sin-guia-chip'));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'merma_guia.png'), fullPage: true });
  verificar(pesoGuia > 700 * 1024 && g.tam < g.tam_original && g.tam_original === pesoGuia && /^merma_guias\/TM-00001\//.test(g.path) && enStorage === g.tam && /guia_prueba\.pdf/.test(detGuia) && /reducido de/.test(detGuia) && conIcono,
    `Guía de remisión: ${Math.round(pesoGuia / 1024)} KB → ${Math.round(g.tam / 1024)} KB, guardada en ${g.path}; el detalle la muestra ("${detGuia.slice(0, 90)}…") y la lista con 📄`);
  // Almacenamiento: las fotos de las cajas y la guía NO son "huérfanas".
  await page.evaluate(()=> mmCerrarDetalle());
  const huerf = await page.evaluate(async ()=>{ ALM_MARGEN_HUERFANO_MS = 0; switchTab('almacenamiento'); await almAnalizarArchivos(); await almAnalizarBase(); return (almHuerfanos() || []).map(f=> f.path).filter(p=> /^merma/.test(p)); });
  verificar(huerf.length === 0, `Almacenamiento reconoce las fotos de Merma y la guía (huérfanos de Merma: ${huerf.length})`);
  // Quitar la guía: se borra el PDF.
  await page.evaluate(()=>{ switchTab('merma'); setMmSubtab('lista'); mmAbrir('TM-00001'); });
  await page.click(`[data-mm-guia-quitar="${g.path}"]`);
  await esperar(page, async ()=> ((await mermaTrasladosRef.doc('TM-00001').get()).data().guias_pdf || []).length === 2, null, 10000);
  const borrada = await esperar(page, p=> storage.ref().child(p).getMetadata().then(()=> false, ()=> true), g.path, 10000).then(()=> true, ()=> false);
  const quedan = await page.evaluate(async ()=> (await mermaTrasladosRef.doc('TM-00001').get()).data().guias_pdf.map(x=> x.nombre).join());
  verificar(borrada && quedan === 'antigua.pdf,guia_prueba_2.pdf', `Quitar una guía borra solo ese PDF; quedan: ${quedan}`);
  // Datos del módulo de Merma anterior: Almacenamiento avisa y los borra (con los PDFs firmados de merma_formatos/).
  await page.evaluate(async ()=>{
    await mermaGuiasRef.doc('MER-0001').set({ correlativo:'MER-0001', sede:'SEDE' }); await mermaGuiaItemsRef.add({ correlativo_guia:'MER-0001', codigo:'P1', cantidad:1 });
    await mermaFormatosRef.doc('FMT-0001').set({ correlativo:'FMT-0001' }); await mermaAuditoriasRef.add({ resultado:'CONFIABLE' });
    await storage.ref().child('merma_formatos/FMT-0001/1_firmado.pdf').put(new Blob(['%PDF-1.4 x'], { type:'application/pdf' }));
    switchTab('almacenamiento'); });
  await page.waitForFunction(()=> !$('alm-merma-vieja').hidden, null, { timeout: 10000 });
  const avisoViejo = await page.evaluate(()=> $('alm-merma-vieja').innerText.replace(/\s+/g, ' '));
  await page.click('#btn-alm-merma-vieja');
  await page.waitForFunction(()=> /Listo: se borraron/.test($('alm-merma-vieja-msg').textContent), null, { timeout: 20000 });
  const tras = await page.evaluate(async ()=> ({ msg: $('alm-merma-vieja-msg').textContent, oculto: $('alm-merma-vieja').hidden,
    n: (await Promise.all(['merma_guias', 'merma_guia_items', 'merma_formatos', 'merma_auditorias'].map(c=> db.collection(c).get().then(q=> q.size)))).join(','),
    pdf: await storage.ref().child('merma_formatos/FMT-0001/1_firmado.pdf').getMetadata().then(()=> true, ()=> false),
    nuevos: (await mermaTrasladosRef.get()).size }));
  verificar(/guías, ítems de guías, formatos, auditorías/.test(avisoViejo) && tras.n === '0,0,0,0' && !tras.pdf && tras.oculto && tras.nuevos >= 1,
    `Merma anterior: Almacenamiento avisa ("${avisoViejo.slice(0, 120)}…") y al borrar queda vacío (${tras.msg}); los traslados nuevos no se tocan (${tras.nuevos})`);
  await page.evaluate(()=> switchTab('merma'));
  verificar(!errores.length, 'Sin errores de JavaScript (admin)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  // Otro usuario (solo permiso Merma): no ve lo del admin (tampoco leyendo directo: lo niegan las reglas) y sí lo suyo.
  ({ browser, page, errores } = await abrirApp({ usuario: YOLANDA }));
  await listo(page);
  const menu = await page.evaluate(()=> !$('tab-merma').classList.contains('hidden-perm') && $('tab-regfoto').classList.contains('hidden-perm'));
  // Con Merma como única opción entra directo y ya ve las tiendas.
  const directo = await page.waitForFunction(()=> $('view-merma').classList.contains('active') && [...$('mm-tienda').options].some(o=> o.value === 'COMAS'), null, { timeout: 10000 }).then(()=> true, ()=> false);
  verificar(directo, 'Un usuario con solo Merma entra directo y ve la lista de tiendas');
  await page.evaluate(()=>{ switchTab('merma'); setMmSubtab('lista'); });
  await page.waitForFunction(()=> mmLeidos, null, { timeout: 10000 });
  const vacia = await page.evaluate(()=> $('mm-lista').innerText);
  const negado = await page.evaluate(()=> mermaTrasladosRef.doc('TM-00001').get().then(()=> 'leyó', e=> e.code));
  const negadoCaja = await page.evaluate(()=> mermaCajasRef.doc('CM-00001').get().then(()=> 'leyó', e=> e.code));
  await page.evaluate(()=> setMmSubtab('nuevo'));
  await page.waitForFunction(()=> [...$('mm-tienda').options].some(o=> o.value === 'COMAS'), null, { timeout: 10000 });
  await page.selectOption('#mm-tienda', 'COMAS'); await page.click('#btn-mm-iniciar');
  await page.waitForFunction(()=> $('mm-bar-corr').textContent === 'TM-00002', null, { timeout: 10000 });
  await page.click('#btn-mm-caja');
  await page.waitForFunction(()=> $('mm-caja-tit').textContent.includes('CM-00003'), null, { timeout: 10000 });
  await page.evaluate(()=> setMmSubtab('lista'));
  await page.waitForFunction(()=> document.querySelectorAll('#mm-lista [data-mm-abrir]').length === 1, null, { timeout: 10000 });
  const suya = await page.evaluate(()=> $('mm-lista').innerText.replace(/\s+/g, ' '));
  // Su traslado abierto aparece para continuar.
  await page.evaluate(()=> setMmSubtab('nuevo'));
  verificar(menu && /Aún no hay traslados/.test(vacia) && negado === 'permission-denied' && negadoCaja === 'permission-denied' && /TM-00002 📦 ABIERTO/.test(suya) && /1 bulto/.test(suya) && !/TM-00001/.test(suya),
    `Otro usuario: ve el menú Merma; no ve TM-00001 (reglas: ${negado} / ${negadoCaja}); su traslado: ${suya}`);
  verificar(!errores.filter(e=> !/permission/i.test(e)).length, 'Sin errores de JavaScript (usuario)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
