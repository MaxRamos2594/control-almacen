// Registro fotográfico → 🔧 Ajustes: pegar «código · cantidad a descontar», validar contra los registros confirmados y
// aptos, elegir en qué posición restar (o sumar) en la misma fila, ver el saldo y grabar (siguen confirmados y aptos, con historial).
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
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

(async ()=>{
  await limpiarEmuladores();
  let { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async email=>{
    const base = { estado:'CONFIRMADO', usuario:'Administrador', usuario_email: email, fecha_creacion:'2026-11-01T10:00:00.000Z' };
    const reg = (id, extra)=> registrosFotoRef.doc(id).set(Object.assign({}, base, extra));
    await reg('RF-ADM-00001', { participante:'CD VENEZUELA', posicion:'A01', apto_ajuste:'SI', items:[{ sku:'P1', descripcion:'PELOTA', cantidad:5000, fotos:[] }, { sku:'P2', descripcion:'CAJA', cantidad:10, fotos:[] }], cant_items:2, unidades:5010, skus:['P1','P2'] });
    await reg('RF-ADM-00002', { participante:'CD VENEZUELA', posicion:'A02', apto_ajuste:'SI', items:[{ sku:'P1', descripcion:'PELOTA', cantidad:300, fotos:[] }], cant_items:1, unidades:300, skus:['P1'] });
    await reg('RF-ADM-00003', { participante:'CD VENEZUELA', posicion:'A03', apto_ajuste:'NO', items:[{ sku:'P1', descripcion:'PELOTA', cantidad:100, fotos:[] }], cant_items:1, unidades:100, skus:['P1'] });
    await reg('RF-ADM-00004', { participante:'COMAS', posicion:'CAJA 1', apto_ajuste:'SI', items:[{ sku:'P1', descripcion:'PELOTA', cantidad:50, fotos:[] }], cant_items:1, unidades:50, skus:['P1'] });
    await usuariosRef.doc('yolanda@ejemplo.com').set({ email:'yolanda@ejemplo.com', alias:'YOLANDA', permisos:{ reg_fotos:true } });
  }, ADMIN.email);
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('ajustes'); });
  await page.waitForFunction(()=> rfLeidos && $('rfj-tienda').options.length > 1, null, { timeout: 15000 });
  const barra = await page.evaluate(()=> ({ tienda: $('rfj-tienda').value, compacto: document.body.classList.contains('rfx-full'), nav: document.querySelectorAll('#rfsub-panel-ajustes .rfl-nav button').length }));
  verificar(barra.tienda === 'CD VENEZUELA' && barra.compacto && barra.nav === 7, `«🔧 Ajustes» con menú compacto (7 botones) y tienda ${barra.tienda} por defecto`);

  // Pegar y validar.
  await page.fill('#rfj-txt', 'CÓDIGO\tCANTIDAD\nP1\t120\nP2\t10\nZZ\t5');
  await page.click('#btn-rfj-validar');
  await page.waitForSelector('#rfj-res .rfj-cod', { timeout: 5000 });
  const val = await page.evaluate(()=> ({ msg: $('rfj-msg').textContent, cods: [...document.querySelectorAll('#rfj-res .rfj-cod')].map(c=> c.querySelector('.rfj-cab').innerText.replace(/\s+/g, ' ').trim()),
    p1: [...document.querySelectorAll('#rfj-res [data-rfj-c="0"] tbody tr')].map(tr=> tr.innerText.replace(/\s+/g, ' ').trim()), p2delta: document.querySelector('[data-rfj-delta="1:0"]').value, p2saldo: document.querySelector('[data-rfj-saldo="1:0"]').textContent }));
  verificar(/3 código\(s\).*2 en aptos.*1 no están/.test(val.msg) && /P1 PELOTA Descontar 120 En aptos: 5,300 und en 2 posición\(es\) Falta descontar 120/.test(val.cods[0]) && /ZZ.*No está en los registros aptos/.test(val.cods[2]) &&
    val.p1.length === 2 && /A01 RF-ADM-00001 5,000/.test(val.p1[0]) && /A02 RF-ADM-00002 300/.test(val.p1[1]) && val.p2delta === '-10' && val.p2saldo === '0',
    `Validar: ${val.cods.join(' | ')}; P1 en ${val.p1.length} posiciones (el NO apto y el de COMAS no salen); P2 (una posición) propone ${val.p2delta} → saldo ${val.p2saldo}`);
  // Elegir la posición en la misma fila: «⤵ Aquí» pone lo que falta; escribir a mano también calcula el saldo.
  await page.click('[data-rfj-usar="0:0"]');
  const aqui = await page.evaluate(()=> ({ d: document.querySelector('[data-rfj-delta="0:0"]').value, saldo: document.querySelector('[data-rfj-saldo="0:0"]').textContent, est: document.querySelector('[data-rfj-est="0"]').textContent }));
  await page.fill('[data-rfj-delta="0:1"]', '+20');
  const mano = await page.evaluate(()=> ({ saldo: document.querySelector('[data-rfj-saldo="0:1"]').textContent, est: document.querySelector('[data-rfj-est="0"]').textContent, res: $('rfj-resumen').innerText }));
  await page.fill('[data-rfj-delta="0:1"]', '');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_ajustes.png'), fullPage: true });
  verificar(aqui.d === '-120' && aqui.saldo === '4,880' && aqui.est === '✓ Completo' && mano.saldo === '320' && /Se descuenta 20 de más|Falta/.test(mano.est) && /posición\(es\) a ajustar/.test(mano.res),
    `«⤵ Aquí» en A01 → ${aqui.d} (saldo ${aqui.saldo}, ${aqui.est}); +20 en A02 → saldo ${mano.saldo} (${mano.est})`);

  // Grabar: siguen confirmados y aptos; P2 queda en 0 y se quita; historial con quién y cuándo.
  await page.click('#btn-rfj-grabar');
  await esperar(page, async ()=> ((await registrosFotoRef.doc('RF-ADM-00001').get()).data().items || []).length === 1, null, 10000);
  await page.waitForFunction(()=> /registro\(s\) actualizado/.test($('rfj-msg').textContent), null, { timeout: 10000 });
  const d = await page.evaluate(async ()=>{ const g = async id=> (await registrosFotoRef.doc(id).get()).data();
    return { r1: await g('RF-ADM-00001'), r2: await g('RF-ADM-00002'), r4: await g('RF-ADM-00004'), hist: (document.querySelector('[data-rfj-saldo="0:0"]') || {}).parentElement ? document.querySelector('[data-rfj-saldo="0:0"]').parentElement.innerText.replace(/\s+/g, ' ') : '',
      deltaTras: document.querySelector('[data-rfj-delta="0:0"]').value, log: (await movimientosRef.where('tipo', '==', 'reg_foto_cantidades_editadas').get()).size }; });
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_ajustes_grabado.png'), fullPage: true });
  const it1 = d.r1.items.map(it=> `${it.sku}:${it.cantidad}`).join();
  verificar(d.r1.estado === 'CONFIRMADO' && d.r1.apto_ajuste === 'SI' && it1 === 'P1:4880' && d.r1.unidades === 4880 && d.r2.items[0].cantidad === 300 && d.r4.items[0].cantidad === 50 &&
    (d.r1.ajustes_admin || []).some(a=> a.origen === 'ajuste desde listado' && /P1: 5,000 → 4,880/.test(a.detalle) && /P2 quitado/.test(a.detalle)) && /✏ 5,000 → 4,880 · Administrador/.test(d.hist) && d.deltaTras === '' && d.log === 1,
    `Grabar: RF-ADM-00001 queda ${it1} (sigue CONFIRMADO y apto ${d.r1.apto_ajuste}); A02 y COMAS sin tocar; historial "${d.hist.slice(0, 70)}"; no vuelve a proponer el ajuste`);
  // En el detalle del registro se ve el mismo historial.
  await page.evaluate(()=>{ setRfSubtab('lista'); rfAbrir('RF-ADM-00001'); });
  const det = await page.evaluate(()=> $('rf-detalle').innerText.replace(/\s+/g, ' '));
  verificar(/✏ 5,000 → 4,880 · Administrador/.test(det), 'El detalle del registro muestra el ajuste debajo de la cantidad');
  verificar(!errores.length, 'Sin errores de JavaScript (admin)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  // Sin permiso de editar cantidades, no aparece «🔧 Ajustes».
  ({ browser, page, errores } = await abrirApp({ usuario: { email: 'yolanda@ejemplo.com', pass: 'prueba123' } }));
  await page.waitForFunction(()=> $('view-regfoto').classList.contains('active'), null, { timeout: 15000 });
  const sinPerm = await page.evaluate(()=> ({ tab: $('rfsub-ajustes').classList.contains('hidden-perm'), nav: [...document.querySelectorAll('.rfl-nav [data-rfl-ir="ajustes"]')].every(b=> b.hidden) }));
  verificar(sinPerm.tab && sinPerm.nav, 'Un usuario sin el permiso «Editar cantidades» no ve «🔧 Ajustes»');
  verificar(!errores.length, 'Sin errores de JavaScript (usuario)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
