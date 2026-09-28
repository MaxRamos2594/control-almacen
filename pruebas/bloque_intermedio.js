// Inserta un bloque nuevo entre el bloque A y el pasillo (opción "Fila nueva
// debajo de A") y verifica que: queda en el orden correcto, el pasillo pasa
// debajo del bloque nuevo, sus nichos siguen después de la Z (AA, AB…) y
// ninguna posición, pallet ni nicho existente cambia.
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

  // Layout inicial parecido al real: A (nichos A, B) + pasillo; B volteado (nichos Y, Z) con un pallet en Z01.
  await page.evaluate(async ()=>{
    const hace = (min)=> firebase.firestore.Timestamp.fromMillis(Date.now() - min*60000);
    await bloquesRef.doc('BA').set({ nombre:'A', pasillo:true, creado_en: hace(60) });
    await bloquesRef.doc('BB').set({ nombre:'B', volteado:true, creado_en: hace(30) });
    const nicho = async (letra, bid, pos)=>{
      await nichosRef.doc(letra).set({ bloque_id: bid, orden: pos, pos_visual: pos, tipo:'solo_rack', niveles:2, creado_en: hace(10) });
      for(const [i, nivel] of [[1,'arriba'],[2,'arriba'],[3,'abajo'],[4,'abajo']])
        await posicionesRef.doc(`${letra}0${i}`).set({ tipo:'rack', nicho: letra, bloque_id: bid, nivel, estado:'vacio', bloqueada:false, pallet_codigo:null });
    };
    await nicho('A','BA',0); await nicho('B','BA',1); await nicho('Y','BB',0); await nicho('Z','BB',1);
    await posicionesRef.doc('Z01').update({ estado:'ocupado', pallet_codigo:'CD0001' });
    await palletsRef.doc('CD0001').set({ items:[{producto:'P1', descripcion:'PRUEBA', cantidad:5, costo:1}], posicion_actual:'Z01', estado:'activo' });
  });
  await page.waitForFunction(()=> Object.keys(posiciones).length === 16 && pallets['CD0001'], null, { timeout: 15000 });
  const foto = ()=> page.evaluate(()=> JSON.stringify({ posiciones, pallets, nichos }));
  const antes = await foto();

  // Crear el bloque nuevo desde el formulario, "debajo de A".
  await page.evaluate(()=> switchTab('diseno'));
  await page.fill('#bloque-nombre', 'C');
  await page.selectOption('#bloque-anexar-a', 'debajo:BA');
  const hint = await page.textContent('#bloque-anexar-hint');
  verificar(/debajo de "A"/.test(hint) && /pasillo/.test(hint), 'El formulario explica dónde quedará el bloque y el pasillo');
  await page.click('#btn-crear-bloque');
  await page.waitForFunction(()=> Object.values(bloques).some(b=> b.nombre === 'C'), null, { timeout: 15000 });
  await page.waitForTimeout(800);

  const orden = await page.evaluate(()=> sortBloquesEntries().map(([,b])=> b.nombre + (b.pasillo ? ' +PASILLO' : '')));
  verificar(orden.join(' | ') === 'A | C +PASILLO | B', `Orden de filas: ${orden.join(' | ')}`);
  const filas = await page.evaluate(()=> [...document.querySelectorAll('#preview-bloques > *')].map(el=> el.classList.contains('pasillo-divider') ? 'PASILLO' : el.querySelector('.bloque-title').textContent));
  verificar(filas.join(' | ') === 'A | C | PASILLO | B', `En pantalla: ${filas.join(' | ')}`);

  // Agregar un nicho al bloque nuevo: debe llamarse AA (sigue después de la Z).
  const idC = await page.evaluate(()=> Object.keys(bloques).find(id=> bloques[id].nombre === 'C'));
  await page.click(`[data-add-nicho="${idC}"][data-niveles="2"]:not([data-sin-piso])`);
  await page.waitForFunction(()=> nichos['AA'], null, { timeout: 15000 });
  await page.click(`[data-add-nicho="${idC}"][data-niveles="2"][data-sin-piso]`);
  await page.waitForFunction(()=> nichos['AB'], null, { timeout: 15000 });
  const nuevos = await page.evaluate(()=> Object.keys(nichos).filter(l=> nichos[l].bloque_id === Object.keys(bloques).find(id=> bloques[id].nombre === 'C')).sort());
  verificar(nuevos.join(',') === 'AA,AB', `Nichos del bloque nuevo: ${nuevos.join(', ')}`);
  const posAA = await page.evaluate(()=> Object.keys(posiciones).filter(p=> p.startsWith('AA')).length);
  verificar(posAA === 14, `Nicho AA con sus 14 posiciones (4 rack + 10 piso): ${posAA}`);

  // Nada de lo existente cambió.
  const despues = JSON.parse(await foto());
  const a = JSON.parse(antes);
  const igual = ['posiciones','pallets','nichos'].every(col=> Object.keys(a[col]).every(k=> JSON.stringify(a[col][k]) === JSON.stringify(despues[col][k])));
  verificar(igual, 'Posiciones, pallets y nichos existentes sin ningún cambio (incluido el pallet en Z01)');

  await page.screenshot({ path: path.join(__dirname, 'salida', 'bloque_intermedio.png'), fullPage: true });
  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
