// Cambia el piso de los nichos del bloque A a 1 fila × 2 (caso real: la
// primera fila del piso, 05 y 10, tiene pallets) y verifica que:
//  - se conserva la fila de arriba con sus códigos y pallets; se quitan las de abajo;
//  - un nicho con pallets en las filas de abajo no se toca (y se avisa);
//  - los nichos "solo piso" (X1) y los de otros bloques no cambian;
//  - los nichos nuevos siguen la numeración de su bloque (A: 05/10; C compacto: 05/06);
//  - volver a 5 filas agrega las posiciones que faltan sin mover los pallets.
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
const nichos_w_ok = f=> f == null || f === 5;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });

  await page.evaluate(async ()=>{
    const hace = (min)=> firebase.firestore.Timestamp.fromMillis(Date.now() - min*60000);
    await bloquesRef.doc('BA').set({ nombre:'A', creado_en: hace(60) });
    await bloquesRef.doc('BC').set({ nombre:'C', creado_en: hace(30), piso_filas: 1 });
    const rack = async (letra, bid)=>{
      for(const [i, nivel] of [[1,'arriba'],[2,'arriba'],[3,'abajo'],[4,'abajo']])
        await posicionesRef.doc(`${letra}0${i}`).set({ tipo:'rack', nicho: letra, bloque_id: bid, nivel, estado:'vacio', bloqueada:false, pallet_codigo:null });
    };
    const piso = async (letra, bid, codigos)=>{
      for(const [cod, fila, columna] of codigos)
        await posicionesRef.doc(letra + cod).set({ tipo:'piso', nicho: letra, bloque_id: bid, nivel:null, fila, columna, estado:'vacio', bloqueada:false, pallet_codigo:null });
    };
    const cinco = []; for(let i=0;i<5;i++){ cinco.push([String(5+i).padStart(2,'0'), i, 'izq'], [String(10+i).padStart(2,'0'), i, 'der']); }
    // Bloque A: nichos A, B, K (2 niveles, piso de 5 filas) y X1 (solo piso)
    for(const [letra, pos] of [['A',0],['B',1],['K',2]]){
      await nichosRef.doc(letra).set({ bloque_id:'BA', orden:pos, pos_visual:pos, tipo:'rack_piso', niveles:2, creado_en: hace(10) });
      await rack(letra, 'BA'); await piso(letra, 'BA', cinco);
    }
    await nichosRef.doc('X1').set({ bloque_id:'BA', orden:3, pos_visual:3, tipo:'solo_piso', creado_en: hace(10) });
    const seis = []; for(let i=0;i<6;i++){ seis.push([String(1+i).padStart(2,'0'), i, 'izq'], [String(7+i).padStart(2,'0'), i, 'der']); }
    await piso('X1', 'BA', seis);
    // Bloque C: nicho AB ya reducido a 1 fila con numeración compacta (05, 06)
    await nichosRef.doc('AB').set({ bloque_id:'BC', orden:0, pos_visual:0, tipo:'rack_piso', niveles:2, piso_filas:1, creado_en: hace(10) });
    await rack('AB', 'BC'); await piso('AB', 'BC', [['05',0,'izq'],['06',0,'der']]);
    // Pallets: A05 y A10 (fila de arriba del piso), K07 (fila 3 del piso)
    for(const [pos, pal] of [['A05','CD0001'],['A10','CD0002'],['K07','CD0003']]){
      await posicionesRef.doc(pos).update({ estado:'ocupado', pallet_codigo: pal });
      await palletsRef.doc(pal).set({ items:[{producto:'P1', descripcion:'PRUEBA', cantidad:3, costo:1}], posicion_actual: pos, estado:'activo' });
    }
  });
  await page.waitForFunction(()=> Object.keys(posiciones).length === 60 && pallets['CD0003'], null, { timeout: 15000 });
  await page.evaluate(()=> switchTab('diseno'));

  const pisoDe = (l)=> page.evaluate(l=> Object.keys(posiciones).filter(id=> posiciones[id].nicho===l && posiciones[id].tipo==='piso').sort(), l);
  const antesX1 = await pisoDe('X1'), antesK = await pisoDe('K'), antesAB = await pisoDe('AB');

  // Bloque A → 1 fila × 2 (el confirm se acepta solo).
  await page.selectOption('[data-piso-filas="BA"][data-niveles="2"]', '1');
  await page.waitForFunction(()=> nichos['A'].piso_filas === 1 && nichos['B'].piso_filas === 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);

  verificar((await pisoDe('A')).join(',') === 'A05,A10', `A queda con piso ${(await pisoDe('A')).join(', ')} (la fila de arriba)`);
  verificar(await page.evaluate(()=> posiciones['A05'].pallet_codigo === 'CD0001' && posiciones['A10'].pallet_codigo === 'CD0002' && pallets['CD0001'].posicion_actual === 'A05'), 'Los pallets de A05 y A10 siguen en su lugar');
  verificar((await pisoDe('B')).join(',') === 'B05,B10', `B (vacío) queda con piso ${(await pisoDe('B')).join(', ')}`);
  verificar((await pisoDe('K')).join(',') === antesK.join(',') && await page.evaluate(()=> posiciones['K07'].pallet_codigo === 'CD0003'), 'K (pallet en K07, fila de abajo) no se tocó');
  verificar(/K/.test(await page.textContent('#toast-container')), 'Se avisa que K no se cambió');
  verificar((await pisoDe('X1')).join(',') === antesX1.join(','), 'X1 (solo piso) no cambió');
  verificar((await pisoDe('AB')).join(',') === antesAB.join(','), 'Los nichos del bloque C no cambiaron');

  const filasA = await page.evaluate(()=> {
    const n = document.querySelector('#preview-bloques [data-rename-nicho="A"]').closest('.nicho');
    return [...n.querySelectorAll('.nicho-row')].filter(r=> r.querySelector('.piso-slot')).length;
  });
  verificar(filasA === 1, `A se dibuja con ${filasA} fila de piso`);

  // Nichos nuevos: A usa 05/10 (su numeración), C usa 05/06 (compacta).
  const nuevoEn = async (bid, conocidos)=>{
    await page.click(`[data-add-nicho="${bid}"][data-niveles="2"]:not([data-sin-piso])`);
    await page.waitForFunction(([bid, c])=> Object.keys(nichos).some(l=> nichos[l].bloque_id===bid && !c.includes(l)), [bid, conocidos], { timeout: 15000 });
    await page.waitForTimeout(500);
    return page.evaluate(([bid, c])=> Object.keys(nichos).find(l=> nichos[l].bloque_id===bid && !c.includes(l)), [bid, conocidos]);
  };
  const nA = await nuevoEn('BA', ['A','B','K','X1']);
  verificar((await pisoDe(nA)).join(',') === `${nA}05,${nA}10`, `Nicho nuevo ${nA} en A: piso ${(await pisoDe(nA)).join(', ')}`);
  const nC = await nuevoEn('BC', ['AB']);
  verificar((await pisoDe(nC)).join(',') === `${nC}05,${nC}06`, `Nicho nuevo ${nC} en C: piso ${(await pisoDe(nC)).join(', ')}`);

  const meta = await page.evaluate(()=> [...document.querySelectorAll('.bloque-card')].find(c=> c.querySelector('[data-piso-filas="BA"][data-niveles="2"]')).innerText);
  verificar(/1 fila × 2/.test(meta), 'El selector del bloque A muestra "1 fila × 2"');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'piso_filas.png'), fullPage: true });

  // Volver a 5 filas: se agregan las posiciones que faltan; los pallets no se mueven.
  await page.selectOption('[data-piso-filas="BA"][data-niveles="2"]', '5');
  await page.waitForFunction(()=> nichos['A'].piso_filas === 5, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const a5 = await pisoDe('A');
  verificar(a5.join(',') === 'A05,A06,A07,A08,A09,A10,A11,A12,A13,A14', `Volver a 5 filas: A con ${a5.length} posiciones de piso (${a5[0]}…${a5[a5.length-1]})`);
  verificar(await page.evaluate(()=> posiciones['A05'].pallet_codigo === 'CD0001' && posiciones['A10'].pallet_codigo === 'CD0002'), 'Los pallets de A05 y A10 siguen en su lugar');

  // Bloque B volteado (piso arriba): solo los nichos de 3 niveles a 1 fila × 2.
  // AA (3 niveles) tiene la fila pegada al rack (fila 4: AA11, AA16) bloqueada
  // por campaña; W (2 niveles) tiene un pallet en W08. Se conserva la fila de
  // AA pegada al rack y W no se toca.
  await page.evaluate(async ()=>{
    const hace = (min)=> firebase.firestore.Timestamp.fromMillis(Date.now() - min*60000);
    await bloquesRef.doc('BB').set({ nombre:'B', volteado:true, creado_en: hace(20) });
    const nicho = async (letra, niveles, pos)=>{
      await nichosRef.doc(letra).set({ bloque_id:'BB', orden:pos, pos_visual:pos, tipo:'rack_piso', niveles, creado_en: hace(10) });
      const nombres = niveles===3 ? ['arriba','medio','abajo'] : ['arriba','abajo'];
      let n = 1;
      for(const nivel of nombres) for(let c=0;c<2;c++){ await posicionesRef.doc(letra + String(n).padStart(2,'0')).set({ tipo:'rack', nicho:letra, bloque_id:'BB', nivel, estado:'vacio', bloqueada:false, pallet_codigo:null }); n++; }
      const r = niveles*2;
      for(let i=0;i<5;i++) for(const [num, columna] of [[r+1+i,'izq'],[r+6+i,'der']])
        await posicionesRef.doc(letra + String(num).padStart(2,'0')).set({ tipo:'piso', nicho:letra, bloque_id:'BB', nivel:null, fila:i, columna, estado:'vacio', bloqueada:false, pallet_codigo:null });
    };
    await nicho('AA', 3, 0); await nicho('W', 2, 1);
    await posicionesRef.doc('AA11').update({ bloqueada:true, campana_dia:true });
    await posicionesRef.doc('AA16').update({ bloqueada:true, campana_dia:true });
    await posicionesRef.doc('W08').update({ estado:'ocupado', pallet_codigo:'CD0009' });
    await palletsRef.doc('CD0009').set({ items:[{producto:'P1', descripcion:'PRUEBA', cantidad:1, costo:1}], posicion_actual:'W08', estado:'activo' });
  });
  await page.waitForFunction(()=> nichos['W'] && posiciones['W14'] && posiciones['AA16'] && posiciones['AA16'].bloqueada, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const antesW = await pisoDe('W');
  await page.selectOption('[data-piso-filas="BB"][data-niveles="3"]', '1');
  await page.waitForFunction(()=> nichos['AA'].piso_filas === 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  verificar((await pisoDe('AA')).join(',') === 'AA11,AA16', `B volteado, AA (3 niveles) queda con piso ${(await pisoDe('AA')).join(', ')} (la fila pegada al rack)`);
  verificar(await page.evaluate(()=> posiciones['AA11'].bloqueada && posiciones['AA11'].campana_dia && posiciones['AA11'].fila === 0 && posiciones['AA16'].fila === 0), 'AA11 y AA16 conservan su bloqueo de campaña y pasan a ser la fila 0');
  verificar((await pisoDe('W')).join(',') === antesW.join(',') && nichos_w_ok(await page.evaluate(()=> nichos['W'].piso_filas)), 'W (2 niveles) no cambió');
  verificar(await page.evaluate(()=> bloques['BB'].piso_filas_n3 === 1 && bloques['BB'].piso_filas == null), 'El bloque B guarda 1 fila solo para los nichos de 3 niveles');
  const filasAA = await page.evaluate(()=> {
    const n = document.querySelector('#preview-bloques [data-rename-nicho="AA"]').closest('.nicho');
    return [...n.querySelectorAll('.nicho-row')].filter(r=> r.querySelector('.piso-slot')).length;
  });
  verificar(filasAA === 1, `AA se dibuja con ${filasAA} fila de piso`);
  // Nicho nuevo de 3 niveles en B: 1 fila; de 2 niveles: 5 filas.
  await page.click('[data-add-nicho="BB"][data-niveles="3"]:not([data-sin-piso])');
  await page.waitForFunction(()=> Object.keys(nichos).some(l=> nichos[l].bloque_id==='BB' && nichos[l].niveles===3 && l!=='AA'), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const n3 = await page.evaluate(()=> Object.keys(nichos).find(l=> nichos[l].bloque_id==='BB' && nichos[l].niveles===3 && l!=='AA'));
  verificar((await pisoDe(n3)).length === 2, `Nicho nuevo ${n3} de 3 niveles en B: piso ${(await pisoDe(n3)).join(', ')}`);
  await page.click('[data-add-nicho="BB"][data-niveles="2"]:not([data-sin-piso])');
  await page.waitForFunction(()=> Object.keys(nichos).some(l=> nichos[l].bloque_id==='BB' && nichos[l].niveles===2 && l!=='W'), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const n2 = await page.evaluate(()=> Object.keys(nichos).find(l=> nichos[l].bloque_id==='BB' && nichos[l].niveles===2 && l!=='W'));
  verificar((await pisoDe(n2)).length === 10, `Nicho nuevo ${n2} de 2 niveles en B: ${(await pisoDe(n2)).length} posiciones de piso (sin cambios)`);

  // Volver a 5 filas en B (volteado): las filas nuevas se agregan arriba; AA11/AA16 siguen pegadas al rack (fila 4).
  await page.selectOption('[data-piso-filas="BB"][data-niveles="3"]', '5');
  await page.waitForFunction(()=> nichos['AA'].piso_filas === 5, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const aa5 = await pisoDe('AA');
  verificar(aa5.join(',') === 'AA07,AA08,AA09,AA10,AA11,AA12,AA13,AA14,AA15,AA16' && await page.evaluate(()=> posiciones['AA11'].fila === 4 && posiciones['AA16'].fila === 4 && posiciones['AA11'].bloqueada),
    `Volver a 5 filas en B: AA con ${aa5.join(', ')}; AA11/AA16 siguen pegadas al rack y bloqueadas`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
