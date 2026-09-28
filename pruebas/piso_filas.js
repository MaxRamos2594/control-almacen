// Cambia el piso de los nichos de un bloque a 1 fila × 2 y verifica: nichos
// con piso vacío se renumeran (05, 06), los que tienen pallets en el piso no
// se tocan, los de otros bloques tampoco, y los nichos nuevos salen con 1 fila.
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
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });

  // Bloque A (nicho A) y bloque C (nichos AB vacío y AC con un pallet en el piso AC07), todos con piso de 5 filas.
  await page.evaluate(async ()=>{
    const hace = (min)=> firebase.firestore.Timestamp.fromMillis(Date.now() - min*60000);
    await bloquesRef.doc('BA').set({ nombre:'A', creado_en: hace(60) });
    await bloquesRef.doc('BC').set({ nombre:'C', creado_en: hace(30) });
    const nicho = async (letra, bid, pos)=>{
      await nichosRef.doc(letra).set({ bloque_id: bid, orden: pos, pos_visual: pos, tipo:'rack_piso', niveles:2, creado_en: hace(10) });
      for(const [i, nivel] of [[1,'arriba'],[2,'arriba'],[3,'abajo'],[4,'abajo']])
        await posicionesRef.doc(`${letra}0${i}`).set({ tipo:'rack', nicho: letra, bloque_id: bid, nivel, estado:'vacio', bloqueada:false, pallet_codigo:null });
      for(let i=0;i<5;i++) for(const [n, columna] of [[5+i,'izq'],[10+i,'der']])
        await posicionesRef.doc(`${letra}${String(n).padStart(2,'0')}`).set({ tipo:'piso', nicho: letra, bloque_id: bid, nivel:null, fila:i, columna, estado:'vacio', bloqueada:false, pallet_codigo:null });
    };
    await nicho('A','BA',0); await nicho('AB','BC',0); await nicho('AC','BC',1);
    await posicionesRef.doc('AC07').update({ estado:'ocupado', pallet_codigo:'CD0007' });
    await palletsRef.doc('CD0007').set({ items:[{producto:'P1', descripcion:'PRUEBA', cantidad:3, costo:1}], posicion_actual:'AC07', estado:'activo' });
  });
  await page.waitForFunction(()=> Object.keys(posiciones).length === 42 && pallets['CD0007'], null, { timeout: 15000 });
  await page.evaluate(()=> switchTab('diseno'));

  const pisoDe = (l)=> page.evaluate(l=> Object.keys(posiciones).filter(id=> posiciones[id].nicho===l && posiciones[id].tipo==='piso').sort(), l);
  const antesA = await pisoDe('A'), antesAC = await pisoDe('AC');

  // Cambiar el piso del bloque C a 1 fila × 2 (el confirm se acepta solo).
  await page.selectOption('[data-piso-filas="BC"]', '1');
  await page.waitForFunction(()=> nichos['AB'] && nichos['AB'].piso_filas === 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);

  verificar((await pisoDe('AB')).join(',') === 'AB05,AB06', `AB (piso vacío) queda con piso ${(await pisoDe('AB')).join(', ')}`);
  verificar((await pisoDe('AC')).join(',') === antesAC.join(',') && await page.evaluate(()=> posiciones['AC07'].pallet_codigo === 'CD0007'), 'AC (con pallet en el piso) no se tocó y su pallet sigue en AC07');
  verificar((await pisoDe('A')).join(',') === antesA.join(','), 'El nicho A del bloque A no cambió');
  const aviso = await page.textContent('#toast-container');
  verificar(/AC/.test(aviso) && /ocupada o bloqueada/.test(aviso), 'Se avisa que AC no se cambió porque su piso tiene pallets');

  // En pantalla, AB dibuja 1 fila de piso.
  const filasAB = await page.evaluate(()=> {
    const n = document.querySelector('#preview-bloques [data-rename-nicho="AB"]').closest('.nicho');
    return [...n.querySelectorAll('.nicho-row')].filter(r=> r.querySelector('.piso-slot')).length;
  });
  verificar(filasAB === 1, `AB se dibuja con ${filasAB} fila de piso`);

  // Nicho nuevo en C: sale con piso de 1 fila.
  await page.click('[data-add-nicho="BC"][data-niveles="2"]:not([data-sin-piso])');
  await page.waitForFunction(()=> Object.keys(nichos).some(l=> nichos[l].bloque_id==='BC' && !['AB','AC'].includes(l)), null, { timeout: 15000 });
  const nuevo = await page.evaluate(()=> Object.keys(nichos).find(l=> nichos[l].bloque_id==='BC' && !['AB','AC'].includes(l)));
  await page.waitForTimeout(500);
  verificar((await pisoDe(nuevo)).join(',') === `${nuevo}05,${nuevo}06`, `Nicho nuevo ${nuevo}: piso ${(await pisoDe(nuevo)).join(', ')}`);
  const meta = await page.evaluate(()=> [...document.querySelectorAll('.bloque-card')].find(c=> c.querySelector('[data-piso-filas="BC"]')).innerText);
  verificar(/1 fila × 2/.test(meta), 'El selector del bloque C muestra "1 fila × 2"');
  verificar(/3 nicho\(s\) · 26 posiciones \(12 rack \+ 14 piso\)/.test(meta), `Resumen del bloque C: ${(meta.match(/\d+ nicho.*piso\)/)||[''])[0]}`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'piso_filas.png'), fullPage: true });

  // Volver a 5 filas: AB vuelve a 05-14.
  await page.selectOption('[data-piso-filas="BC"]', '5');
  await page.waitForFunction(()=> nichos['AB'].piso_filas === 5, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const ab5 = await pisoDe('AB');
  verificar(ab5.length === 10 && ab5[0] === 'AB05' && ab5[9] === 'AB14', `Volver a 5 filas: AB con ${ab5.length} posiciones de piso (${ab5[0]}…${ab5[9]})`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
