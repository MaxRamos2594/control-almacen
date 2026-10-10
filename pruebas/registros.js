// Campañas: subpestañas agrupadas (Cargar · Consultar · Gestionar) y
// "Registros y Detalle" con indicadores, campañas y guías lado a lado, guías
// por campaña (se leen todas, aunque sean más de 200) y filtro al elegir una.
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, context, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{
    const ts = n=> firebase.firestore.Timestamp.fromMillis(Date.UTC(2026, 9, 1) + n * 60000);
    const camp = [['REG-00001','CAMPAÑA 01-10','ACTIVO'],['REG-00002','CAMPAÑA 02-10','ACTIVO'],['REG-00003','CAMPAÑA 03-10','ACTIVO'],['REG-00004','CAMPAÑA 04-10','ACTIVO'],['REG-00005','CAMPAÑA VIEJA','INVALIDADO']];
    for(const [i, [c, n, e]] of camp.entries()) await campanaRegistrosRef.doc(c).set({ correlativo:c, campana:n, codigo:'CAMP-'+i, estado:e, fecha_carga: ts(i), fecha_transaccion:'2026-10-0'+(i+1), sku_distintos:10+i, total_filas:100*(i+1), usuario:'VICTOR' });
    let b = db.batch();
    for(let k = 0; k < 250; k++){
      const c = k < 150 ? 'REG-00001' : 'REG-00002';
      b.set(guiasRegistrosRef.doc('G' + k), { correlativo:'GUIA-' + String(k).padStart(5,'0'), nro_guia:'TG01-' + k, campana_correlativo:c, campana_nombre: c === 'REG-00001' ? 'CAMPAÑA 01-10' : 'CAMPAÑA 02-10',
        participante:'ATE', fecha_traslado:'2026-10-05', punto_partida:'CALLE SANTA FRANCISCA ROMANA 890, LIMA', punto_llegada:'URB. SOL DE VITARTE CAL S/N MZ F LOTE 14, ATE, LIMA, LIMA, PERU',
        total_items: 10, bultos: 2, estado:'ACTIVO', usuario:'VICTOR', fecha_carga: ts(100 + k) });
      if(k % 200 === 199){ await b.commit(); b = db.batch(); }
    }
    // Guía invalidada de REG-00003: no cuenta
    b.set(guiasRegistrosRef.doc('GX'), { correlativo:'GUIA-99999', nro_guia:'TG01-X', campana_correlativo:'REG-00003', campana_nombre:'CAMPAÑA 03-10', participante:'ICA', estado:'INVALIDADO', bultos: 50, fecha_carga: ts(999) });
    await b.commit();
    await cargarRegistrosCampana(true); await cargarRegistrosGuias(true);
    switchTab('campanas');
  });

  // Subpestañas agrupadas
  const g = await page.evaluate(()=> [...document.querySelectorAll('#view-campanas > .subtabs .subgrupo')].map(x=> x.querySelector('.subgrupo-t').innerText + ':' + x.querySelectorAll('button').length));
  verificar(g.join(' ') === 'CARGAR:2 CONSULTAR:3 GESTIONAR:3', `Subpestañas agrupadas: ${g.join(' · ')}`);
  await page.locator('#view-campanas > .subtabs').screenshot({ path: path.join(__dirname, 'salida', 'subpestanas.png') });

  await page.click('#campsub-registros');
  await page.waitForFunction(()=> guiaRegNoMore && guiaRegAllCache.length === 251, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  const k = await page.evaluate(()=> [...document.querySelectorAll('#reg-kpis .reg-kpi')].map(x=> x.querySelector('.t').innerText + '=' + x.querySelector('.v').innerText).join(' | '));
  verificar(k === 'CAMPAÑAS ACTIVAS=4 | GUÍAS ACTIVAS=250 | BULTOS EN GUÍAS=500 | CAMPAÑAS SIN GUÍAS=2', `Indicadores (se leyeron las 251 guías, más de 200): ${k}`);
  const lado = await page.evaluate(()=>{ const [a, b] = [...document.querySelectorAll('#campsub-panel-registros .reg-dos-col > .panel')].map(p=> p.getBoundingClientRect()); return { izq: a.left < b.left, arriba: Math.abs(a.top - b.top) < 2, scroll: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  verificar(lado.izq && lado.arriba && lado.scroll, 'Campañas a la izquierda y guías a la derecha, a la misma altura y sin desplazamiento lateral');
  const badges = await page.evaluate(()=> [...document.querySelectorAll('#camp-reg-body tr')].map(r=> r.cells[0].innerText + ':' + r.cells[5].innerText).join(' '));
  verificar(badges === 'REG-00004:0 REG-00003:0 REG-00002:100 REG-00001:150', `Guías por campaña (la invalidada no cuenta): ${badges}`);
  await page.locator('#campsub-panel-registros').screenshot({ path: path.join(__dirname, 'salida', 'registros.png') });

  // Elegir una campaña → solo sus guías
  await page.click('#camp-reg-body tr[data-reg-corr="REG-00002"] td:nth-child(2)');
  await page.waitForTimeout(300);
  let r = await page.evaluate(()=> ({ filas: document.querySelectorAll('#guia-reg-body tr').length, chip: $('guia-reg-chip').innerText, sel: document.querySelector('#camp-reg-body tr.reg-sel').dataset.regCorr }));
  verificar(r.filas === 100 && /Guías de REG-00002 — CAMPAÑA 02-10 · 100/.test(r.chip) && r.sel === 'REG-00002', `Clic en REG-00002: ${r.filas} guías y aviso "${r.chip.replace(/\s*✕/, '')}"`);
  await page.click('#camp-reg-body tr[data-reg-corr="REG-00003"] td:nth-child(1)');
  await page.waitForTimeout(300);
  r = await page.evaluate(()=> ({ filas: document.querySelectorAll('#guia-reg-body tr').length, vacio: $('guia-reg-empty').innerText }));
  verificar(r.filas === 0 && r.vacio === 'Esta campaña aún no tiene guías.', `Campaña sin guías: "${r.vacio}"`);
  await page.click('#guia-reg-chip [data-reg-quitar="campana"]');
  await page.waitForTimeout(300);
  verificar(await page.evaluate(()=> document.querySelectorAll('#guia-reg-body tr').length === 250 && !document.querySelector('#camp-reg-body tr.reg-sel')), '✕ vuelve a mostrar todas las guías');

  // Indicador "Campañas sin guías" como filtro
  await page.click('#reg-kpis [data-reg-sin-guias]');
  await page.waitForTimeout(300);
  r = await page.evaluate(()=> [...document.querySelectorAll('#camp-reg-body tr')].map(x=> x.dataset.regCorr).join(','));
  verificar(r === 'REG-00004,REG-00003', `Clic en "Campañas sin guías": ${r}`);
  await page.click('#reg-kpis [data-reg-sin-guias]');
  await page.waitForTimeout(200);

  // "Ver" sigue abriendo el detalle de la campaña
  await page.click('#camp-reg-body tr[data-reg-corr="REG-00001"] .btn-ver-detalle-campana');
  await page.waitForFunction(()=> $('camp-detalle-panel').style.display === 'block', null, { timeout: 10000 });
  verificar(/REG-00001 — CAMPAÑA 01-10/.test(await page.textContent('#camp-detalle-titulo-text')) && await page.evaluate(()=> !document.querySelector('#camp-reg-body tr.reg-sel')), '"Ver" abre el detalle sin elegir la campaña');

  // Celular: una columna y sin desplazamiento lateral de la página
  const movil = await context.newPage();
  await movil.setViewportSize({ width: 390, height: 820 });
  await movil.goto(page.url().replace(/#.*$/, ''));
  await movil.waitForSelector('#app-shell', { state:'visible', timeout: 20000 });
  await movil.evaluate(()=> switchTab('campanas'));
  await movil.click('#campsub-registros');
  await movil.waitForTimeout(1500);
  const m = await movil.evaluate(()=>{ const [a, b] = [...document.querySelectorAll('#campsub-panel-registros .reg-dos-col > .panel')].map(p=> p.getBoundingClientRect()); return { columna: b.top > a.bottom - 1, scroll: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  verificar(m.columna && m.scroll, 'Celular: campañas arriba y guías abajo, sin desplazamiento lateral');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
