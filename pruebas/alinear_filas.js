// Caso real: fila D (AQ…AN, nichos compactos, pasillo de 2 filas debajo) y
// fila B volteada (W: piso 05-14 arriba). Se alinea B con la de arriba:
//   AN 05·06 = W 05·10, AN 07·12 = W 06·11, pasillo = W 07·12 y 08·13,
// y X y AA (debajo de AN y AO) bajan para quedar después del pasillo, sin
// que nada los tape. Solo dibujo.
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
    await bloquesRef.doc('BD').set({ nombre:'D', alinear_izquierda:true, pasillo:true, pasillo_filas:2, pasillo_desde:'AN', pasillo_hasta:'AO', creado_en: hace(60) });
    await bloquesRef.doc('BB').set({ nombre:'B', volteado:true, creado_en: hace(50) });
    const nicho = async (letra, bid, pos, niveles, pisoFilas, compacto)=>{
      await nichosRef.doc(letra).set({ bloque_id:bid, orden:pos, pos_visual:pos, tipo:'rack_piso', niveles, piso_filas:pisoFilas, creado_en: hace(10) });
      const nombres = niveles===3 ? ['arriba','medio','abajo'] : ['arriba','abajo'];
      let n = 1;
      for(const nivel of nombres) for(let c=0;c<2;c++){ await posicionesRef.doc(letra + String(n).padStart(2,'0')).set({ tipo:'rack', nicho:letra, bloque_id:bid, nivel, estado:'vacio', bloqueada:false, pallet_codigo:null }); n++; }
      const r = niveles*2;
      for(let i=0;i<pisoFilas;i++) for(const [num, columna] of [[r+1+i,'izq'],[r+6+i,'der']])
        await posicionesRef.doc(letra + String(num).padStart(2,'0')).set({ tipo:'piso', nicho:letra, bloque_id:bid, nivel:null, fila:i, columna, estado:'vacio', bloqueada:false, pallet_codigo:null });
    };
    // D (pegada a la izquierda): AN, AO (3 niveles, piso 1 fila: 07·12)
    await nicho('AN','BD',0,3,1); await nicho('AO','BD',1,3,1);
    // B (volteado): W (2 niveles, piso 5 filas) a la derecha; X y AA (3 niveles, piso 1 fila) debajo de AN y AO
    await nicho('W','BB',0,2,5); await nicho('X','BB',1,3,1); await nicho('AA','BB',2,3,1);
    await posicionesRef.doc('X07').update({ bloqueada:true, campana_dia:true });
  });
  await page.waitForFunction(()=> Object.keys(nichos).length === 5 && posiciones['AA12'], null, { timeout: 15000 });
  await page.evaluate(()=> switchTab('diseno'));
  await page.waitForTimeout(500);
  const datosAntes = await page.evaluate(()=> JSON.stringify({ posiciones, pallets, nichos }));

  // Desde la interfaz: D compacto; B alineada: W · 05·10 a la altura de AN · 05·06.
  await page.check('[data-nicho-compacto="BD"]');
  await page.waitForFunction(()=> bloques['BD'].nicho_compacto === true, null, { timeout: 15000 });
  await page.selectOption('[data-alinear-fila="BB"][data-campo="nicho"]', 'W');
  await page.waitForFunction(()=> bloques['BB'].alinear_fila && bloques['BB'].alinear_fila.nicho === 'W', null, { timeout: 15000 });
  await page.selectOption('[data-alinear-fila="BB"][data-campo="ref_nicho"]', 'AN');
  await page.waitForFunction(()=> bloques['BB'].alinear_fila.ref_nicho === 'AN' && /\(AN\)/.test((document.querySelector('[data-alinear-fila="BB"][data-campo="ref_fila"] option')||{}).textContent||''), null, { timeout: 15000 });
  const opcionesRef = await page.evaluate(()=> [...document.querySelectorAll('[data-alinear-fila="BB"][data-campo="ref_fila"] option')].map(o=> o.textContent));
  verificar(opcionesRef.join(' | ') === 'Título (AN) | 01 · 02 | 03 · 04 | 05 · 06 | 07 · 12', `Filas de AN para elegir: ${opcionesRef.join(' | ')}`);
  const opcionesW = await page.evaluate(()=> [...document.querySelectorAll('[data-alinear-fila="BB"][data-campo="fila"] option')].map(o=> o.textContent));
  verificar(opcionesW[0] === 'Título (W)' && opcionesW[1] === '05 · 10' && opcionesW.length === 8, `Filas de W para elegir: ${opcionesW.join(' | ')}`);
  await page.selectOption('[data-alinear-fila="BB"][data-campo="ref_fila"]', '2');
  await page.waitForFunction(()=> bloques['BB'].alinear_fila.ref_fila === 2, null, { timeout: 15000 });
  await page.waitForTimeout(700);

  const medir = (contId)=> page.evaluate((contId)=>{
    const cont = document.getElementById(contId);
    const fila = (letra, codigos)=>{
      const n = cont.querySelector(`.nicho[data-letra="${letra}"]`);
      const r = [...n.querySelectorAll('.nicho-row')].find(row=> [...row.querySelectorAll('.slot')].map(s=> s.textContent.trim().slice(-2)).join(',') === codigos);
      return r ? r.getBoundingClientRect() : null;
    };
    const pas = cont.querySelector('.pasillo-divider').getBoundingClientRect();
    const x07 = fila('X','📢,12') || fila('X','07,12'); // X07 está bloqueada por campaña: se ve 📢
    const encima = x07 ? document.elementFromPoint((x07.left+x07.right)/2, (x07.top+x07.bottom)/2) : null;
    // Tope del contenido (letra, etiquetas y posiciones), sin el marco.
    const topeContenido = l=> Math.min(...[...cont.querySelector(`.nicho[data-letra="${l}"]`).querySelectorAll('.nicho-label, .nicho-section-label, .nicho-row')].map(e=> e.getBoundingClientRect()).filter(q=> q.height>0).map(q=> q.top));
    const xNicho = { top: topeContenido('X') };
    const aaNicho = { top: topeContenido('AA') };
    const ultimo = [...cont.querySelectorAll('.nicho')].reduce((m,n)=> Math.max(m, n.getBoundingClientRect().bottom), 0);
    const filaB = cont.querySelector('.bloque-row[data-bloque="BB"]').getBoundingClientRect();
    const c = q=> q ? (q.top+q.bottom)/2 : null;
    return { an56: c(fila('AN','05,06')), an712: c(fila('AN','07,12')), w510: c(fila('W','05,10')), w611: c(fila('W','06,11')),
      w712: fila('W','07,12'), w813: fila('W','08,13'), pas: { top: pas.top, bottom: pas.bottom },
      tapa: !!(encima && encima.closest('.pasillo-divider')), encima: encima ? encima.className : null,
      xTop: xNicho.top, aaTop: aaNicho.top, dentroDeFila: ultimo <= filaB.bottom + 1,
      x07visible: !!(encima && encima.closest('.nicho[data-letra="X"]')),
      an712visible: (()=>{ const q = fila('AN','07,12'); const e = q && document.elementFromPoint((q.left+q.right)/2, (q.top+q.bottom)/2); return !!(e && e.closest('.nicho[data-letra="AN"]')); })() };
  }, contId);
  const cerca = (a,b,t=2)=> a!=null && b!=null && Math.abs(a-b) <= t;
  for(const [vista, contId] of [['Diseño','preview-bloques'],['Movimientos','mov-bloques']]){
    if(vista==='Movimientos'){ await page.evaluate(()=> switchTab('mov')); await page.waitForTimeout(700); }
    const m = await medir(contId);
    verificar(cerca(m.an56, m.w510), `${vista}: AN 05·06 a la altura de W 05·10`);
    verificar(cerca(m.an712, m.w611), `${vista}: AN 07·12 a la altura de W 06·11`);
    verificar(cerca(m.pas.top, m.w712.top, 3) && cerca(m.pas.bottom, m.w813.bottom, 4), `${vista}: pasillo a la altura de W 07·12 y 08·13 (pasillo ${Math.round(m.pas.top)}–${Math.round(m.pas.bottom)}, W ${Math.round(m.w712.top)}–${Math.round(m.w813.bottom)})`);
    verificar(!m.tapa && m.x07visible, `${vista}: el pasillo NO tapa el piso de X (se ve) [${m.encima}]`);
    verificar(m.xTop >= m.pas.bottom && m.aaTop >= m.pas.bottom, `${vista}: X y AA empiezan debajo del pasillo (X y=${Math.round(m.xTop)}, pasillo termina en y=${Math.round(m.pas.bottom)})`);
    verificar(m.dentroDeFila, `${vista}: la fila B reserva el espacio de lo que bajó (no se sale)`);
    verificar(m.an712visible, `${vista}: AN 07·12 se ve (no la tapa la fila de abajo)`);
    await page.locator('#' + contId).screenshot({ path: path.join(__dirname, 'salida', `alinear_filas_${contId}.png`) });
  }
  const datosDespues = await page.evaluate(()=> JSON.stringify({ posiciones, pallets, nichos }));
  verificar(datosAntes === datosDespues, 'Ninguna posición, pallet ni nicho cambió (solo dibujo)');

  // Caso 2 (pedido después): B compacta y títulos alineados: título de W = título de AN.
  // Entonces AN 05·06 = W 07·12, el pasillo va a la altura de W 09·14 y 01·02,
  // y el título de X (que baja) queda a la altura de la última fila de W (03·04).
  await page.evaluate(()=> switchTab('diseno'));
  await page.check('[data-nicho-compacto="BB"]');
  await page.waitForFunction(()=> bloques['BB'].nicho_compacto === true, null, { timeout: 15000 });
  await page.selectOption('[data-alinear-fila="BB"][data-campo="fila"]', '-1');
  await page.waitForFunction(()=> bloques['BB'].alinear_fila.fila === -1, null, { timeout: 15000 });
  await page.selectOption('[data-alinear-fila="BB"][data-campo="ref_fila"]', '-1');
  await page.waitForFunction(()=> bloques['BB'].alinear_fila.ref_fila === -1, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  for(const [vista, contId] of [['Diseño','preview-bloques'],['Movimientos','mov-bloques']]){
    if(vista==='Movimientos'){ await page.evaluate(()=> switchTab('mov')); await page.waitForTimeout(700); }
    const t = await page.evaluate((contId)=>{
      const cont = document.getElementById(contId);
      cont.querySelector('.nicho[data-letra="X"]').scrollIntoView({ block:'center' });
      const c = q=> q ? (q.top+q.bottom)/2 : null;
      const rot = l=> cont.querySelector(`.nicho[data-letra="${l}"] .nicho-label`).getBoundingClientRect();
      const fila = (letra, codigos)=>{
        const n = cont.querySelector(`.nicho[data-letra="${letra}"]`);
        const r = [...n.querySelectorAll('.nicho-row')].find(row=> [...row.querySelectorAll('.slot')].map(s=> s.textContent.trim().slice(-2)).join(',') === codigos);
        return r ? r.getBoundingClientRect() : null;
      };
      const pas = cont.querySelector('.pasillo-divider').getBoundingClientRect();
      const x = rot('X');
      const encimaX = document.elementFromPoint((x.left+x.right)/2, (x.top+x.bottom)/2);
      return { an: c(rot('AN')), ao: c(rot('AO')), w: c(rot('W')), x: c(x), aa: c(rot('AA')), an56: c(fila('AN','05,06')), w712: c(fila('W','07,12')),
        w0304: c(fila('W','03,04')), w914: fila('W','09,14'), w0102: fila('W','01,02'), pas: { top: pas.top, bottom: pas.bottom },
        xVisible: !!(encimaX && encimaX.closest('.nicho[data-letra="X"]')),
        wFondo: cont.querySelector('.nicho[data-letra="W"]').getBoundingClientRect().bottom,
        xFondo: cont.querySelector('.nicho[data-letra="X"]').getBoundingClientRect().bottom,
        filaB: cont.querySelector('.bloque-row[data-bloque="BB"]').getBoundingClientRect().bottom };
    }, contId);
    const cerca = (a,b,tol=2)=> a!=null && b!=null && Math.abs(a-b) <= tol;
    verificar(cerca(t.an, t.w) && cerca(t.ao, t.w), `${vista} (títulos): títulos de AN y AO a la altura del título de W`);
    verificar(cerca(t.an56, t.w712), `${vista} (títulos): AN 05·06 a la altura de W 07·12`);
    verificar(cerca(t.pas.top, t.w914.top, 3) && cerca(t.pas.bottom, t.w0102.bottom, 4), `${vista} (títulos): pasillo a la altura de W 09·14 y 01·02`);
    verificar(cerca(t.x, t.w0304) && cerca(t.aa, t.w0304), `${vista} (títulos): títulos de X y AA a la altura de la última fila de W (03·04)`);
    verificar(t.xVisible, `${vista} (títulos): el título de X se ve (no lo tapa el pasillo)`);
    verificar(cerca(t.wFondo, t.xFondo, 1), `${vista} (títulos): el borde de abajo de W llega al de X (W y=${Math.round(t.wFondo)}, X y=${Math.round(t.xFondo)})`);
    verificar(t.wFondo <= t.filaB + 1, `${vista} (títulos): el cuadro estirado no se sale de la fila`);
    await page.locator('#' + contId).screenshot({ path: path.join(__dirname, 'salida', `alinear_titulos_${contId}.png`) });
  }
  await page.evaluate(()=> switchTab('diseno'));

  // Quitar el alineado: la fila B vuelve a su lugar.
  await page.evaluate(()=> switchTab('diseno'));
  await page.selectOption('[data-alinear-fila="BB"][data-campo="nicho"]', '');
  await page.waitForFunction(()=> !bloques['BB'].alinear_fila, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const sinAlinear = await page.evaluate(()=> document.querySelector('#preview-bloques .bloque-row[data-bloque="BB"]').style.marginTop === '');
  verificar(sinAlinear, 'Al elegir "— no", la fila B vuelve a su lugar');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
