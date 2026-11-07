// Registro fotográfico → Aptos: editar código y descripción desde el listado por código.
// Cambia los registros de esa fila (con los filtros elegidos); si el código nuevo ya está en el registro, se suman.
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
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async email=>{
    const base = { estado:'CONFIRMADO', participante:'CD VENEZUELA', usuario:'Administrador', usuario_email: email };
    const foto = n=> ({ url:'https://ejemplo.com/' + n + '.jpg', path:'registros_foto/x/' + n + '.jpg', tam: 100 });
    await registrosFotoRef.doc('RF-ADM-00001').set(Object.assign({}, base, { posicion:'A01', fecha_creacion:'2026-11-01T10:00:00.000Z', apto_ajuste:'SI',
      items:[{ sku:'P1', descripcion:'PELOTA', cantidad:5, fotos:[foto('a')] }, { sku:'P2', descripcion:'CAJA', cantidad:3, fotos:[] }], cant_items:2, unidades:8, skus:['P1','P2'] }));
    await registrosFotoRef.doc('RF-ADM-00002').set(Object.assign({}, base, { posicion:'A02', fecha_creacion:'2026-11-02T10:00:00.000Z', apto_ajuste:'SI',
      items:[{ sku:'P1', descripcion:'PELOTA', cantidad:4, fotos:[foto('b')] }, { sku:'P1X', descripcion:'PELOTA X', cantidad:2, fotos:[foto('c')] }], cant_items:2, unidades:6, skus:['P1','P1X'] }));
    // No apto: no sale en la fila de aptos, no se toca.
    await registrosFotoRef.doc('RF-ADM-00003').set(Object.assign({}, base, { posicion:'A03', fecha_creacion:'2026-11-03T10:00:00.000Z', apto_ajuste:'NO',
      items:[{ sku:'P1', descripcion:'PELOTA', cantidad:7, fotos:[] }], cant_items:1, unidades:7, skus:['P1'] }));
  }, ADMIN.email);
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('aptos'); });
  await page.waitForSelector('#rfa-body [data-rfa-sku="P1"]', { timeout: 15000 });

  // Abrir la fila P1 → botón Editar → cambiar a P1X "PELOTA ROJA".
  await page.click('#rfa-body [data-rfa-sku="P1"]');
  await page.click('[data-rfa-editar="P1"]');
  const aviso = await page.evaluate(()=> document.querySelector('.rfa-edit').innerText.replace(/\s+/g, ' '));
  await page.fill('#rfa-e-sku', 'p1x'); await page.fill('#rfa-e-desc', 'PELOTA ROJA');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_aptos_editar.png') });
  await page.click('[data-rfa-guardar="P1"]');
  await esperar(page, async ()=> ((await registrosFotoRef.doc('RF-ADM-00001').get()).data().skus || []).includes('P1X'), null, 10000);
  const d = await page.evaluate(async ()=>{ const g = async id=> (await registrosFotoRef.doc(id).get()).data(); return { r1: await g('RF-ADM-00001'), r2: await g('RF-ADM-00002'), r3: await g('RF-ADM-00003') }; });
  const txt = r=> r.items.map(it=> `${it.sku}:${it.cantidad}:${it.descripcion}:${it.fotos.length}`).join(',');
  verificar(/2 registro\(s\)/.test(aviso) && txt(d.r1) === 'P1X:5:PELOTA ROJA:1,P2:3:CAJA:0' && d.r1.skus.join() === 'P1X,P2' && d.r1.unidades === 8 &&
    txt(d.r2) === 'P1X:6:PELOTA ROJA:2' && d.r2.cant_items === 1 && d.r2.unidades === 6 && txt(d.r3) === 'P1:7:PELOTA:0' &&
    (d.r1.cambios_sku || [])[0].de === 'P1' && d.r1.cambios_sku[0].a === 'P1X',
    `Editar P1 → P1X "PELOTA ROJA": RF-1 ${txt(d.r1)} · RF-2 ${txt(d.r2)} (se suma con el P1X que ya tenía) · el no apto RF-3 queda ${txt(d.r3)}`);

  const tabla = await page.evaluate(()=> [...document.querySelectorAll('#rfa-body .rfa-fila')].map(tr=> [...tr.cells].slice(0, 3).map(c=> c.innerText.replace(/[▸▾]/g, '').trim()).join('|')).join(' / '));
  const log = await page.evaluate(async ()=> (await movimientosRef.where('tipo', '==', 'reg_foto_sku_editado').get()).docs.map(x=> x.data().detalle).join(' | '));
  verificar(tabla === 'P1X|PELOTA ROJA|11 / P2|CAJA|3' && /P1 → P1X/.test(log) && /2 registro\(s\)/.test(log),
    `La tabla queda ${tabla}; bitácora: ${log}`);

  // Sin permiso (solo registrar) no aparece el botón.
  await page.evaluate(()=>{ currentPermisos = Object.assign({}, currentPermisos, { admin:false, eliminar:false, rf_todos:false }); rfaAbierto = 'P2'; renderRfAptos(); });
  const sinBoton = await page.evaluate(()=> !document.querySelector('[data-rfa-editar]'));
  verificar(sinBoton, 'Sin permiso no aparece "Editar código / descripción"');

  verificar(!errores.length, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
