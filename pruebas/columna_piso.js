// Caso real: X1, X2, X3 (solo piso, 6 filas) alineados en columna desde la
// altura de 03·04 de A, cruzando el pasillo (2 filas de alto) hasta la fila C
// (AB volteado: piso 05·06 arriba, rack 01·02 y 03·04 abajo); y el pasillo de
// C llegando hasta la columna de X1. Solo dibujo: no cambia ningún dato.
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
    // A: nichos A, B (2 niveles, piso 1 fila: 05/10) y X3, X2, X1 (solo piso); pasillo de A a B.
    await bloquesRef.doc('BA').set({ nombre:'A', pasillo:true, pasillo_desde:'A', pasillo_hasta:'B', creado_en: hace(60) });
    // C (volteado, pegado a la izquierda): AB, AC (piso 1 fila compacta 05/06); pasillo debajo.
    await bloquesRef.doc('BC').set({ nombre:'C', volteado:true, alinear_izquierda:true, pasillo:true, creado_en: hace(50) });
    const rack = async (letra, bid)=>{ for(const [i, nivel] of [[1,'arriba'],[2,'arriba'],[3,'abajo'],[4,'abajo']]) await posicionesRef.doc(`${letra}0${i}`).set({ tipo:'rack', nicho:letra, bloque_id:bid, nivel, estado:'vacio', bloqueada:false, pallet_codigo:null }); };
    const piso = async (letra, bid, pares)=>{ for(const [cod, fila, columna] of pares) await posicionesRef.doc(letra+cod).set({ tipo:'piso', nicho:letra, bloque_id:bid, nivel:null, fila, columna, estado:'vacio', bloqueada:false, pallet_codigo:null }); };
    // Orden visual (derecha → izquierda): X1, X2, X3, A, B
    let pos = 0;
    for(const x of ['X1','X2','X3']){
      await nichosRef.doc(x).set({ bloque_id:'BA', orden:pos, pos_visual:pos++, tipo:'solo_piso', creado_en: hace(10) });
      const p = []; for(let i=0;i<6;i++) p.push([String(1+i).padStart(2,'0'), i, 'izq'], [String(7+i).padStart(2,'0'), i, 'der']);
      await piso(x, 'BA', p);
    }
    for(const l of ['A','B']){
      await nichosRef.doc(l).set({ bloque_id:'BA', orden:pos, pos_visual:pos++, tipo:'rack_piso', niveles:2, piso_filas:1, creado_en: hace(10) });
      await rack(l, 'BA'); await piso(l, 'BA', [['05',0,'izq'],['10',0,'der']]);
    }
    for(const [l, p] of [['AB',0],['AC',1]]){
      await nichosRef.doc(l).set({ bloque_id:'BC', orden:p, pos_visual:p, tipo:'rack_piso', niveles:2, piso_filas:1, creado_en: hace(10) });
      await rack(l, 'BC'); await piso(l, 'BC', [['05',0,'izq'],['06',0,'der']]);
    }
    await posicionesRef.doc('X101').update({ estado:'ocupado', pallet_codigo:'CD0001' });
    await palletsRef.doc('CD0001').set({ items:[{producto:'P1', descripcion:'PRUEBA', cantidad:1, costo:1}], posicion_actual:'X101', estado:'activo' });
  });
  await page.waitForFunction(()=> Object.keys(nichos).length === 7 && posiciones['AC06'], null, { timeout: 15000 });
  await page.evaluate(()=> switchTab('diseno'));
  await page.waitForTimeout(500);
  const datosAntes = await page.evaluate(()=> JSON.stringify({ posiciones, pallets, nichos }));

  // Ajustes desde la interfaz: alto del pasillo de A = 2 filas; X desde "03 · 04 de A"; pasillo de C hasta X1.
  await page.selectOption('[data-pasillo-alto="BA"]', '2');
  await page.waitForFunction(()=> bloques['BA'].pasillo_filas === 2, null, { timeout: 15000 });
  const opciones = await page.evaluate(()=> [...document.querySelectorAll('[data-solo-piso-inicio="BA"] option')].map(o=> o.textContent));
  verificar(opciones.join(' | ') === '— normal (sin alinear) | 01 · 02 de A | 03 · 04 de A | 05 · 10 de A', `Opciones de altura: ${opciones.join(' | ')}`);
  await page.selectOption('[data-solo-piso-inicio="BA"]', '1');
  await page.waitForFunction(()=> bloques['BA'].solo_piso_inicio === 1, null, { timeout: 15000 });
  await page.selectOption('[data-pasillo-tramo="BC"][data-campo="pasillo_desde"]', 'X1');
  await page.waitForFunction(()=> bloques['BC'].pasillo_desde === 'X1', null, { timeout: 15000 });
  await page.waitForTimeout(700);

  const med = await page.evaluate(()=>{
    const cont = document.getElementById('preview-bloques');
    const fila = (letra, codigos)=>{ // centro vertical de la fila de posiciones que contiene esos códigos
      const n = cont.querySelector(`.nicho[data-letra="${letra}"]`);
      const r = [...n.querySelectorAll('.nicho-row')].find(row=> [...row.querySelectorAll('.slot')].map(s=> s.textContent.trim()).join(',') === codigos);
      if(!r) return null; const q = r.getBoundingClientRect(); return (q.top+q.bottom)/2;
    };
    const pas = [...cont.querySelectorAll('.pasillo-divider')].map(p=> p.getBoundingClientRect());
    const x1 = cont.querySelector('.nicho[data-letra="X1"]').getBoundingClientRect();
    return {
      x01: fila('X1','01,07'), x02: fila('X1','02,08'), x03: fila('X1','03,09'), x04: fila('X1','04,10'), x05: fila('X1','05,11'), x06: fila('X1','06,12'),
      x3_01: fila('X3','01,07'),
      a34: fila('A','03,04'), a510: fila('A','05,10'), ab56: fila('AB','05,06'), ab12: fila('AB','01,02'),
      pasA: pas[0], pasC: pas[1], x1l: x1.left, x1r: x1.right,
      filaA: cont.querySelector('.bloque-row[data-bloque="BA"]').getBoundingClientRect(),
    };
  });
  const cerca = (a,b)=> a!=null && b!=null && Math.abs(a-b) <= 2;
  verificar(cerca(med.x01, med.a34), 'X1 01·07 a la altura de 03·04 de A');
  verificar(cerca(med.x02, med.a510), 'X1 02·08 a la altura de 05·10 de A');
  verificar(cerca(med.x03, med.pasA.top + med.pasA.height/4) && cerca(med.x04, med.pasA.top + med.pasA.height*3/4), 'X1 03·09 y 04·10 dentro del pasillo (una por cada fila de su alto)');
  verificar(cerca(med.x05, med.ab56), 'X1 05·11 a la altura de 05·06 de AB');
  verificar(cerca(med.x06, med.ab12), 'X1 06·12 a la altura de 01·02 de AB');
  verificar(cerca(med.x3_01, med.a34), 'X3 también está alineado');
  verificar(Math.abs(med.pasA.height - 54) <= 2, `Pasillo de A con alto de 2 filas de posiciones (${Math.round(med.pasA.height)}px)`);
  verificar(med.pasC.right >= med.x1r - 2 && med.pasC.right <= med.x1r + 4, `Pasillo de C llega hasta la columna de X1 (termina en x=${Math.round(med.pasC.right)}, X1 en x=${Math.round(med.x1r)})`);
  verificar(med.x06 < med.pasC.top, 'La columna X termina antes del pasillo de C');
  await page.locator('#preview-bloques').screenshot({ path: path.join(__dirname, 'salida', 'columna_piso.png') });

  // También en Movimientos
  await page.evaluate(()=> switchTab('mov'));
  await page.waitForTimeout(700);
  const mov = await page.evaluate(()=>{
    const cont = document.getElementById('mov-bloques');
    const fila = (letra, id)=>{ const s = cont.querySelector(`#slot-${id}`); if(!s) return null; const q = s.getBoundingClientRect(); return (q.top+q.bottom)/2; };
    return { x01: fila('X1','X101'), a03: fila('A','A03'), x06: fila('X1','X106'), ab01: fila('AB','AB01') };
  });
  verificar(cerca(mov.x01, mov.a03) && cerca(mov.x06, mov.ab01), 'En Movimientos también: X101 junto a A03 y X106 junto a AB01');
  await page.locator('#mov-bloques').screenshot({ path: path.join(__dirname, 'salida', 'columna_piso_mov.png') });

  const datosDespues = await page.evaluate(()=> JSON.stringify({ posiciones, pallets, nichos }));
  verificar(datosAntes === datosDespues, 'Ninguna posición, pallet ni nicho cambió (solo dibujo)');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
