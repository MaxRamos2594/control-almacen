// Registro fotográfico: fusionar registros desde el layout (clic derecho).
//  - Los 2 registros de una misma posición en uno solo.
//  - Dos posiciones distintas: se elige la otra y en cuál queda.
// Los SKU repetidos se suman. Requiere los emuladores encendidos (npm run emuladores).
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
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    await bloquesRef.doc('B1').set({ nombre:'BLOQUE A', creado_en: ts });
    await nichosRef.doc('A').set({ bloque_id:'B1', orden:0, pos_visual:0, tipo:'solo_rack', niveles:2, creado_en: ts });
    for(const [cod, nivel] of [['A01','arriba'],['A02','arriba'],['A03','abajo'],['A04','abajo']])
      await posicionesRef.doc(cod).set({ tipo:'rack', nicho:'A', bloque_id:'B1', nivel, estado:'vacio', bloqueada:false, pallet_codigo:null, actualizado: ts });
    const base = { estado:'CONFIRMADO', participante:'CD VENEZUELA', usuario:'Administrador', usuario_email: email };
    const foto = n=> ({ url:'https://ejemplo.com/' + n + '.jpg', path:'registros_foto/x/' + n + '.jpg', tam: 100 });
    await registrosFotoRef.doc('RF-ADM-00001').set(Object.assign({}, base, { posicion:'A01', fecha_creacion:'2026-11-01T10:00:00.000Z', foto_posicion: foto('pos1'),
      items:[{ sku:'P1', descripcion:'PELOTA', cantidad:5, fotos:[foto('p1a')] }], cant_items:1, unidades:5, skus:['P1'] }));
    await registrosFotoRef.doc('RF-ADM-00002').set(Object.assign({}, base, { posicion:'A02', fecha_creacion:'2026-11-02T10:00:00.000Z', foto_posicion: null,
      items:[{ sku:'P1', descripcion:'PELOTA', cantidad:3, fotos:[foto('p1b')] }, { sku:'P2', descripcion:'CAJA', cantidad:4, fotos:[] }], cant_items:2, unidades:7, skus:['P1','P2'] }));
    await registrosFotoRef.doc('RF-ADM-00003').set(Object.assign({}, base, { posicion:'A03', fecha_creacion:'2026-11-03T10:00:00.000Z', foto_posicion: null,
      items:[{ sku:'P9', descripcion:'MUÑECA', cantidad:2, fotos:[] }], cant_items:1, unidades:2, skus:['P9'] }));
    await registrosFotoRef.doc('RF-ADM-00004').set(Object.assign({}, base, { posicion:'A03', fecha_creacion:'2026-11-04T10:00:00.000Z', foto_posicion: null,
      apto_ajuste:'SI', apto_ajuste_por:'Administrador', apto_ajuste_en:'2026-11-04T11:00:00.000Z',
      items:[{ sku:'P9', descripcion:'MUÑECA', cantidad:6, fotos:[] }, { sku:'P3', descripcion:'AUTO', cantidad:1, fotos:[] }], cant_items:2, unidades:7, skus:['P9','P3'] }));
  }, ADMIN.email);
  await page.waitForFunction(()=> !!posiciones['A04'] && !!bloques['B1'], null, { timeout: 10000 });
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('layout'); });
  await page.waitForFunction(()=> document.querySelector('#rfl-mapa .slot[data-id="A03"].rfl-n'), null, { timeout: 15000 });

  // 1) Misma posición: A03 tiene 2 registros → quedan en uno (el más antiguo) y P9 se suma (2 + 6).
  await page.click('#rfl-mapa .slot[data-id="A03"]', { button: 'right' });
  const menu3 = await page.evaluate(()=> $('ctx-menu').innerText.replace(/\s+/g, ' '));
  await page.click('#ctx-menu [data-rfl-f="aqui"]');
  await esperar(page, async ()=> !(await registrosFotoRef.doc('RF-ADM-00004').get()).exists, null, 10000);
  const r3 = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-ADM-00003').get()).data());
  const cls3 = await page.evaluate(()=> document.querySelector('#rfl-mapa .slot[data-id="A03"]').className);
  verificar(/Fusionar los 2 registros/.test(menu3) && r3.items.map(it=> it.sku + ':' + it.cantidad).join(',') === 'P9:8,P3:1' && r3.unidades === 9 && r3.cant_items === 2 &&
    r3.skus.join() === 'P9,P3' && r3.apto_ajuste === 'SI' && (r3.fusionado_de || []).join() === 'RF-ADM-00004' && r3.posicion === 'A03' && /rfl-1/.test(cls3),
    `Misma posición: A03 queda con RF-ADM-00003 (${r3.items.map(it=> it.sku + ':' + it.cantidad).join(', ')} · ${r3.unidades} und, apto ${r3.apto_ajuste}); RF-ADM-00004 se borra; A03 pasa a verde`);

  // 2) Dos posiciones: A01 + A02, queda en A02 (su registro conserva el número); P1 se suma 3 + 5 con las fotos de ambos.
  await page.click('#rfl-mapa .slot[data-id="A01"]', { button: 'right' });
  await page.click('#ctx-menu [data-rfl-f="otra"]');
  const aviso = await page.evaluate(()=> $('rfl-fusion-aviso').style.display !== 'none' && $('rfl-fusion-aviso').innerText);
  await page.click('#rfl-mapa .slot[data-id="A02"]');
  await page.waitForSelector('#ctx-menu [data-rfl-queda="A02"]', { state:'visible', timeout: 5000 });
  const elegir = await page.evaluate(()=> $('ctx-menu').innerText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_fusion.png') });
  await page.click('#ctx-menu [data-rfl-queda="A02"]');
  await esperar(page, async ()=> !(await registrosFotoRef.doc('RF-ADM-00001').get()).exists, null, 10000);
  const r2 = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-ADM-00002').get()).data());
  const lay = await page.evaluate(()=> ['A01','A02'].map(c=> document.querySelector(`#rfl-mapa .slot[data-id="${c}"]`).classList.contains('rfl-0') ? '0' : '1').join(''));
  verificar(/Toca la posición con la que se fusiona A01/.test(aviso) && /Queda en A01/.test(elegir) && /Queda en A02/.test(elegir) &&
    r2.items.map(it=> it.sku + ':' + it.cantidad + ':' + it.fotos.length).join(',') === 'P1:8:2,P2:4:0' && r2.unidades === 12 && r2.posicion === 'A02' &&
    r2.foto_posicion && r2.foto_posicion.path === 'registros_foto/x/pos1.jpg' && (r2.fusionado_de || []).join() === 'RF-ADM-00001' && lay === '01',
    `Dos posiciones: A01 + A02 → queda RF-ADM-00002 en A02 (${r2.items.map(it=> it.sku + ':' + it.cantidad).join(', ')} · ${r2.unidades} und, 2 fotos de P1, foto de posición de A01); A01 queda gris`);

  // Detalle y bitácora.
  await page.click('#rfl-mapa .slot[data-id="A02"]');
  await page.waitForFunction(()=> !$('rf-det-modal').hidden, null, { timeout: 10000 });
  const det = await page.evaluate(()=> $('rf-detalle').innerText);
  const log = await page.evaluate(async ()=> (await movimientosRef.where('tipo', '==', 'reg_foto_fusionado').get()).docs.map(d=> d.data().detalle).sort());
  verificar(/Fusionado con RF-ADM-00001/.test(det) && log.length === 2 && /RF-ADM-00001 → RF-ADM-00002/.test(log.join(' | ')),
    `El detalle dice "🔗 Fusionado con RF-ADM-00001" y la bitácora lo registra (${log.join(' | ')})`);
  await page.evaluate(()=> rfCerrarDetalle());

  // Sin permiso de eliminar (solo "ver todos") no aparece la opción de fusionar.
  await page.evaluate(()=>{ currentPermisos = Object.assign({}, currentPermisos, { admin:false, eliminar:false, rf_todos:true }); });
  await page.click('#rfl-mapa .slot[data-id="A02"]', { button: 'right' });
  const sinPermiso = await page.evaluate(()=> !document.querySelector('#ctx-menu [data-rfl-f]') && !!document.querySelector('#ctx-menu [data-rfl-m]'));
  verificar(sinPermiso, 'Sin permiso de eliminar no aparece "Fusionar" (sí bloquear / merma)');

  verificar(!errores.length, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
