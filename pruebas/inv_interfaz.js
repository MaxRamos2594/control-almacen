// Interfaz de Inventario: orden por columnas, tarjetas de resumen, foto,
// columnas numéricas a la derecha, descripción en 2 líneas, panel lateral de
// detalle con "Ir" a Movimientos y vista de tarjetas en el celular.
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
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{
    await bloquesRef.doc('B1').set({ nombre:'A', creado_en: firebase.firestore.Timestamp.now() });
    for(const l of ['A','B']) await nichosRef.doc(l).set({ bloque_id:'B1', tipo:'solo_rack', niveles:2, orden:0, pos_visual:0 });
    for(const [id, n, pal] of [['A01','A','CD0001'],['A02','A','CD0002'],['B01','B','CD0003']])
      await posicionesRef.doc(id).set({ tipo:'rack', nicho:n, bloque_id:'B1', nivel:'arriba', estado:'ocupado', bloqueada:false, pallet_codigo: pal });
    const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0,0,40,40);
    const foto = c.toDataURL('image/png');
    const larga = 'COMPRESORA DE AIRE • VOLTAJE: 220V / 60HZ • POTENCIA: 1500 W • VELOCIDAD: 2850 RPM • TANQUE: 25 L (LITROS) • FLUJO DE AIRE: 206 L / MIN • PRESION: 8 BAR • PESO: 22 KG • ACCESORIOS VARIOS PARA TALLER';
    await productosRef.doc('JIN-1').set({ descripcion: larga, costo: 200, proveedor:'HERRAMIENTAS', imagen_url: foto });
    await productosRef.doc('JIN-2').set({ descripcion:'VIBRADOR', costo: 1500.5, proveedor:'HERRAMIENTAS' });
    await productosRef.doc('ZZ-9').set({ descripcion:'SIN COSTO', costo: 0, proveedor:'OTRO' });
    const pal = (cod, pos, items)=> palletsRef.doc(cod).set({ items: items.map(([p,q])=>({producto:p, descripcion:'X', cantidad:q, costo:0})), posicion_actual: pos, estado:'activo' });
    await pal('CD0001','A01',[['JIN-1',30]]); await pal('CD0002','A02',[['JIN-2',2],['JIN-1',5]]); await pal('CD0003','B01',[['ZZ-9',100]]);
  });
  await page.waitForFunction(()=> Object.keys(pallets).length === 3 && Object.keys(productos).length === 3, null, { timeout: 20000 });
  await page.evaluate(()=> switchTab('inventario'));
  await page.waitForTimeout(700);

  const codigos = ()=> page.evaluate(()=> [...document.querySelectorAll('#inv-body tr')].map(r=> r.cells[1].innerText).join(','));
  // 1. Orden por columnas
  verificar(await codigos() === 'JIN-1,JIN-2,ZZ-9', 'Por defecto ordenado por código');
  await page.click('#inv-thead th[data-key="costoTotal"]');
  await page.waitForTimeout(200);
  verificar(await codigos() === 'JIN-1,JIN-2,ZZ-9' && /▼/.test(await page.textContent('#inv-thead th[data-key="costoTotal"]')), 'Clic en "Costo total": de mayor a menor (7,000 · 3,001 · 0) ▼');
  await page.click('#inv-thead th[data-key="costoTotal"]');
  await page.waitForTimeout(200);
  verificar(await codigos() === 'ZZ-9,JIN-2,JIN-1', 'Segundo clic: de menor a mayor ▲');
  await page.click('#inv-thead th[data-key="total"]');
  await page.waitForTimeout(200);
  verificar(await codigos() === 'ZZ-9,JIN-1,JIN-2', 'Clic en "Cantidad": 100 · 35 · 2');

  // 2. Tarjetas de resumen
  const kpi = await page.evaluate(()=> ({ v: $('inv-kpi-valor').innerText, p: $('inv-kpi-productos').innerText, u: $('inv-kpi-unidades').innerText, r: $('inv-kpi-sincosto-n').innerText, hay: $('inv-kpi-sincosto').classList.contains('hay') }));
  verificar(kpi.v === 'S/ 10,001.00' && kpi.p === '3' && kpi.u === '137' && kpi.r === '1' && kpi.hay, `Tarjetas: ${kpi.v} · ${kpi.p} productos · ${kpi.u} unidades · ${kpi.r} a revisar`);
  await page.click('#inv-kpi-sincosto');
  await page.waitForTimeout(200);
  verificar(await codigos() === 'ZZ-9' && await page.evaluate(()=> $('inv-kpi-sincosto').classList.contains('activo')), 'Clic en "Costos a revisar": muestra solo ese producto');
  await page.click('#inv-kpi-sincosto');
  await page.waitForTimeout(200);
  await page.fill('#inv-pos-desde', 'A'); await page.fill('#inv-pos-hasta', 'A');
  await page.waitForTimeout(300);
  const kf = await page.evaluate(()=> ({ l: $('inv-kpi-valor-l').innerText, v: $('inv-kpi-valor').innerText }));
  verificar(/filtrado/i.test(kf.l) && kf.v === 'S/ 10,001.00', `Con filtro A–A las tarjetas muestran lo filtrado: ${kf.l} ${kf.v}`);
  await page.click('#btn-inv-limpiar');
  await page.waitForTimeout(200);

  // 3. Columnas: foto, números a la derecha, miles en costo unitario, descripción en 2 líneas
  await page.click('#inv-thead th[data-key="codigo"]');
  await page.waitForTimeout(200);
  const col = await page.evaluate(()=>{
    const fila = [...document.querySelectorAll('#inv-body tr')].find(r=> r.cells[1].innerText === 'JIN-1');
    const fila2 = [...document.querySelectorAll('#inv-body tr')].find(r=> r.cells[1].innerText === 'JIN-2');
    const desc = fila.querySelector('.inv-desc');
    const lh = parseFloat(getComputedStyle(desc).lineHeight);
    return { foto: !!fila.querySelector('img.inv-foto'), sinFoto: !!fila2.querySelector('.inv-foto-vacia'),
      alin: getComputedStyle(fila.cells[6]).textAlign, costo2: fila2.cells[5].innerText.trim(),
      lineas: Math.round(desc.getBoundingClientRect().height / lh), tituloCompleto: fila.cells[2].title.length > 150 };
  });
  verificar(col.foto && col.sinFoto, 'Foto del producto en la tabla (y marca "S/F" si no tiene)');
  verificar(col.alin === 'right' && col.costo2 === '1,500.50', `Cifras a la derecha y costo unitario con miles (${col.costo2})`);
  verificar(col.lineas <= 2 && col.tituloCompleto, `Descripción larga limitada a ${col.lineas} líneas (completa al pasar el mouse)`);
  await page.locator('#view-inventario .inv-panel').screenshot({ path: path.join(__dirname, 'salida', 'inv_interfaz.png') });

  // 4. Panel lateral de detalle + Ir a la posición
  await page.click('#inv-body button[data-inv-det="JIN-1"]');
  await page.waitForSelector('#inv-drawer.abierto');
  const det = await page.evaluate(()=> ({ txt: $('inv-drawer-cuerpo').innerText.replace(/\s+/g,' '), filas: [...document.querySelectorAll('#inv-drawer-cuerpo tbody tr')].map(r=> r.cells[1].innerText) }));
  verificar(/JIN-1/.test(det.txt) && /35/.test(det.txt) && /7,000\.00/.test(det.txt) && det.filas.join(',') === 'A01,A02', `Panel lateral: unidades, costo total y pallets en A01, A02 (${det.filas.join(', ')})`);
  await page.locator('#inv-drawer').screenshot({ path: path.join(__dirname, 'salida', 'inv_detalle.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  verificar(!(await page.evaluate(()=> $('inv-drawer').classList.contains('abierto'))), 'Escape cierra el panel');
  await page.click('#inv-body img.inv-foto');
  await page.waitForSelector('#inv-drawer.abierto');
  await page.click('#inv-drawer-cuerpo [data-inv-ir="A02"]');
  await page.waitForTimeout(400);
  const ir = await page.evaluate(()=> ({ tab: document.querySelector('nav.tabs button.active').dataset.tab, sel: selectedPosId, cerrado: !$('inv-drawer').classList.contains('abierto') }));
  verificar(ir.tab === 'mov' && ir.sel === 'A02' && ir.cerrado, `"Ir ›" abre Movimientos con la posición A02 seleccionada (${ir.tab}, ${ir.sel})`);

  // 5. Celular: tarjetas en vez de tabla
  const movil = await context.newPage();
  await movil.setViewportSize({ width: 390, height: 800 });
  await movil.goto(page.url().replace(/#.*$/, ''));
  await movil.waitForSelector('#app-shell', { state:'visible', timeout: 20000 });
  await movil.waitForFunction(()=> Object.keys(pallets).length === 3, null, { timeout: 20000 });
  await movil.evaluate(()=> switchTab('inventario'));
  await movil.waitForTimeout(600);
  const m = await movil.evaluate(()=>{
    const thead = getComputedStyle(document.querySelector('#inv-thead')).display;
    const fila = document.querySelector('#inv-body tr');
    const anchoPagina = document.documentElement.scrollWidth, anchoVista = window.innerWidth;
    // Nada se sale del panel: ni los filtros ni las celdas de las tarjetas.
    const panel = document.querySelector('#view-inventario .inv-panel').getBoundingClientRect();
    const fuera = [...document.querySelectorAll('#view-inventario .inv-filtros input, #inv-body td')].filter(e=>{ const q = e.getBoundingClientRect(); return q.width && (q.right > panel.right + 1 || q.left < panel.left - 1 || e.scrollWidth > e.clientWidth + 1); }).length;
    return { thead, display: getComputedStyle(fila).display, etiqueta: getComputedStyle(fila.cells[4], '::before').content, scrollH: anchoPagina <= anchoVista + 1, fuera };
  });
  verificar(m.thead === 'none' && m.display === 'grid' && /Cantidad/.test(m.etiqueta) && m.scrollH, `Celular: cada producto es una tarjeta con etiquetas (${m.etiqueta}) y sin scroll horizontal`);
  verificar(m.fuera === 0, `Celular: ningún filtro ni dato se sale del panel (${m.fuera} fuera)`);
  await movil.locator('#view-inventario .inv-panel').screenshot({ path: path.join(__dirname, 'salida', 'inv_movil.png') });

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
