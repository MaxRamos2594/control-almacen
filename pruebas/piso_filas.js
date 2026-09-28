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
  await page.selectOption('[data-piso-filas="BA"]', '1');
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

  const meta = await page.evaluate(()=> [...document.querySelectorAll('.bloque-card')].find(c=> c.querySelector('[data-piso-filas="BA"]')).innerText);
  verificar(/1 fila × 2/.test(meta), 'El selector del bloque A muestra "1 fila × 2"');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'piso_filas.png'), fullPage: true });

  // Volver a 5 filas: se agregan las posiciones que faltan; los pallets no se mueven.
  await page.selectOption('[data-piso-filas="BA"]', '5');
  await page.waitForFunction(()=> nichos['A'].piso_filas === 5, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const a5 = await pisoDe('A');
  verificar(a5.join(',') === 'A05,A06,A07,A08,A09,A10,A11,A12,A13,A14', `Volver a 5 filas: A con ${a5.length} posiciones de piso (${a5[0]}…${a5[a5.length-1]})`);
  verificar(await page.evaluate(()=> posiciones['A05'].pallet_codigo === 'CD0001' && posiciones['A10'].pallet_codigo === 'CD0002'), 'Los pallets de A05 y A10 siguen en su lugar');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
