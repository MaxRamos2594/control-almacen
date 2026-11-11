// Saldos: traslado de saldos por cajas (Productos e inventario → Saldos).
// Tienda + fecha de hoy → crear caja (CJ-00001) → productos como en el registro fotográfico → otra caja →
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
    await usuariosRef.doc('yolanda@ejemplo.com').set({ email:'yolanda@ejemplo.com', alias:'YOLANDA', permisos:{ saldos:true } });
  });
  await page.waitForFunction(()=> !!productos['P100'], null, { timeout: 10000 });

  // Menú: Saldos dentro de "Productos e inventario".
  const grupo = await page.evaluate(()=>{ const g = $('tab-saldos').closest('.drawer-group'); return g.querySelector('.drawer-group-title').innerText + ': ' + [...g.querySelectorAll('button[data-tab]')].map(b=> b.innerText).join(', '); });
  await page.click('#btn-menu'); await page.click('#tab-saldos');
  await page.waitForFunction(()=> [...$('sd-tienda').options].some(o=> o.value === 'COMAS'), null, { timeout: 10000 });
  const hoy = await page.evaluate(()=> sdHoy() === $('sd-fecha').value && $('sd-fecha').value);
  verificar(/PRODUCTOS E INVENTARIO: .*Registro fotográfico, Saldos/i.test(grupo) && !!hoy, `Opción "Saldos" en ${grupo}; la fecha por defecto es hoy (${hoy})`);

  // Recargar la página estando en Saldos: tiendas y fecha se llenan solas (antes quedaban vacías).
  await page.reload();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo' && $('view-saldos').classList.contains('active'), null, { timeout: 20000 });
  const recarga = await page.waitForFunction(()=> [...$('sd-tienda').options].some(o=> o.value === 'COMAS') && $('sd-fecha').value === sdHoy(), null, { timeout: 10000 }).then(()=> true, ()=> false);
  verificar(recarga, 'Al recargar la página estando en Saldos, la lista de tiendas y la fecha de hoy se llenan solas');
  // 1-2) Tienda + fecha → iniciar traslado.
  await page.selectOption('#sd-tienda', 'COMAS');
  await page.click('#btn-sd-iniciar');
  await page.waitForFunction(()=> !$('sd-form').hidden && $('sd-bar-corr').textContent === 'TS-00001', null, { timeout: 10000 });
  // 3) Crear caja → correlativo CJ-00001.
  await page.click('#btn-sd-caja');
  await page.waitForFunction(()=> $('sd-caja-tit').textContent.includes('CJ-00001') && document.activeElement.dataset.sdCampo === 'sku', null, { timeout: 10000 });
  // 4) Producto como en el registro fotográfico: SKU (autocompleta la descripción), cantidad, foto.
  const producto = async (i, sku, cant, desc)=>{
    await page.fill(`#sd-items [data-sd-item="${i}"] [data-sd-campo="sku"]`, sku);
    if(desc) await page.fill(`#sd-items [data-sd-item="${i}"] [data-sd-campo="descripcion"]`, desc);
    await page.fill(`#sd-items [data-sd-item="${i}"] [data-sd-campo="cantidad"]`, String(cant));
    await page.press(`#sd-items [data-sd-item="${i}"] [data-sd-campo="cantidad"]`, 'Enter');   // Enter abre la cámara
    await page.waitForFunction(()=> !$('cam-modal').hidden, null, { timeout: 10000 });
    await page.setInputFiles('#cam-file', [png]);
    await page.waitForFunction(i=> sdCaja().items[i].fotos.length === 1, i, { timeout: 10000 });
    await page.click('#cam-cerrar');
    await page.waitForFunction(i=> sdCaja().items.length === i + 2, i, { timeout: 5000 });   // aparece el siguiente en blanco
  };
  await producto(0, 'P100', 5);
  const desc1 = await page.evaluate(()=> sdCaja().items[0].descripcion);
  // Cerrar caja: queda en solo lectura, con su estado guardado.
  await page.click('#btn-sd-caja-cerrar');
  await page.waitForFunction(()=> sdCajas[0].cerrada && !$('btn-sd-caja-abrir').hidden, null, { timeout: 10000 });
  const cerrada = await page.evaluate(async ()=> ({ chip: document.querySelector('#sd-cajas [data-sd-caja="0"]').innerText.replace(/\s+/g, ' '), lect: !document.querySelector('#sd-items [data-sd-campo]') && /Caja cerrada/.test($('sd-items').innerText),
    add: $('btn-sd-add').hidden, est: (await saldosCajasRef.doc('CJ-00001').get()).data().estado }));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'saldos_caja_cerrada.png'), fullPage: true });
  verificar(/CERRADA/.test(cerrada.chip) && cerrada.lect && cerrada.add && cerrada.est === 'CERRADA', `"🔒 Cerrar caja": ${cerrada.chip}; queda en solo lectura (estado ${cerrada.est})`);
  // 5) Otra caja.
  await page.click('#btn-sd-caja');
  await page.waitForFunction(()=> $('sd-caja-tit').textContent.includes('CJ-00002'), null, { timeout: 10000 });
  // Caja vacía: no deja crear otra.
  await page.click('#btn-sd-caja');
  await page.waitForFunction(()=> !$('rf-aviso').hidden, null, { timeout: 5000 });
  const avisoVacia = await page.textContent('#rf-aviso-tit'); await page.click('#btn-rf-aviso-ok');
  await page.waitForFunction(()=> document.activeElement.dataset.sdCampo === 'sku', null, { timeout: 3000 });   // al cerrar el aviso, el cursor va al SKU
  // Sin descripción (código que no está en Productos): no está completo.
  await page.fill('#sd-items [data-sd-item="0"] [data-sd-campo="sku"]', 'X-9');
  await page.fill('#sd-items [data-sd-item="0"] [data-sd-campo="cantidad"]', '2');
  await page.click('#btn-sd-add');
  await page.waitForFunction(()=> !$('rf-aviso').hidden, null, { timeout: 5000 });
  const avisoDesc = await page.textContent('#rf-aviso-txt'); await page.click('#btn-rf-aviso-ok');
  await page.waitForFunction(()=> document.activeElement.dataset.sdCampo === 'descripcion', null, { timeout: 3000 });
  await producto(0, 'X-9', 2, 'CAJA AZUL');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'saldos_nuevo.png'), fullPage: true });
  const chips = await page.evaluate(()=> [...document.querySelectorAll('#sd-cajas .sd-caja-chip')].map(b=> b.innerText.replace(/\s+/g, ' ')).join(' | '));
  const resumen = await page.textContent('#sd-resumen');
  const contador = await page.evaluate(()=> [$('sd-contador').innerText, $('sd-contador2').innerText, $('sd-contador3').innerText].map(t=> t.replace(/\s+/g, ' ').trim()).join(' | '));
  const centrado = await page.evaluate(()=> ['sku', 'descripcion'].map(k=> getComputedStyle(document.querySelector(`#sd-items [data-sd-campo="${k}"]`)).textAlign).join());
  verificar(contador === '📦 Bultos: 2 | 📦 2 bultos | 📦 Bultos: 2' && centrado === 'center,center', `Contador de bultos visible (${contador}); código y descripción centrados`);
  verificar(desc1 === 'PELOTA ROJA' && /está vacía/.test(avisoVacia) && /falta la descripción/.test(avisoDesc) && /CJ-00001 1 producto\(s\) · 5 und 🔒 CERRADA 🔓 Abrir caja \| .*CJ-00002 1 producto\(s\) · 2 und ✏ ABIERTA 🔒 Cerrar caja/.test(chips) && /2 caja\(s\) = 2 bulto\(s\) \(1 cerrada\(s\)\)/.test(resumen),
    `Cajas: ${chips}; "${resumen}"; caja vacía → "${avisoVacia}"; sin descripción → "${avisoDesc}"; desc1=${desc1}`);
  // Autoguardado de cada caja.
  await esperar(page, async ()=>{ const d = (await saldosCajasRef.doc('CJ-00002').get()).data(); return d && d.items.length === 1 && d.items[0].fotos.length === 1 && !!d.items[0].fotos[0].path; }, null, 15000);
  // Tocar la caja 1 (cerrada) la muestra; «🔓 Abrir caja» la abre y cierra sola la caja 2 (que estaba completa).
  await page.click('#sd-cajas [data-sd-caja="0"]');
  const vuelve = await page.evaluate(()=> $('sd-caja-tit').textContent + ' ' + sdCaja().items[0].sku);
  await page.click('#sd-cajas [data-sd-tg="0"]');   // botón «🔓 Abrir caja» en la tarjeta de la caja
  await page.waitForFunction(()=> !sdCajas[0].cerrada && sdCajas[1].cerrada && !!document.querySelector('#sd-items [data-sd-campo]'), null, { timeout: 10000 });
  const abre = await page.evaluate(async ()=> ({ edit: !!document.querySelector('#sd-items [data-sd-item="0"] [data-sd-campo="sku"]'), e1: (await saldosCajasRef.doc('CJ-00001').get()).data().estado, e2: (await saldosCajasRef.doc('CJ-00002').get()).data().estado,
    chips: [...document.querySelectorAll('#sd-cajas .sd-caja-chip i')].map(x=> x.textContent).join(' / ') }));
  verificar(/CJ-00001 · 🔒 CERRADA P100/.test(vuelve) && abre.edit && abre.e1 === 'ABIERTA' && abre.e2 === 'CERRADA' && abre.chips === '✏ ABIERTA / 🔒 CERRADA',
    `Tocar una caja cerrada la muestra (${vuelve}); «🔓 Abrir caja» la abre para editar y cierra la otra (${abre.chips})`);

  // Celular: tarjetas de caja con su botón y el contador de bultos a la vista.
  await page.setViewportSize({ width: 390, height: 860 }); await page.evaluate(()=> window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'saldos_celular.png') });
  const anchoCel = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.setViewportSize({ width: 1440, height: 900 });
  verificar(anchoCel <= 392, `En celular entra en la pantalla (${anchoCel}px)`);
  // 6, 8) Cerrar traslado del día, tienda → bultos = cajas.
  const txtCerrar = await page.textContent('#btn-sd-cerrar');
  await page.click('#btn-sd-cerrar');
  await page.waitForFunction(()=> !$('sd-ok').hidden, null, { timeout: 15000 });
  const ok = await page.evaluate(()=> $('sd-ok').innerText.replace(/\s+/g, ' '));
  const t = await page.evaluate(async ()=> (await saldosTrasladosRef.doc('TS-00001').get()).data());
  const c1 = await page.evaluate(async ()=> (await saldosCajasRef.doc('CJ-00001').get()).data());
  verificar(/Cerrar traslado de saldos del \d\d\/\d\d\/\d{4} · COMAS/.test(txtCerrar) && /TS-00001 cerrado · Bultos: 2/.test(ok) && /7 und/.test(ok) &&
    t.estado === 'CERRADO' && t.bultos === 2 && t.cajas_ids.join() === 'CJ-00001,CJ-00002' && t.unidades === 7 && t.tienda === 'COMAS' && t.fecha === hoy &&
    c1.traslado_id === 'TS-00001' && c1.estado === 'CERRADA' && c1.items[0].sku === 'P100' && c1.items[0].cantidad === 5 && c1.items[0].descripcion === 'PELOTA ROJA',
    `"${txtCerrar}" → "${ok}"; en la base: ${t.estado}, ${t.bultos} bultos (${t.cajas_ids.join(', ')})`);

  // 9) Registros: el traslado con sus cajas.
  await page.click('#sd-ok [data-sd-ver-reg]');
  await page.waitForFunction(()=> !$('sd-det-modal').hidden, null, { timeout: 10000 });
  const det = await page.evaluate(()=> $('sd-detalle').innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'saldos_detalle.png'), fullPage: true });
  await page.click('#btn-sd-det-volver');
  const fila = await page.evaluate(()=> $('sd-lista').innerText.replace(/\s+/g, ' '));
  await page.fill('#sd-q', 'caja azul'); const busca = await page.evaluate(()=> document.querySelectorAll('#sd-lista [data-sd-abrir]').length);
  await page.fill('#sd-q', 'zzz'); const nada = await page.evaluate(()=> document.querySelectorAll('#sd-lista [data-sd-abrir]').length);
  await page.fill('#sd-q', '');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-sd-excel')]);
  const xl = path.join(__dirname, 'salida', 'saldos.xlsx'); await dl.saveAs(xl);
  const wb = XLSX.readFile(xl), r1 = XLSX.utils.sheet_to_json(wb.Sheets['Traslados']), r2 = XLSX.utils.sheet_to_json(wb.Sheets['Detalle por caja']);
  verificar(/TS-00001/.test(det) && /CERRADO/.test(det) && /COMAS/.test(det) && /Bultos \(cajas\) 2/i.test(det) && /CJ-00001/.test(det) && /CJ-00002/.test(det) && /P100 PELOTA ROJA 5/.test(det) && /X-9 CAJA AZUL 2/.test(det) &&
    /TS-00001 🔒 CERRADO/.test(fila) && /2 bulto\(s\)/.test(fila) && busca === 1 && nada === 0 &&
    r1.length === 1 && r1[0]['Bultos (cajas)'] === 2 && r2.length === 2 && r2[0]['Caja'] === 'CJ-00001' && r2[1]['SKU'] === 'X-9',
    `Registros: ${fila}; detalle con las 2 cajas y sus productos; búsqueda "caja azul" → ${busca}; Excel ${r1.length} traslado y ${r2.length} filas`);
  verificar(!errores.length, 'Sin errores de JavaScript (admin)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  // Otro usuario (solo permiso Saldos): no ve lo del admin (tampoco leyendo directo: lo niegan las reglas) y sí lo suyo.
  ({ browser, page, errores } = await abrirApp({ usuario: YOLANDA }));
  await listo(page);
  const menu = await page.evaluate(()=> !$('tab-saldos').classList.contains('hidden-perm') && $('tab-regfoto').classList.contains('hidden-perm'));
  // Con Saldos como única opción entra directo y ya ve las tiendas.
  const directo = await page.waitForFunction(()=> $('view-saldos').classList.contains('active') && [...$('sd-tienda').options].some(o=> o.value === 'COMAS'), null, { timeout: 10000 }).then(()=> true, ()=> false);
  verificar(directo, 'Un usuario con solo Saldos entra directo y ve la lista de tiendas');
  await page.evaluate(()=>{ switchTab('saldos'); setSdSubtab('lista'); });
  await page.waitForFunction(()=> sdLeidos, null, { timeout: 10000 });
  const vacia = await page.evaluate(()=> $('sd-lista').innerText);
  const negado = await page.evaluate(()=> saldosTrasladosRef.doc('TS-00001').get().then(()=> 'leyó', e=> e.code));
  const negadoCaja = await page.evaluate(()=> saldosCajasRef.doc('CJ-00001').get().then(()=> 'leyó', e=> e.code));
  await page.evaluate(()=> setSdSubtab('nuevo'));
  await page.waitForFunction(()=> [...$('sd-tienda').options].some(o=> o.value === 'COMAS'), null, { timeout: 10000 });
  await page.selectOption('#sd-tienda', 'COMAS'); await page.click('#btn-sd-iniciar');
  await page.waitForFunction(()=> $('sd-bar-corr').textContent === 'TS-00002', null, { timeout: 10000 });
  await page.click('#btn-sd-caja');
  await page.waitForFunction(()=> $('sd-caja-tit').textContent.includes('CJ-00003'), null, { timeout: 10000 });
  await page.evaluate(()=> setSdSubtab('lista'));
  await page.waitForFunction(()=> document.querySelectorAll('#sd-lista [data-sd-abrir]').length === 1, null, { timeout: 10000 });
  const suya = await page.evaluate(()=> $('sd-lista').innerText.replace(/\s+/g, ' '));
  // Su traslado abierto aparece para continuar.
  await page.evaluate(()=> setSdSubtab('nuevo'));
  verificar(menu && /Aún no hay traslados/.test(vacia) && negado === 'permission-denied' && negadoCaja === 'permission-denied' && /TS-00002 📦 ABIERTO/.test(suya) && /1 bulto/.test(suya) && !/TS-00001/.test(suya),
    `Otro usuario: ve el menú Saldos; no ve TS-00001 (reglas: ${negado} / ${negadoCaja}); su traslado: ${suya}`);
  verificar(!errores.filter(e=> !/permission/i.test(e)).length, 'Sin errores de JavaScript (usuario)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
