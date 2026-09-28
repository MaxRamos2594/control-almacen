// Pasillo parcial: debajo del bloque A, solo desde el nicho A hasta el B
// (en el caso real, de A a L). Verifica que el pasillo quede justo bajo esos
// nichos y que vuelva a todo el ancho al limpiar los extremos.
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
  // Bloque A con pasillo: nichos A, B, C (rack) y X1 (solo piso); extensión PA-A después de la reja; bloque B abajo.
  await page.evaluate(async ()=>{
    const hace = (min)=> firebase.firestore.Timestamp.fromMillis(Date.now() - min*60000);
    await bloquesRef.doc('BA').set({ nombre:'A', pasillo:true, creado_en: hace(60) });
    await bloquesRef.doc('BAX').set({ nombre:'A EXT', anexado_a:'BA', creado_en: hace(50) });
    await bloquesRef.doc('BB').set({ nombre:'B', creado_en: hace(40) });
    const nicho = async (letra, bid, pos, tipo)=> nichosRef.doc(letra).set({ bloque_id: bid, orden: pos, pos_visual: pos, tipo, niveles:2, creado_en: hace(10) });
    await nicho('A','BA',0,'solo_rack'); await nicho('B','BA',1,'solo_rack'); await nicho('C','BA',2,'solo_rack'); await nicho('X1','BA',3,'solo_piso');
    await nicho('PA-A','BAX',0,'solo_rack'); await nicho('Z','BB',0,'solo_rack');
    await rejasRef.doc('R1').set({ nichosDesdeDerecha: 1 });
  });
  await page.waitForFunction(()=> Object.keys(nichos).length === 6, null, { timeout: 15000 });
  await page.evaluate(()=> switchTab('diseno'));
  await page.waitForTimeout(500);

  const medir = ()=> page.evaluate(()=>{
    const r = el=> el.getBoundingClientRect();
    const n = l=> r(document.querySelector(`#preview-bloques [data-rename-nicho="${l}"]`).closest('.nicho'));
    const p = r(document.querySelector('#preview-bloques .pasillo-divider'));
    const cont = r(document.getElementById('preview-bloques'));
    return { pl: p.left, pr: p.right, A: n('A'), B: n('B'), X1: n('X1'), cl: cont.left, cr: cont.right };
  });
  const lleno = await medir();
  verificar(lleno.pr - lleno.pl > lleno.cr - lleno.cl - 5, 'Sin tramo: el pasillo ocupa todo el ancho');

  // Desde A hasta B
  await page.selectOption('[data-pasillo-tramo="BA"][data-campo="pasillo_desde"]', 'A');
  await page.waitForFunction(()=> bloques['BA'].pasillo_desde === 'A', null, { timeout: 15000 });
  await page.selectOption('[data-pasillo-tramo="BA"][data-campo="pasillo_hasta"]', 'B');
  await page.waitForFunction(()=> bloques['BA'].pasillo_hasta === 'B', null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const t = await medir();
  verificar(Math.abs(t.pr - t.A.right) <= 2 && Math.abs(t.pl - t.B.left) <= 2,
    `Pasillo de A a B: va de x=${Math.round(t.pl)} a x=${Math.round(t.pr)} (B empieza en ${Math.round(t.B.left)}, A termina en ${Math.round(t.A.right)})`);
  verificar(t.pl > t.X1.right, 'El pasillo no pasa por debajo de X1 ni de C');
  await page.locator('#preview-bloques').screenshot({ path: path.join(__dirname, 'salida', 'pasillo_parcial.png') });

  // Con "Ocultar lado derecho" sigue bajo A..B
  await page.click('#btn-toggle-compacto-diseno');
  await page.waitForTimeout(500);
  const c = await medir();
  verificar(Math.abs(c.pr - c.A.right) <= 2 && Math.abs(c.pl - c.B.left) <= 2, 'Con "Ocultar lado derecho": el pasillo sigue de A a B');
  await page.click('#btn-toggle-compacto-diseno');
  await page.waitForTimeout(300);

  // Limpiar: vuelve a todo el ancho
  await page.selectOption('[data-pasillo-tramo="BA"][data-campo="pasillo_desde"]', '');
  await page.waitForFunction(()=> !bloques['BA'].pasillo_desde, null, { timeout: 15000 });
  await page.selectOption('[data-pasillo-tramo="BA"][data-campo="pasillo_hasta"]', '');
  await page.waitForFunction(()=> !bloques['BA'].pasillo_hasta, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const v = await medir();
  verificar(v.pr - v.pl > v.cr - v.cl - 5, 'Al limpiar los extremos el pasillo vuelve a todo el ancho');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
