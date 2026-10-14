// Consultar → Reparto vs Compra: filas = códigos del reparto, columnas = tiendas;
// COMPRA y COSTO de las cargas de compras asignadas a la campaña (solo activas);
// donde la tienda ya tiene guía activa vale la cantidad de la guía y, si difiere
// del reparto, la celda va en rojo. SALDO = COMPRA − repartido.
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
  const { browser, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{
    const hoy = firebase.firestore.Timestamp.now();
    await campanaRegistrosRef.doc('REG-00060').set({ correlativo:'REG-00060', campana:'CAMPAÑA 20-10', estado:'ACTIVO', fecha_carga: hoy, fecha_transaccion:'2026-10-20' });
    for(const [t, sku, q] of [['ATE','S1',10],['ATE','S2',5],['Comas','S1',8],['COMAS','S3',4],['AREQUIPA','S2',6]])
      await campanaItemsRef.doc().set({ correlativo:'REG-00060', participante:t, sku, producto:'PRODUCTO '+sku, cantidad:q });
    // Guía activa de COMAS (S1 cambia de 8 a 6) y una guía invalidada de ATE (no cuenta)
    await guiasRegistrosRef.doc('G1').set({ correlativo:'G1', campana_correlativo:'REG-00060', participante:'COMAS', estado:'ACTIVO' });
    await guiaItemsRef.doc().set({ correlativo_guia:'G1', campana_correlativo:'REG-00060', participante:'COMAS', codigo:'S1', cantidad:6 });
    await guiaItemsRef.doc().set({ correlativo_guia:'G1', campana_correlativo:'REG-00060', participante:'COMAS', codigo:'S3', cantidad:4 });
    await guiasRegistrosRef.doc('G2').set({ correlativo:'G2', campana_correlativo:'REG-00060', participante:'ATE', estado:'INVALIDADO' });
    await guiaItemsRef.doc().set({ correlativo_guia:'G2', campana_correlativo:'REG-00060', participante:'ATE', codigo:'S1', cantidad:99 });
    // Compras: dos cargas asignadas, una anulada y una sin asignar
    const carga = (c, estado, campanas, tots)=> Promise.all([comprasCargasRef.doc(c).set({ correlativo:c, estado, campanas }),
      ...tots.map(([sku, cant, costo])=> comprasTotalesRef.doc().set({ carga_correlativo:c, sku, correl_sku:sku, descripcion:'COMPRA '+sku, cant_validada:cant, costo_unit:costo }))]);
    await carga('COM-00001', 'ACTIVO', ['REG-00060'], [['S1',20,2],['S2',8,3]]);
    await carga('COM-00002', 'ACTIVO', ['REG-00060','REG-00099'], [['S1',5,4]]);
    await carga('COM-00003', 'ANULADO', ['REG-00060'], [['S2',100,1]]);
    await carga('COM-00004', 'ACTIVO', [], [['S3',50,1]]);
    await cargarRegistrosCampana(true);
    switchTab('campanas');
  });
  await page.click('#campsub-repcmp');
  await page.waitForFunction(()=> $('rvc-campana-select').options.length > 1, null, { timeout: 10000 });
  await page.selectOption('#rvc-campana-select', 'REG-00060');
  await page.click('#btn-rvc-analizar');
  await page.waitForFunction(()=> $('rvc-resultado').style.display === 'block', null, { timeout: 20000 });
  await page.waitForTimeout(300);

  const t = await page.evaluate(()=> ({
    grupo: document.querySelector('#rvc-head th.grupo').innerText + ':' + document.querySelector('#rvc-head th.grupo').colSpan,
    cols: [...document.querySelectorAll('#rvc-head tr:nth-child(2) th')].map(th=> th.innerText.replace(/\s*[▲▼↕]\s*$/, '').trim()).join('|'),
    grupos: [...document.querySelectorAll('#rvc-head th.tc')].map(th=> th.innerText.replace(/\s*[▲▼↕]\s*$/, '') + ':' + (['g1','g2','g3'].find(g=> th.classList.contains(g)) || '-')).join(' '),
    guia: [...document.querySelectorAll('#rvc-head th.guia')].map(th=> th.title).join(','),
    filas: [...document.querySelectorAll('#rvc-body tr')].map(r=> [...r.cells].map(c=> c.innerText.trim()).filter((v, i)=> i !== 1).join('|')),
    rojas: [...document.querySelectorAll('#rvc-body td.mod')].map(td=> td.title),
    total: [...document.querySelectorAll('#rvc-foot td')].map(c=> c.innerText.trim()).join('|'),
    kpis: [...document.querySelectorAll('#rvc-kpis .reg-kpi')].map(k=> k.querySelector('.t').innerText + '=' + k.querySelector('.v').innerText).join(' · ')
  }));
  verificar(t.grupo === 'REPARTO:3' && t.cols === 'SKU|DESCRIPCIÓN|COMPRA|COSTO|COMAS|ATE|AREQUIPA|SALDO', `Columnas como la hoja, tiendas en el orden pedido (las no listadas al final): ${t.cols}`);
  verificar(t.grupos === 'COMAS:g1 ATE:g1 AREQUIPA:-', `Color por grupo: ${t.grupos}`);
  verificar(t.guia === 'COMAS — ya tiene guía · clic para ordenar', `Solo COMAS tiene guía activa (la invalidada de ATE no cuenta): ${t.guia}`);
  verificar(t.filas.join(' / ') === 'S1|25|2.40|6|10|·|9 / S2|8|3.00|·|5|6|-3 / S3|sin compra||4|·|·|-4', `Filas: ${t.filas.join(' / ')}`);
  verificar(t.rojas.join(',') === 'COMAS: reparto 8 → guía 6', `Celda en rojo donde la guía difiere del reparto: ${t.rojas.join(',')}`);
  verificar(t.total === 'TOTAL|3 SKU|33||10|15|6|2', `Fila TOTAL: ${t.total}`);
  verificar(/SKU DEL REPARTO=3/i.test(t.kpis) && /UNID\. COMPRADAS=33/i.test(t.kpis) && /UNID\. REPARTIDAS=31/i.test(t.kpis) && /SALDO=2/i.test(t.kpis) && /CAMBIADAS POR GUÍA=1/i.test(t.kpis) && /VALOR DE LA COMPRA=S\/ 84\.00/i.test(t.kpis), `Indicadores: ${t.kpis}`);
  await page.locator('#campsub-panel-repcmp').screenshot({ path: path.join(__dirname, 'salida', 'reparto_compra.png') });

  // Columnas inmovilizadas: al desplazar a la derecha, SKU, Descripción, Compra y Costo quedan fijas
  const fijas = await page.evaluate(async ()=>{
    const w = document.querySelector('.rvc-wrap'); w.style.maxWidth = '620px';
    const pos = ()=> [...document.querySelectorAll('#rvc-head tr:nth-child(2) th')].map(th=> Math.round(th.getBoundingClientRect().left));
    const fila = ()=> [...document.querySelector('#rvc-body tr').cells].slice(0, 5).map(td=> Math.round(td.getBoundingClientRect().left));
    const a = pos(), fa = fila(); w.scrollLeft = 200; await new Promise(r=> setTimeout(r, 100));
    const b = pos(), fb = fila(); const res = { a, b, fa, fb, scroll: w.scrollLeft }; w.style.maxWidth = ''; w.scrollLeft = 0; return res;
  });
  verificar(fijas.scroll > 0 && fijas.a.slice(0, 4).join() === fijas.b.slice(0, 4).join() && fijas.fa.slice(0, 4).join() === fijas.fb.slice(0, 4).join() && fijas.b[4] < fijas.a[4] && fijas.fb[4] < fijas.fa[4],
    `Al desplazar ${fijas.scroll}px a la derecha, SKU · Descripción · Compra · Costo quedan inmovilizadas y las tiendas se mueven (${fijas.a[4]} → ${fijas.b[4]})`);

  const ver = async f=>{ await page.click(`#rvc-chips [data-rvc-filtro="${f}"]`); return page.evaluate(()=> [...document.querySelectorAll('#rvc-body tr')].map(r=> r.cells[0].innerText).join(',')); };
  verificar(await ver('mod') === 'S1' && await ver('neg') === 'S2,S3' && await ver('pos') === 'S1' && await ver('sin') === 'S3', 'Filtros: cambiados por guía, saldo negativo/positivo y sin compra');
  await ver('todos');
  await page.fill('#rvc-buscar', 's2');
  verificar(await page.evaluate(()=> [...document.querySelectorAll('#rvc-body tr')].map(r=> r.cells[0].innerText).join(',')) === 'S2', 'Buscar por SKU');
  await page.fill('#rvc-buscar', '');

  // Orden de los grupos con nombres reales del reparto
  const orden = await page.evaluate(()=> ['ATE','VMT','ICA','MALL PLAZA COMAS','CERCADO DE LIMA','HUANCAYO','SAN JUAN DE LURIGANCHO','LOS OLIVOS','RAMSES PTE Y MARAÑON','COMAS','TACNA','HUAYCÁN','PIURA','MAGDALENA','VENTANILLA','VENTA VIRTUAL']
    .map(n=> Object.assign({ n }, rvcGrupoTienda(n))).sort((a, b)=> a.pos - b.pos || a.n.localeCompare(b.n)).map(x=> x.n + (x.g ? '' : '(-)')).join(', '));
  verificar(orden === 'CERCADO DE LIMA, COMAS, MAGDALENA, VENTANILLA, HUAYCÁN, SAN JUAN DE LURIGANCHO, ATE, RAMSES PTE Y MARAÑON, LOS OLIVOS, VMT, PIURA, HUANCAYO, TACNA, ICA, MALL PLAZA COMAS(-), VENTA VIRTUAL(-)', `Orden de tiendas: ${orden}`);

  // Ordenar por columnas sin cambiar el ancho
  const anchos = ()=> page.evaluate(()=> [...document.querySelectorAll('#rvc-head tr:nth-child(2) th')].map(th=> Math.round(th.getBoundingClientRect().width)).join(','));
  const skus = ()=> page.evaluate(()=> [...document.querySelectorAll('#rvc-body tr')].map(r=> r.cells[0].innerText).join(','));
  const w0 = await anchos();
  await page.click('#rvc-head [data-rvc-orden="t0"]');
  const o1 = await skus();
  await page.click('#rvc-head [data-rvc-orden="t0"]');
  const o2 = await skus();
  await page.click('#rvc-head [data-rvc-orden="saldo"]');
  const o3 = await skus(), w1 = await anchos();
  verificar(o1 === 'S1,S3,S2' && o2 === 'S2,S3,S1' && o3 === 'S1,S2,S3', `Ordenar: COMAS ▼ ${o1} · COMAS ▲ ${o2} · Saldo ▼ ${o3}`);
  verificar(w0 === w1, `Al ordenar las columnas mantienen su ancho (${w0})`);
  await page.click('#rvc-head [data-rvc-orden="sku"]');

  // Excel
  const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#btn-rvc-excel')]);
  verificar(descarga.suggestedFilename() === 'reparto_vs_compra_REG-00060.xlsx', `Exporta a Excel: ${descarga.suggestedFilename()}`);

  // Campaña sin compras asignadas: avisa
  await page.evaluate(async ()=>{ await campanaRegistrosRef.doc('REG-00061').set({ correlativo:'REG-00061', campana:'SIN COMPRAS', estado:'ACTIVO', fecha_carga: firebase.firestore.Timestamp.now() });
    await campanaItemsRef.doc().set({ correlativo:'REG-00061', participante:'ATE', sku:'Z1', producto:'Z', cantidad:3 }); await cargarRegistrosCampana(true); llenarSelectCampanas('rvc-campana-select'); });
  await page.selectOption('#rvc-campana-select', 'REG-00061');
  await page.click('#btn-rvc-analizar');
  await page.waitForFunction(()=> $('rvc-resultado').style.display === 'block', null, { timeout: 20000 });
  verificar(/no tiene compras asignadas/.test(await page.textContent('#rvc-msg')), `Sin compras asignadas avisa: "${await page.textContent('#rvc-msg')}"`);

  // Menú de subpestañas e indicadores en el botón flotante
  const f0 = await page.evaluate(()=> ({ menu: getComputedStyle(document.querySelector('#view-campanas .subtabs')).display, kpis: getComputedStyle($('rvc-kpis')).display, boton: getComputedStyle($('rvc-flotante')).display }));
  verificar(f0.menu === 'none' && f0.kpis === 'none' && f0.boton !== 'none', `En Reparto vs Compra se ocultan el menú y los indicadores; aparece el botón flotante (${JSON.stringify(f0)})`);
  await page.click('#rvc-flotante');
  const f1 = await page.evaluate(()=> ({ panel: getComputedStyle($('rvc-flot-panel')).display, menu: !!$('rvc-flot-panel').querySelector('.subtabs #campsub-analisis'), kpis: $('rvc-flot-panel').querySelectorAll('.reg-kpi').length }));
  verificar(f1.panel === 'block' && f1.menu && f1.kpis === 6, `El botón flotante abre el menú y los ${f1.kpis} indicadores`);
  await page.locator('#rvc-flot-panel').screenshot({ path: path.join(__dirname, 'salida', 'reparto_compra_flotante.png') });
  await page.keyboard.press('Escape');
  verificar(await page.evaluate(()=> getComputedStyle($('rvc-flot-panel')).display === 'none' && getComputedStyle(document.querySelector('#view-campanas .subtabs')).display === 'none'), 'Esc cierra el panel y el menú vuelve a quedar oculto');
  await page.click('#rvc-flotante');
  await page.click('#rvc-flot-panel #campsub-analisis');
  const f2 = await page.evaluate(()=> ({ menu: getComputedStyle(document.querySelector('#view-campanas > .subtabs')).display, boton: getComputedStyle($('rvc-flotante')).display, panel: getComputedStyle($('rvc-flot-panel')).display, analisis: $('campsub-panel-analisis').style.display }));
  verificar(f2.menu !== 'none' && f2.boton === 'none' && f2.panel === 'none' && f2.analisis === 'block', 'Desde el panel se va a otra subpestaña y el menú vuelve a su lugar');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
