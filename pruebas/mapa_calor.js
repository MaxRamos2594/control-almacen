// Análisis → Mapa de calor: entran todos los SKU (antes solo 45) ajustando el
// tamaño de los cuadros al ancho; paleta nueva por clases; tarjeta al pasar el
// mouse con fila/columna resaltadas; filtro "Solo con faltantes".
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
const TIENDAS = ['CERCADO DE LIMA','COMAS','MAGDALENA','VENTANILLA','AREQUIPA','SAN JUAN DE LURIGANCHO','ATE','VMT','HUAYCÁN','RAMSES PTE Y MARAÑON','MALL PLAZA COMAS','ICA','PIURA','HUANCAYO','TACNA','LOS OLIVOS'];

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1880, height: 1000 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async (TIENDAS)=>{
    const hoy = firebase.firestore.Timestamp.now();
    await campanaRegistrosRef.doc('REG-00046').set({ correlativo:'REG-00046', campana:'CAMPAÑA 08-10', codigo:'CAMP-1', estado:'ACTIVO', fecha_carga: hoy, fecha_transaccion:'2026-10-08', total_filas: 960 });
    let b = db.batch(), n = 0;
    const poner = async (ref, data)=>{ b.set(ref.doc(), data); if(++n % 450 === 0){ await b.commit(); b = db.batch(); } };
    for(const [ti, t] of TIENDAS.entries()) for(let k = 0; k < 60; k++){
      const sku = k === 7 ? 'BK-AMARILLO' : 'SKU-' + String(k).padStart(3, '0');
      await poner(campanaItemsRef, { correlativo:'REG-00046', participante:t, sku, producto:'PRODUCTO ' + k, cantidad: 100 });
      // VENTANILLA e ICA sin salida; HUANCAYO a medias en algunos; TACNA con exceso en uno
      let g = 100;
      if(t === 'VENTANILLA' || t === 'ICA') g = 0;
      else if(t === 'HUANCAYO' && k % 9 === 0) g = 40;
      else if(t === 'TACNA' && k === 3) g = 130;
      else if(k === 0 && ti % 2) g = 0;
      if(g) await poner(guiaItemsRef, { campana_correlativo:'REG-00046', participante:t, codigo: k === 7 ? 'BK- AMARILLO' : sku, descripcion:'PRODUCTO ' + k, cantidad: g });
    }
    await b.commit();
    await cargarRegistrosCampana(true);
    switchTab('campanas');
  }, TIENDAS);
  await page.click('#campsub-analisis');
  await page.waitForFunction(()=> $('an-campana-select').options.length > 1, null, { timeout: 15000 });
  await page.selectOption('#an-campana-select', 'REG-00046');
  await page.waitForFunction(()=> $('an-participante-select').options.length > 1, null, { timeout: 15000 });
  await page.click('#btn-analizar');
  await page.waitForFunction(()=> !$('btn-analizar').disabled && $('an-resultados').style.display !== 'none', null, { timeout: 30000 });
  await page.waitForTimeout(2200); // termina la animación de entrada

  const m = await page.evaluate(()=>{
    const w = $('an-heat-wrap'), cel = w.querySelector('.c');
    const cuenta = {}; w.querySelectorAll('.c').forEach(c=>{ const k = c.className.replace(/^c /, ''); cuenta[k] = (cuenta[k]||0) + 1; });
    return { cols: w.querySelectorAll('.hm-col').length, filas: w.querySelectorAll('.hm-fila').length, celda: cel.getBoundingClientRect().width,
      lbl: w.querySelector('.hm-fila').getBoundingClientRect().width, sinScroll: w.scrollWidth <= w.clientWidth + 1, cuenta,
      txt: $('an-hm-cuenta').textContent, opac: getComputedStyle(cel).opacity,
      ventanilla: w.querySelector('.hm-fila[data-r] .n') && [...w.querySelectorAll('.hm-fila')].find(f=> /VENTANILLA/.test(f.innerText)).innerText.replace(/\s+/g,' ') };
  });
  verificar(m.cols === 60 && m.filas === 16, `Entran todos: ${m.cols} SKU y ${m.filas} tiendas (antes se cortaba en 45 SKU)`);
  verificar(m.sinScroll && m.celda >= 18 && m.lbl <= 192, `Los cuadros se ajustan al ancho (${Math.round(m.celda)} px) sin desplazamiento lateral; columna de tiendas de ${Math.round(m.lbl)} px`);
  verificar(m.cuenta.ok > 800 && m.cuenta.f5 >= 120 && m.cuenta.f3 >= 7 && m.cuenta.ex === 1 && !m.cuenta.na, `Colores por estado: ${JSON.stringify(m.cuenta)}`);
  verificar(/VENTANILLA 0%/.test(m.ventanilla) && m.opac === '1', `Cumplimiento por tienda junto al nombre ("${m.ventanilla}") y animación terminada`);
  verificar(m.txt === '16 de 16 tiendas · 60 de 60 SKU', `Contador: ${m.txt}`);
  await page.locator('#an-heat-wrap').screenshot({ path: path.join(__dirname, 'salida', 'mapa_calor.png') });

  // Pasar el mouse por un cuadro de HUANCAYO con faltante
  const [fila, col] = await page.evaluate(()=> [[...document.querySelectorAll('#an-heat-wrap .hm-fila')].find(f=> /HUANCAYO/.test(f.innerText)).dataset.r,
    [...document.querySelectorAll('#an-heat-wrap .hm-col')].find(c=> c.innerText === 'SKU-000').dataset.c]);
  const cuadro = page.locator(`#an-heat-wrap .c[data-r="${fila}"][data-c="${col}"]`);
  await cuadro.hover();
  await page.waitForFunction(([fila, col])=> Number(getComputedStyle(document.querySelector(`#an-heat-wrap .c:not([data-r="${fila}"]):not([data-c="${col}"])`)).opacity) < 0.5, [fila, col], { timeout: 3000 }).catch(()=>{});
  const h = await page.evaluate(([fila, col])=>{
    const tip = $('an-hm-tip');
    const otra = document.querySelector(`#an-heat-wrap .c:not([data-r="${fila}"]):not([data-c="${col}"])`);
    const misma = document.querySelector(`#an-heat-wrap .c[data-r="${fila}"]:not([data-c="${col}"])`);
    const el = document.querySelector(`#an-heat-wrap .c[data-r="${fila}"][data-c="${col}"]`);
    return { visible: tip.classList.contains('visible'), txt: tip.innerText.replace(/\s+/g,' '), otra: getComputedStyle(otra).opacity, misma: getComputedStyle(misma).opacity,
      grande: getComputedStyle(el).transform !== 'none' };
  }, [fila, col]);
  verificar(h.visible && /HUANCAYO/.test(h.txt) && /Reparto 100 u/.test(h.txt) && /En guía 40 u/.test(h.txt) && /Faltan 60 u/.test(h.txt), `Tarjeta al pasar el mouse: "${h.txt}"`);
  verificar(Number(h.otra) < 0.5 && h.misma === '1' && h.grande, `Resalta su fila y columna (las demás a ${h.otra}) y agranda el cuadro`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'mapa_calor_hover.png') });
  await page.mouse.move(5, 5);

  // Solo con faltantes
  await page.click('[data-hm-filtro="faltantes"]');
  await page.waitForTimeout(300);
  const f = await page.evaluate(()=> ({ txt: $('an-hm-cuenta').textContent, ok: [...document.querySelectorAll('#an-heat-wrap .hm-fila')].map(x=> x.querySelector('.n').innerText) }));
  verificar(f.txt === '8 de 16 tiendas · 60 de 60 SKU' && f.ok.includes('VENTANILLA') && !f.ok.includes('CERCADO DE LIMA') && !f.ok.includes('TACNA'), `"Solo con faltantes" deja solo las tiendas con algo pendiente: ${f.txt} (${f.ok.join(', ')})`);
  await page.click('[data-hm-filtro="todo"]');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
