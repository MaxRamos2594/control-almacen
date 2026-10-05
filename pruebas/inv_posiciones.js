// Filtro "Posición desde / hasta" del inventario, combinado con los demás
// filtros, en la tabla, "Ver detalle", el resumen y el Excel.
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
    await bloquesRef.doc('B1').set({ nombre:'A', creado_en: firebase.firestore.Timestamp.now() });
    for(const [l, tipo] of [['A','rack_piso'],['B','rack_piso'],['C','rack_piso'],['K','rack_piso'],['X1','solo_piso']])
      await nichosRef.doc(l).set({ bloque_id:'B1', tipo, niveles:2, orden:0, pos_visual:0 });
    const ubic = [['A01','A','CD0001'],['A02','A',null],['B01','B','CD0002'],['C05','C','CD0003'],['K03','K','CD0004'],['X101','X1','CD0005']];
    for(const [id, n, pal] of ubic) await posicionesRef.doc(id).set({ tipo:'rack', nicho:n, bloque_id:'B1', nivel:'arriba', estado: pal?'ocupado':'vacio', bloqueada:false, pallet_codigo: pal });
    const prod = (c, d, prov)=> productosRef.doc(c).set({ descripcion:d, costo:10, proveedor:prov||'', empaque1:null, empaque2:null });
    await prod('P1','PRODUCTO UNO','OTRO'); await prod('P2','PRODUCTO DOS','HERRAMIENTAS'); await prod('P3','PRODUCTO TRES','HERRAMIENTAS'); await prod('P4','PRODUCTO CUATRO','OTRO'); await prod('P5','PRODUCTO CINCO','OTRO');
    const pal = (c, pos, items)=> palletsRef.doc(c).set({ items: items.map(([p,q])=>({producto:p, descripcion:'X', cantidad:q, costo:10})), posicion_actual: pos, estado:'activo' });
    await pal('CD0001','A01',[['P1',5]]); await pal('CD0002','B01',[['P2',10]]); await pal('CD0003','C05',[['P1',3],['P2',1]]);
    await pal('CD0004','K03',[['P3',2]]); await pal('CD0005','X101',[['P4',4]]); await pal('CD0006',null,[['P5',7]]);
  });
  await page.waitForFunction(()=> Object.keys(pallets).length === 6 && Object.keys(posiciones).length === 6 && Object.keys(productos).length === 5, null, { timeout: 20000 });
  await page.evaluate(()=> switchTab('inventario'));
  await page.waitForTimeout(600);

  const ver = ()=> page.evaluate(()=> ({
    filas: [...document.querySelectorAll('#inv-body tr')].filter(r=> !r.id).map(r=> `${r.cells[1].innerText}:${r.cells[4].innerText}`).join(' '),
    resumen: $('inv-resumen').innerText.replace(/\s+/g,' '), total: $('inv-total-valorizado').innerText, etiqueta: $('inv-total-label').innerText,
    limpiar: $('btn-inv-limpiar').style.display !== 'none', vacio: $('inv-empty').style.display !== 'none' ? $('inv-empty').innerText : '' }));
  const filtrar = async (desde, hasta, prov='')=>{
    await page.fill('#inv-pos-desde', desde); await page.fill('#inv-pos-hasta', hasta); await page.fill('#inv-buscar-proveedor', prov);
    await page.waitForTimeout(300); return ver();
  };

  let v = await ver();
  verificar(v.filas === 'P1:8 P2:11 P3:2 P4:4 P5:7' && !v.limpiar && v.etiqueta === 'TOTAL VALORIZADO DEL ALMACÉN', `Sin filtros: ${v.filas} · ${v.resumen}`);
  v = await filtrar('A', 'B');
  verificar(v.filas === 'P1:5 P2:10', `Nichos A a B: ${v.filas}`);
  verificar(v.limpiar && v.etiqueta === 'TOTAL VALORIZADO (FILTRADO)' && /150\.00/.test(v.total) && /2 producto\(s\) · 15 unidades/.test(v.resumen) && /posición A – B/.test(v.resumen), `Resumen y total filtrados: ${v.resumen} · ${v.total}`);
  v = await filtrar('A01', 'C05');
  verificar(v.filas === 'P1:8 P2:11', `Posiciones A01 a C05: ${v.filas}`);
  v = await filtrar('C', '');
  verificar(v.filas === 'P1:3 P2:1 P3:2 P4:4', `Desde C hasta el final (incluye K y X1): ${v.filas}`);
  v = await filtrar('', 'A');
  verificar(v.filas === 'P1:5', `Desde el inicio hasta A: ${v.filas}`);
  v = await filtrar('B', 'A');
  verificar(v.filas === 'P1:5 P2:10', `Escrito al revés (B a A) = A a B: ${v.filas}`);
  v = await filtrar('A', 'K', 'HERRAMIENTAS');
  verificar(v.filas === 'P2:11 P3:2', `A a K + proveedor HERRAMIENTAS: ${v.filas}`);
  v = await filtrar('ZZ9', '');
  verificar(v.filas === '' && /No existe la posición o nicho "ZZ9"/.test(v.vacio), `Posición que no existe: "${v.vacio}"`);

  // Ver detalle muestra solo los pallets del rango
  await filtrar('A', 'B');
  await page.click('#inv-body button[data-inv-det="P1"]');
  await page.waitForSelector('#inv-drawer.abierto');
  const detalle = await page.evaluate(()=> [...document.querySelectorAll('#inv-drawer-cuerpo tbody tr')].map(r=> r.innerText.replace(/\s+/g,' ').trim()).join(' | '));
  verificar(/^CD0001 A01 A 5/.test(detalle) && !/C05/.test(detalle), `Ver detalle de P1 con A a B: ${detalle}`);
  await page.click('#inv-drawer-cerrar');

  // Excel con filtros
  await filtrar('A01', 'C05');
  const [descarga] = await Promise.all([ page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-exportar-inventario') ]);
  const archivo = path.join(__dirname, 'salida', 'inventario_filtrado.xlsx');
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  await descarga.saveAs(archivo);
  const filas = XLSX.utils.sheet_to_json(XLSX.readFile(archivo).Sheets['Inventario']);
  const p1 = filas.find(f=> f['Código']==='P1') || {};
  verificar(filas.filter(f=> /^P\d$/.test(f['Código'])).map(f=> f['Código']).join(',') === 'P1,P2', 'Excel: solo los productos del filtro (P1, P2)');
  verificar(p1['Cantidad total'] === 8 && p1['Posiciones'] === 'A01, C05', `Excel: P1 con 8 unidades en "${p1['Posiciones']}"`);
  verificar(/Filtros: posición A01 – C05/.test(filas[filas.length-1]['Código'] || ''), `Excel: anota los filtros (${filas[filas.length-1]['Código']})`);

  // Excel por pallet: una fila por pallet + posición + producto, ordenado por pallet
  const excelPallet = async (nombre)=>{
    const [d] = await Promise.all([ page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-exportar-inventario-pallet') ]);
    const f = path.join(__dirname, 'salida', nombre); await d.saveAs(f);
    return XLSX.utils.sheet_to_json(XLSX.readFile(f).Sheets['Por pallet']);
  };
  const resumenFilas = filas=> filas.filter(f=> /^CD/.test(f['Pallet'])).map(f=> `${f['Pallet']}/${f['Posición']||'-'}/${f['Código']}:${f['Cantidad']}`).join(' ');
  await page.click('#btn-inv-limpiar'); await page.waitForTimeout(300);
  let fp = await excelPallet('inventario_por_pallet.xlsx');
  verificar(resumenFilas(fp) === 'CD0001/A01/P1:5 CD0002/B01/P2:10 CD0003/C05/P1:3 CD0003/C05/P2:1 CD0004/K03/P3:2 CD0005/X101/P4:4 CD0006/-/P5:7',
    `Excel por pallet sin filtros, ordenado por pallet: ${resumenFilas(fp)}`);
  const tot = fp.find(f=> /^TOTAL/.test(f['Pallet'])) || {};
  verificar(tot['Pallet'] === 'TOTAL (6 pallets)' && tot['Cantidad'] === 32 && tot['Costo total'] === 320, `Excel por pallet: fila de total (${tot['Pallet']}, ${tot['Cantidad']} unidades, ${tot['Costo total']})`);
  const c3 = fp.find(f=> f['Pallet']==='CD0003' && f['Código']==='P1') || {};
  verificar(c3['Nicho'] === 'C' && c3['Bloque'] === 'A' && c3['Costo unitario'] === 10 && c3['Costo total'] === 30 && c3['Descripción'] === 'PRODUCTO UNO', 'Excel por pallet: nicho, bloque, descripción y costos por fila');
  await filtrar('A', 'K', 'HERRAMIENTAS');
  fp = await excelPallet('inventario_por_pallet_filtrado.xlsx');
  verificar(resumenFilas(fp) === 'CD0002/B01/P2:10 CD0003/C05/P2:1 CD0004/K03/P3:2', `Excel por pallet con filtros A–K + HERRAMIENTAS: ${resumenFilas(fp)}`);
  verificar(/Filtros: proveedor "HERRAMIENTAS" · posición A – K/.test(fp[fp.length-1]['Pallet'] || ''), `Excel por pallet anota los filtros (${fp[fp.length-1]['Pallet']})`);

  // Limpiar
  await page.click('#btn-inv-limpiar');
  await page.waitForTimeout(300);
  v = await ver();
  verificar(v.filas === 'P1:8 P2:11 P3:2 P4:4 P5:7' && !v.limpiar && await page.inputValue('#inv-pos-desde') === '', 'Limpiar filtros vuelve a todo el inventario');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
