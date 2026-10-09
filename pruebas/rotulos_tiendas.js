// Rótulos de Campaña: la lista de tiendas carga rápido y avisa si tarda.
//  - Campañas nuevas traen la lista de tiendas en su encabezado (sin descargar filas).
//  - Campañas antiguas descargan sus filas una sola vez (en paralelo) y se les
//    guarda la lista; la segunda vez ya no se descarga nada.
//  - Si tarda más de 50 ms, el desplegable muestra "Cargando tiendas…" y se bloquea.
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
    const cab = (id, extra)=> campanaRegistrosRef.doc(id).set(Object.assign({ correlativo:id, campana:'CAMP '+id, estado:'ACTIVO', fecha_carga: hoy, total_filas:0 }, extra));
    // Antiguas (sin participantes_lista): sus filas se descargan la primera vez
    await cab('CAMP-0001', {}); await cab('CAMP-0002', {});
    for(const [corr, tiendas] of [['CAMP-0001', ['ATE','COMAS','ICA']], ['CAMP-0002', ['PIURA','ATE','TACNA']]]){
      for(let i=0;i<1200;i+=400){
        const b = db.batch();
        for(let k=i;k<i+400;k++) b.set(campanaItemsRef.doc(), { correlativo: corr, participante: tiendas[k % tiendas.length], sku:'S'+k, cantidad:1 });
        await b.commit();
      }
    }
    // Nuevas: traen la lista en el encabezado
    await cab('CAMP-0003', { participantes_lista: ['AREQUIPA','HUAYCÁN'] });
    await cab('CAMP-0004', { participantes_lista: ['VMT','ATE'] });
    // Invalidada: no debe aparecer
    await cab('CAMP-0005', { estado:'INVALIDADO', participantes_lista: ['NO DEBE SALIR'] });
    // Contador de descargas de filas y retardo de red simulado
    window.__descargasFilas = 0;
    const whereOrig = campanaItemsRef.where.bind(campanaItemsRef);
    campanaItemsRef.where = (...args)=>{ const q = whereOrig(...args); const getOrig = q.limit ? null : null;
      const envolver = (qq)=> new Proxy(qq, { get(t, prop){ if(prop==='get') return async (...a)=>{ window.__descargasFilas++; const ini = performance.now(); await new Promise(r=> setTimeout(r, 400)); const res = await t.get(...a); (window.__tramos = window.__tramos || []).push([ini, performance.now()]); return res; };
        if(prop==='limit' || prop==='where' || prop==='orderBy') return (...a)=> envolver(t[prop](...a)); const v = t[prop]; return typeof v === 'function' ? v.bind(t) : v; } });
      return envolver(q); };
  });
  // La preparación en segundo plano (4 s después de entrar) pudo correr mientras
  // se sembraban los datos: se espera y se deja todo como antes de la actualización.
  await page.waitForTimeout(4500);
  await page.evaluate(async ()=>{
    for(const c of ['CAMP-0001','CAMP-0002']) await campanaRegistrosRef.doc(c).update({ participantes_lista: firebase.firestore.FieldValue.delete() });
    rotcTiendasMemo = { clave:null, tiendas:[] }; campRegAllCache = []; campRegCache = {}; window.__descargasFilas = 0; window.__tramos = [];
  });
  await page.evaluate(()=> switchTab('rotulos'));
  await page.waitForTimeout(300);

  // Primera vez: hay campañas antiguas → tarda (red lenta simulada) → aviso de carga
  const t0 = Date.now();
  await page.click('#rotsub-campana');
  await page.waitForTimeout(150);
  const durante = await page.evaluate(()=> ({ txt: $('rotc-tienda-select').options[0].text, bloqueado: $('rotc-tienda-select').disabled, msg: $('rotc-msg').innerText }));
  const opcionesDurante = await page.evaluate(()=> [...$('rotc-tienda-select').options].map(o=> o.text).join(' | '));
  verificar(/Cargando/.test(opcionesDurante), `Mientras carga, el desplegable lo indica: "${opcionesDurante.slice(0,90)}…"`);
  verificar(/de 4 campaña/.test(durante.msg), `Muestra el avance: "${durante.msg}"`);
  const parcial = await page.evaluate(()=> ({ opciones: [...$('rotc-tienda-select').options].map(o=> o.text), bloqueado: $('rotc-tienda-select').disabled }));
  verificar(!parcial.bloqueado && parcial.opciones.includes('AREQUIPA') && parcial.opciones.some(t=> /Cargando más tiendas/.test(t)), `Ya se puede elegir entre las tiendas que llegaron (${parcial.opciones.slice(1,4).join(', ')}…) mientras cargan las demás`);
  await page.waitForFunction(()=> !$('rotc-tienda-select').disabled && $('rotc-tienda-select').options.length > 1 && ![...$('rotc-tienda-select').options].some(o=> /Cargando/.test(o.text)), null, { timeout: 20000 });
  const ms1 = Date.now() - t0;
  const r1 = await page.evaluate(()=> ({ tiendas: [...$('rotc-tienda-select').options].slice(1).map(o=> o.value), descargas: window.__descargasFilas, tramos: window.__tramos || [], msgVisible: $('rotc-msg').style.display !== 'none' && /Cargando/.test($('rotc-msg').innerText) }));
  verificar(r1.tiendas.join(',') === 'AREQUIPA,ATE,COMAS,HUAYCÁN,ICA,PIURA,TACNA,VMT', `Tiendas de las 4 campañas activas, sin repetir ni la invalidada: ${r1.tiendas.join(', ')}`);
  verificar(r1.descargas === 2, `Solo se descargaron las filas de las 2 campañas antiguas (${r1.descargas})`);
  const [a, b] = r1.tramos.slice().sort((x,y)=> x[0]-y[0]);
  verificar(a && b && b[0] < a[1], `Las 2 descargas fueron en paralelo: la 2ª empezó ${a&&b ? Math.round(b[0]-a[0]) : '?'} ms después de la 1ª, que duró ${a ? Math.round(a[1]-a[0]) : '?'} ms (total ${ms1} ms)`);
  verificar(!r1.msgVisible, 'Al terminar se quita el aviso de carga');

  // Se guardó la lista en las campañas antiguas
  const guardadas = await page.evaluate(async ()=>{
    await new Promise(r=> setTimeout(r, 500));
    const a = await campanaRegistrosRef.doc('CAMP-0001').get(), b = await campanaRegistrosRef.doc('CAMP-0002').get();
    return [a.data().participantes_lista, b.data().participantes_lista];
  });
  verificar(guardadas[0] && guardadas[0].join(',') === 'ATE,COMAS,ICA' && guardadas[1].join(',') === 'ATE,PIURA,TACNA', `Las campañas antiguas guardaron su lista: ${JSON.stringify(guardadas)}`);

  // Segunda vez (misma sesión): instantáneo, sin descargas ni aviso
  await page.click('#rotsub-pallet');
  await page.evaluate(()=> { window.__descargasFilas = 0; });
  const t1 = Date.now();
  await page.click('#rotsub-campana');
  await page.waitForFunction(()=> !$('rotc-tienda-select').disabled && $('rotc-tienda-select').options.length > 1, null, { timeout: 5000 });
  const ms2 = Date.now() - t1;
  const r2 = await page.evaluate(()=> ({ descargas: window.__descargasFilas, txt: $('rotc-tienda-select').options[0].text }));
  verificar(r2.descargas === 0 && ms2 < 300 && /Selecciona/.test(r2.txt), `Segunda vez: ${ms2} ms, ${r2.descargas} descargas, sin aviso`);

  // Recargando la app: las campañas antiguas ya tienen lista → sin descargas
  await page.reload();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(()=>{ window.__descargasFilas = 0; const w = campanaItemsRef.where.bind(campanaItemsRef); campanaItemsRef.where = (...a)=>{ window.__descargasFilas++; return w(...a); }; switchTab('rotulos'); });
  await page.click('#rotsub-campana');
  await page.waitForFunction(()=> $('rotc-tienda-select').options.length > 1, null, { timeout: 10000 });
  const r3 = await page.evaluate(()=> ({ n: $('rotc-tienda-select').options.length - 1, descargas: window.__descargasFilas }));
  verificar(r3.n === 8 && r3.descargas === 0, `Después de recargar la app: ${r3.n} tiendas sin descargar ninguna fila (${r3.descargas})`);

  // Preparación en segundo plano: al entrar, sin abrir Rótulos, las campañas sin lista la generan
  await page.evaluate(async ()=>{ for(const c of ['CAMP-0001','CAMP-0002']) await campanaRegistrosRef.doc(c).update({ participantes_lista: firebase.firestore.FieldValue.delete() }); });
  await page.reload();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.waitForTimeout(7000);
  const pre = await page.evaluate(async ()=>{ const a = await campanaRegistrosRef.doc('CAMP-0001').get(); return { lista: a.data().participantes_lista, memo: rotcTiendasMemo.tiendas.length }; });
  verificar(pre.lista && pre.lista.join(',') === 'ATE,COMAS,ICA' && pre.memo === 8, `Al entrar a la app se prepara sola la lista (sin abrir Rótulos): ${JSON.stringify(pre)}`);
  await page.evaluate(()=>{ window.__descargasFilas = 0; const w = campanaItemsRef.where.bind(campanaItemsRef); campanaItemsRef.where = (...a)=>{ window.__descargasFilas++; return w(...a); }; switchTab('rotulos'); });
  const t4 = Date.now();
  await page.click('#rotsub-campana');
  await page.waitForFunction(()=> $('rotc-tienda-select').options.length > 1, null, { timeout: 10000 });
  verificar(Date.now() - t4 < 300, `Al abrir Rótulos después, sale al instante (${Date.now() - t4} ms)`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
