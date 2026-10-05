// Costos del inventario: el del catálogo de Productos; si el catálogo no
// tiene costo (no existe, vacío o 0), el guardado en los pallets (promedio
// ponderado por cantidad). Verifica pantalla, aviso, filtro y el Excel.
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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
    const prod = (cod, d)=> productosRef.doc(cod).set(Object.assign({ empaque1:null, empaque2:null }, d));
    const pal = (cod, items)=> palletsRef.doc(cod).set({ items, posicion_actual:null, estado:'activo' });
    await prod('P1', { descripcion:'CON COSTO EN CATALOGO', costo:10, proveedor:'PROV A' });
    await prod('P2', { descripcion:'CATALOGO EN CERO', costo:0 });
    await prod('P4', { descripcion:'SIN COSTO EN NINGUN LADO', costo:0 });
    await pal('CD0001', [ { producto:'P1', descripcion:'CON COSTO EN CATALOGO', cantidad:5, costo:7 }, { producto:'P2', descripcion:'CATALOGO EN CERO', cantidad:10, costo:4 } ]);
    await pal('CD0002', [ { producto:'P2', descripcion:'CATALOGO EN CERO', cantidad:30, costo:6 }, { producto:'P3', descripcion:'NO ESTA EN CATALOGO', cantidad:2, costo:3 } ]);
    await pal('CD0003', [ { producto:'P4', descripcion:'SIN COSTO EN NINGUN LADO', cantidad:8, costo:0 } ]);
  });
  await page.waitForFunction(()=> Object.keys(pallets).length === 3 && Object.keys(productos).length === 3, null, { timeout: 20000 });
  await page.evaluate(()=> switchTab('inventario'));
  await page.waitForTimeout(800);

  const inv = await page.evaluate(()=>{ const i = computeInventario(); const r = {}; for(const k in i) r[k] = { costo: i[k].costo, total: i[k].total, costoTotal: i[k].costoTotal, origen: i[k].costoOrigen }; return r; });
  verificar(inv.P1.costo === 10 && inv.P1.origen === 'catalogo', `P1: costo del catálogo (10), no el del pallet (7) → ${inv.P1.costo}`);
  verificar(inv.P2.costo === 5.5 && inv.P2.origen === 'pallet' && inv.P2.costoTotal === 220, `P2: catálogo en 0 → promedio de pallets (10×4 + 30×6)/40 = 5.5; total 220 → ${inv.P2.costo}, ${inv.P2.costoTotal}`);
  verificar(inv.P3.costo === 3 && inv.P3.origen === 'pallet', `P3: no está en el catálogo → costo del pallet (3) → ${inv.P3.costo}`);
  verificar(inv.P4.costo === 0 && inv.P4.origen === 'sin_costo', `P4: sin costo en ningún lado → 0 y marcado → ${inv.P4.costo} (${inv.P4.origen})`);

  const pantalla = await page.evaluate(()=> ({
    aviso: $('inv-aviso-costos').innerText, visible: $('inv-aviso-costos').style.display !== 'none',
    filas: [...document.querySelectorAll('#inv-body tr')].filter(r=> r.style.display!=='none').map(r=> r.innerText.replace(/\s+/g,' ')),
    total: $('inv-total-valorizado').innerText }));
  verificar(pantalla.visible && /2 producto\(s\) sin costo en el catálogo/.test(pantalla.aviso) && /1 producto\(s\) no tienen costo/.test(pantalla.aviso), `Aviso: ${pantalla.aviso.replace(/\s+/g,' ').slice(0,160)}…`);
  verificar(pantalla.filas.some(f=> /\bP2 .*5\.50 \(pallet\)/.test(f)) && pantalla.filas.some(f=> /\bP4 .*⚠ sin costo/.test(f)), 'En la tabla: P2 muestra 5.50 (pallet) y P4 "⚠ sin costo"');
  verificar(/276\.00/.test(pantalla.total), `Total valorizado = 50 + 220 + 6 + 0 = 276 → ${pantalla.total}`);

  await page.check('#inv-solo-sin-costo');
  await page.waitForTimeout(400);
  const filtradas = await page.evaluate(()=> [...document.querySelectorAll('#inv-body tr')].filter(r=> r.style.display!=='none' && !r.id).map(r=> r.cells[1].innerText));
  verificar(filtradas.join(',') === 'P2,P3,P4', `"Ver solo estos": ${filtradas.join(', ')}`);
  await page.uncheck('#inv-solo-sin-costo');
  await page.waitForTimeout(300);

  const [descarga] = await Promise.all([ page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-exportar-inventario') ]);
  const archivo = path.join(__dirname, 'salida', 'inventario.xlsx');
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  await descarga.saveAs(archivo);
  const hoja = XLSX.readFile(archivo).Sheets['Inventario'];
  const filas = XLSX.utils.sheet_to_json(hoja);
  const fila = c=> filas.find(f=> f['Código'] === c) || {};
  verificar(fila('P1')['Costo unitario'] === 10 && fila('P2')['Costo unitario'] === 5.5 && fila('P2')['Costo total'] === 220 && fila('P3')['Costo unitario'] === 3,
    `Excel: P1 10, P2 5.5 (total 220), P3 3`);
  verificar(fila('P2')['Origen del costo'] === 'Pallet (sin costo en catálogo)' && fila('P4')['Origen del costo'] === 'SIN COSTO' && fila('P1')['Origen del costo'] === 'Catálogo', 'Excel: columna "Origen del costo" correcta');
  verificar(filas[filas.length-1]['Costo total'] === 276, `Excel: total valorizado 276 → ${filas[filas.length-1]['Costo total']}`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
