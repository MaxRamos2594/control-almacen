// Consumo de Firestore (plan gratuito): cuántos documentos se descargan del servidor al abrir la app.
//  - Caché local: al recargar, solo llega lo que cambió (no todo de nuevo).
//  - Un usuario que solo usa Registro fotográfico / Saldos no descarga pallets, validadores ni retiros.
// Requiere los emuladores encendidos (npm run emuladores).
const { abrirApp, limpiarEmuladores, PROYECTO } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
const listo = page=> page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 30000 });
const lecturas = page=> page.evaluate(()=> lecturasServidor);
// En la prueba todo se crea hace segundos: sin margen, para medir solo lo que cambió.
const SIN_MARGEN = 'window.__syncMargen = 0;';

(async ()=>{
  await limpiarEmuladores();
  let { browser, page, errores } = await abrirApp({ scriptInicial: SIN_MARGEN });
  await listo(page);
  // Datos de ejemplo: 300 productos, 200 pallets, 40 validadores, layout chico.
  await page.evaluate(async ()=>{
    const lote = async (ref, n, f)=>{ for(let i = 0; i < n; i += 400){ const b = db.batch(); for(let k = i; k < Math.min(n, i + 400); k++) b.set(ref.doc(f.id(k)), f.data(k)); await b.commit(); } };
    await lote(productosRef, 300, { id: k=> 'P' + k, data: k=> ({ descripcion: 'PRODUCTO ' + k, costo: 1 }) });
    await lote(palletsRef, 200, { id: k=> 'CD' + String(k).padStart(4, '0'), data: k=> ({ codigo: 'CD' + k, estado: 'ALMACENADO' }) });
    await lote(validadoresMaestroRef, 40, { id: k=> String(10000000 + k), data: k=> ({ nombre: 'VALIDADOR ' + k }) });
    await bloquesRef.doc('B1').set({ nombre: 'BLOQUE A' });
    for(const c of ['A01', 'A02']) await posicionesRef.doc(c).set({ tipo: 'rack', nicho: 'A', bloque_id: 'B1', nivel: 'arriba', estado: 'vacio' });
    await usuariosRef.doc('operario@ejemplo.com').set({ email: 'operario@ejemplo.com', alias: 'OPERARIO', permisos: { reg_fotos: true } });
    await usuariosRef.doc('saldos@ejemplo.com').set({ email: 'saldos@ejemplo.com', alias: 'SALDOS', permisos: { saldos: true } });
  });
  await page.waitForTimeout(1000); await browser.close();
  // Primera vez en otro equipo (navegador nuevo, sin caché): descarga todo.
  ({ browser, page, errores } = await abrirApp({ scriptInicial: SIN_MARGEN }));
  await listo(page); await page.waitForTimeout(1500);
  const primera = await lecturas(page), cache = await page.evaluate(()=> firestoreCacheLocal);
  // Recargar: lo lee del equipo; del servidor llega solo lo que cambió.
  await page.reload(); await listo(page); await page.waitForTimeout(1500);
  const segunda = await lecturas(page), datos = await page.evaluate(()=> Object.keys(productos).length + Object.keys(pallets).length);
  verificar(cache && primera >= 540 && segunda < 60 && datos === 500,
    `Caché local: la primera vez llegan ${primera} documentos del servidor; al recargar solo ${segunda} (los datos siguen completos: ${datos} productos + pallets)`);
  await page.evaluate(()=> switchTab('almacenamiento'));
  const ind = await page.evaluate(()=> $('alm-consumo').innerText.replace(/\s+/g, ' '));
  verificar(/Esta sesión descargó \d+ documento/.test(ind) && /Caché local: ✔ activa/.test(ind), `Almacenamiento muestra el consumo: "${ind.slice(0, 120)}…"`);
  // Sincronización incremental: otro equipo cambia, crea y borra productos (y crea un registro fotográfico).
  const mod1 = await page.evaluate(()=> syncModo.productos);
  await page.evaluate(()=> registrosFotoRef.doc('RF-ADM-00001').set({ estado:'CONFIRMADO', participante:'CD VENEZUELA', posicion:'A01', usuario:'Administrador', usuario_email:'mramos@corporaciongrit.com', fecha_creacion:'2026-11-01T10:00:00.000Z', items:[] }));
  await page.evaluate(async ()=>{ switchTab('regfoto'); await rfCargar(true); });
  const rf1 = await page.evaluate(()=> rfLista.length);
  const otro = await abrirApp({ scriptInicial: SIN_MARGEN }); await listo(otro.page);
  await otro.page.evaluate(async ()=>{
    await productosRef.doc('P5').update({ costo: 9 }); await productosRef.doc('P999').set({ descripcion:'NUEVO', costo: 2 }); await productosRef.doc('P7').delete();
    await registrosFotoRef.doc('RF-ADM-00002').set({ estado:'CONFIRMADO', participante:'CD VENEZUELA', posicion:'A02', usuario:'Administrador', usuario_email:'mramos@corporaciongrit.com', fecha_creacion:'2026-11-02T10:00:00.000Z', items:[] });
  });
  const marcas = await otro.page.evaluate(async ()=> ({ sync: !!(await productosRef.doc('P5').get()).data().sync_en, tumba: (await db.collection('borrados_productos').doc('P7').get()).exists }));
  await otro.browser.close();
  // En vivo: los cambios llegan solos.
  const vivo = await page.waitForFunction(()=> productos.P5 && productos.P5.costo === 9 && !!productos.P999 && !productos.P7, null, { timeout: 15000 }).then(()=> true, ()=> false);
  // Registros: al volver a abrirlos solo llega lo nuevo (incremental).
  const antesRf = await lecturas(page);
  await page.evaluate(()=>{ rfLeidos = false; return rfCargar(); });
  const rf2 = await page.evaluate(()=> ({ n: rfLista.length, modo: syncModo.registros_foto })), lectRf = (await lecturas(page)) - antesRf;
  // Al volver a abrir: incremental; el producto borrado no vuelve.
  await page.reload(); await listo(page); await page.waitForTimeout(1500);
  const tras = await page.evaluate(()=> ({ lect: lecturasServidor, modo: syncModo.productos, p5: productos.P5 && productos.P5.costo, p999: !!productos.P999, p7: !!productos.P7, n: Object.keys(productos).length }));
  await page.reload(); await listo(page); await page.waitForTimeout(1500);
  const tras2 = await page.evaluate(()=> ({ p7: !!productos.P7, n: Object.keys(productos).length, modo: syncModo.productos }));
  verificar(mod1 === 'incremental' && marcas.sync && marcas.tumba && vivo && tras.modo === 'incremental' && tras.p5 === 9 && tras.p999 && !tras.p7 && tras.n === 300 && !tras2.p7 && tras2.n === 300,
    `Productos incrementales: al abrir de nuevo solo se piden los cambios (${tras.modo}, ${tras.lect} lecturas en total); el cambio de costo, el nuevo y el borrado llegan en vivo y quedan al volver a abrir (${tras.n} productos, el borrado no vuelve)`);
  verificar(rf1 === 1 && rf2.n === 2 && rf2.modo === 'incremental' && lectRf <= 3, `Registros (ve todos): al volver a abrirlos solo llega lo nuevo (${rf2.n} registros, ${lectRf} lecturas)`);
  // Un equipo con una versión antigua escribe un traslado SIN marca de cambio: «↻ Actualizar» lo trae igual (lectura completa).
  await page.evaluate(async ()=>{ switchTab('saldos'); setSdSubtab('lista'); await new Promise(r=> setTimeout(r, 1500)); });
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/${PROYECTO}/databases/(default)/documents/saldos_traslados?documentId=TS-09999`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { correlativo: { stringValue: 'TS-09999' }, estado: { stringValue: 'CERRADO' }, tienda: { stringValue: 'COMAS' }, fecha: { stringValue: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) }, usuario: { stringValue: 'CELULAR VIEJO' }, usuario_email: { stringValue: 'viejo@ejemplo.com' } } }) });
  const sinMarca = await page.evaluate(async ()=>{ await sdCargarLista(false); return sdLista.some(t=> t.id === 'TS-09999'); });
  await page.click('#btn-sd-recargar');
  const conActualizar = await page.waitForFunction(()=> sdLista.some(t=> t.id === 'TS-09999'), null, { timeout: 10000 }).then(()=> true, ()=> false);
  verificar(r.ok && !sinMarca && conActualizar, `Traslado escrito por una versión antigua (sin marca): al abrir no se ve (${sinMarca}); «↻ Actualizar» lo trae (${conActualizar})`);
  // Aviso de versión nueva.
  const aviso = await page.evaluate(async ()=>{ const f = window.fetch; window.fetch = async ()=> ({ ok: true, json: async ()=> ({ version: 'v99999' }) });
    versionRevisadaEn = 0; await revisarVersion(); window.fetch = f; return { visible: !$('aviso-version').hidden, txt: $('aviso-version').innerText }; });
  const igual = await page.evaluate(async ()=>{ $('aviso-version').hidden = true; versionRevisadaEn = 0; await revisarVersion(); return $('aviso-version').hidden; });
  verificar(aviso.visible && /v99999/.test(aviso.txt) && igual, `Aviso de versión nueva: "${aviso.txt.replace(/\s+/g, ' ').trim()}"; con la misma versión no aparece`);
  verificar(!errores.length, 'Sin errores de JavaScript (admin)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  // Operario (solo Registro fotográfico): layout, productos y participantes; nada de pallets, validadores ni retiros.
  ({ browser, page, errores } = await abrirApp({ usuario: { email: 'operario@ejemplo.com', pass: 'prueba123' }, scriptInicial: SIN_MARGEN }));
  await listo(page); await page.waitForTimeout(1500);
  const op = await page.evaluate(()=> ({ lect: lecturasServidor, pallets: Object.keys(pallets).length, val: Object.keys(validadoresMaestroCache || {}).length, prod: Object.keys(productos).length, pos: Object.keys(posiciones).length }));
  verificar(op.pallets === 0 && op.val === 0 && op.prod === 300 && op.pos === 2 && op.lect < primera - 200,
    `Operario de Registro fotográfico: ${op.lect} documentos (sin pallets ni validadores; con ${op.prod} productos y ${op.pos} posiciones) — "Sincronizado en vivo"`);
  verificar(!errores.length, 'Sin errores de JavaScript (operario)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  // Solo Saldos: ni siquiera el layout.
  ({ browser, page, errores } = await abrirApp({ usuario: { email: 'saldos@ejemplo.com', pass: 'prueba123' }, scriptInicial: SIN_MARGEN }));
  await listo(page); await page.waitForTimeout(1500);
  const sd = await page.evaluate(()=> ({ lect: lecturasServidor, pallets: Object.keys(pallets).length, pos: Object.keys(posiciones).length, prod: Object.keys(productos).length, tiendas: $('sd-tienda').options.length }));
  verificar(sd.pallets === 0 && sd.pos === 0 && sd.prod === 300 && sd.tiendas >= 1, `Usuario de Saldos: ${sd.lect} documentos (solo productos y tiendas)`);
  verificar(!errores.length, 'Sin errores de JavaScript (saldos)' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await browser.close();

  console.log(fallas ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
