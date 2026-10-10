// Análisis de Campañas: los desplegables no se quedan vacíos si la lista de
// campañas aún se está cargando, avisan "Cargando…" si tarda, y "Analizar"
// muestra su avance sin ocultarse a los 5 s. Con red lenta simulada.
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
    for(const [corr, tiendas] of [['CAMP-0001',['ATE','COMAS']], ['CAMP-0002',['PIURA','ICA','TACNA']]]){
      await campanaRegistrosRef.doc(corr).set({ correlativo:corr, campana:'CAMP '+corr, estado:'ACTIVO', fecha_carga: hoy, fecha_transaccion:'01/10/2026', total_filas: tiendas.length });
      for(const t of tiendas) await campanaItemsRef.doc().set({ correlativo: corr, participante: t, sku:'S1', producto:'PRODUCTO 1', cantidad:10 });
    }
    await guiaItemsRef.doc().set({ campana_correlativo:'CAMP-0001', participante:'ATE', codigo:'S1', descripcion:'PRODUCTO 1', cantidad:10 });
    // Red lenta simulada: cabeceras 1.5 s, filas de campaña 1.5 s, filas de guías 7 s.
    const lento = (ref, metodo, ms)=>{
      const orig = ref[metodo].bind(ref);
      ref[metodo] = (...args)=>{ const envolver = (qq)=> new Proxy(qq, { get(t, prop){
        if(prop==='get') return async (...a)=>{ await new Promise(r=> setTimeout(r, ms)); return t.get(...a); };
        if(['limit','where','orderBy','startAfter'].includes(prop)) return (...a)=> envolver(t[prop](...a));
        const v = t[prop]; return typeof v === 'function' ? v.bind(t) : v; } });
        return envolver(orig(...args)); };
    };
    lento(campanaRegistrosRef, 'orderBy', 1500);
    lento(campanaItemsRef, 'where', 1500);
    lento(guiaItemsRef, 'where', 7000);
    campRegCache = {}; anGuiaPorCampanaCache = {};
    // Como al entrar a la app: la lista de campañas se está cargando…
    cargarRegistrosCampana(true);
    switchTab('campanas');
  });
  // …y se abre Análisis antes de que termine (antes quedaba vacío para siempre).
  await page.click('#campsub-analisis');
  await page.waitForTimeout(300);
  const durante = await page.evaluate(()=> ({ txt: $('an-campana-select').options[0].text, bloqueado: $('an-campana-select').disabled }));
  verificar(/Cargando campañas/.test(durante.txt) && durante.bloqueado, `Mientras carga la lista: "${durante.txt}" (bloqueado)`);
  await page.waitForFunction(()=> !$('an-campana-select').disabled && $('an-campana-select').options.length > 1, null, { timeout: 10000 });
  const camp = await page.evaluate(()=> [...$('an-campana-select').options].map(o=> o.value));
  verificar(camp.join(',') === ',CAMP-0002,CAMP-0001' || camp.join(',') === ',CAMP-0001,CAMP-0002', `Al terminar se llena solo: ${camp.slice(1).join(', ')}`);
  const otros = await page.evaluate(()=> [$('val-campana-select').options.length, $('vch-campana-select').options.length]);
  verificar(otros[0] === 3 && otros[1] === 3, `Validadores y Vouchers también quedan con las 2 campañas (${otros.join(', ')})`);

  // Participantes: aviso mientras cargan; si se cambia de campaña, gana la última
  await page.selectOption('#an-campana-select', 'CAMP-0001');
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(()=> ({ txt: $('an-participante-select').options[0].text, bloqueado: $('an-participante-select').disabled }));
  verificar(/Cargando participantes/.test(p1.txt) && p1.bloqueado, `Mientras cargan los participantes: "${p1.txt}"`);
  await page.selectOption('#an-campana-select', 'CAMP-0002');
  await page.waitForFunction(()=> !$('an-participante-select').disabled && $('an-participante-select').options.length > 1, null, { timeout: 10000 });
  await page.waitForTimeout(1800); // que termine también la descarga de CAMP-0001
  const parts = await page.evaluate(()=> [...$('an-participante-select').options].slice(1).map(o=> o.value).join(','));
  verificar(parts === 'ICA,PIURA,TACNA', `Cambiando de campaña mientras carga, quedan los participantes de la última: ${parts}`);

  // Analizar: avance visible pasados los 5 s
  await page.selectOption('#an-campana-select', 'CAMP-0001');
  await page.waitForFunction(()=> $('an-participante-select').options.length > 1, null, { timeout: 10000 });
  await page.click('#btn-analizar');
  await page.waitForTimeout(6000);
  const a = await page.evaluate(()=> ({ visible: getComputedStyle($('an-msg')).display !== 'none', txt: $('an-msg').innerText, giro: !!document.querySelector('#an-msg .giro'), boton: $('btn-analizar').disabled }));
  verificar(a.visible && a.giro && a.boton && /^Analizando… descargando las guías de salida · [56] s$/.test(a.txt), `A los 6 s sigue el aviso: "${a.txt}"`);
  await page.waitForFunction(()=> !$('btn-analizar').disabled, null, { timeout: 20000 });
  const fin = await page.evaluate(()=> ({ res: $('an-resultados').style.display, msg: getComputedStyle($('an-msg')).display }));
  verificar(fin.res !== 'none' && fin.msg === 'none', 'Al terminar muestra el análisis y quita el aviso');

  // Segunda vez: ya está todo en memoria, sin aviso
  await page.click('#campsub-registros'); await page.click('#campsub-analisis');
  const t0 = Date.now();
  await page.waitForTimeout(100);
  const r2 = await page.evaluate(()=> ({ n: $('an-campana-select').options.length, bloqueado: $('an-campana-select').disabled }));
  verificar(r2.n === 3 && !r2.bloqueado, `Volviendo a Análisis la lista sale al instante (${Date.now() - t0} ms)`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
