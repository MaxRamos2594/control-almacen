// Cargar Guía: a qué campaña y participante pertenece una guía.
// - Las campañas guardan su lista de códigos (skus_lista) en la cabecera: la guía
//   se compara sin descargar los repartos. Las antiguas se descargan una sola vez
//   y se les guarda la lista.
// - El participante sale primero del maestro (nombre, otros nombres o palabras de
//   dirección en el punto de llegada) y se usa el nombre que tiene en la campaña.
// Requiere los emuladores encendidos (npm run emuladores).
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{
    const hoy = firebase.firestore.Timestamp.now();
    // REG-00070: nueva (con skus_lista); REG-00071: antigua (sin lista)
    await campanaRegistrosRef.doc('REG-00070').set({ correlativo:'REG-00070', campana:'NUEVA', estado:'ACTIVO', fecha_carga: hoy, skus_lista:['A1','A2','A3'], participantes_lista:['SJL','MALL PLAZA COMAS'] });
    await campanaRegistrosRef.doc('REG-00071').set({ correlativo:'REG-00071', campana:'ANTIGUA', estado:'ACTIVO', fecha_carga: hoy });
    for(const [t, sku] of [['ATE','B1'],['ATE','B2'],['ICA','B1']]) await campanaItemsRef.doc().set({ correlativo:'REG-00071', participante:t, sku, cantidad:1 });
    const pm = (id, nombre, alias, palabras)=> participantesMaestroRef.doc(id).set({ nombre, zona:'LIMA', alias, palabras_direccion: palabras, activo:true });
    await pm('SAN JUAN DE LURIGANCHO', 'SAN JUAN DE LURIGANCHO', ['SJL'], ['CANTO GRANDE']);
    await pm('MALL PLAZA COMAS', 'MALL PLAZA COMAS', [], ['TUPAC AMARU']);
    await pm('COMAS', 'COMAS', [], []);
    await cargarRegistrosCampana(true);
  });
  await page.waitForFunction(()=> Object.keys(participantesMaestroCache).length === 3, null, { timeout: 10000 });

  // Contar cuántas veces se descarga un reparto
  await page.evaluate(()=>{ const orig = campanaItemsRef.where.bind(campanaItemsRef); window.__descargas = 0;
    campanaItemsRef.where = (...a)=>{ window.__descargas++; return orig(...a); }; });
  const r1 = await page.evaluate(async ()=>{ await cargarFilasCampanasActivas(); const s = await sugerirCampanaYParticipante({ items:[{ codigo:'a 1' },{ codigo:'A2' },{ codigo:'Z9' }], punto_llegada:'AV. CANTO GRANDE 123, SAN JUAN DE LURIGANCHO, LIMA' });
    return { s, descargas: window.__descargas, cab: (await campanaRegistrosRef.doc('REG-00071').get()).data() }; });
  verificar(r1.descargas === 1, `Solo se descarga el reparto de la campaña antigua (${r1.descargas} descarga)`);
  verificar(r1.cab.skus_lista.join() === 'B1,B2' && r1.cab.participantes_lista.join() === 'ATE,ICA', `A la antigua se le guarda su lista de códigos (${r1.cab.skus_lista.join()}) y tiendas`);
  verificar(r1.s.correlativo === 'REG-00070' && r1.s.porcentajesPorCampana['REG-00070'] === 67 && r1.s.porcentajesPorCampana['REG-00071'] === 0, `Sugiere REG-00070 (67% de códigos) sin descargar su reparto`);
  verificar(r1.s.participante === 'SJL', `Participante por el maestro: "CANTO GRANDE / SAN JUAN DE LURIGANCHO" → el nombre que usa la campaña (${r1.s.participante})`);

  const r2 = await page.evaluate(async ()=>{ window.__descargas = 0; delete campRegCache['REG-00071']; await cargarRegistrosCampana(true); await cargarFilasCampanasActivas();
    return { descargas: window.__descargas, mall: buscarParticipanteEnTexto('REG-00070', 'AV. TUPAC AMARU KM 22, COMAS, LIMA'), nada: buscarParticipanteEnTexto('REG-00070', 'AV. ARICA 100, BREÑA') }; });
  verificar(r2.descargas === 0, `La segunda vez ya no se descarga ningún reparto (${r2.descargas})`);
  verificar(r2.mall === 'MALL PLAZA COMAS', `"TUPAC AMARU … COMAS" → MALL PLAZA COMAS por sus palabras de dirección (${r2.mall})`);
  verificar(r2.nada === '', 'Sin coincidencias no sugiere nada');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
