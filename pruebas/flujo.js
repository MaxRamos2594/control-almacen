// Prueba del flujo principal usando la interfaz como lo haría un usuario:
// crear bloque y nicho → crear pallet → moverlo → retirarlo, y verifica
// posiciones, kardex, bitácora, escape de HTML (XSS) y reglas de seguridad.
// Requiere los emuladores encendidos (npm run emuladores).
const { abrirApp, limpiarEmuladores, detectorXss } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp({ scriptInicial: detectorXss });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });

  // 1. Bloque y nicho
  await page.evaluate(()=> switchTab('diseno'));
  await page.fill('#bloque-nombre', 'BLOQUE PRUEBA');
  await page.click('#btn-crear-bloque');
  await page.waitForSelector('[data-add-nicho][data-niveles="2"]:not([data-sin-piso])');
  await page.click('[data-add-nicho][data-niveles="2"]:not([data-sin-piso])');
  await page.waitForFunction(()=> Object.keys(posiciones).length >= 14, null, { timeout: 15000 });
  const rack = await page.evaluate(()=> Object.keys(posiciones).filter(id=>posiciones[id].tipo==='rack').sort());
  verificar(rack.length === 4, `Nicho creado con 4 posiciones de rack (${rack.join(', ')})`);
  const [pos1, pos2] = rack;

  // 2. Crear pallet con una descripción maliciosa (debe mostrarse como texto)
  const XSS = '<img src=x onerror="window.__xss=1">CAJA';
  await page.evaluate(()=> switchTab('mov'));
  await page.click('#subtab-crear');
  await page.fill('#cp-codigo', 'CD0001');
  await page.fill('#cp-destino', pos1);
  const fila = page.locator('#cp-items-body .item-card').first();
  await fila.locator('.it-producto').fill('P100');
  await fila.locator('.it-producto').blur();
  await fila.locator('.it-desc').fill(XSS);
  await fila.locator('.it-cant').fill('10');
  await fila.locator('.it-costo').fill('2.5');
  await page.click('#btn-crear-pallet');
  await page.waitForFunction(p=> posiciones[p] && posiciones[p].estado === 'ocupado', pos1, { timeout: 15000 });
  verificar(true, `Pallet CD0001 creado en ${pos1}`);

  // 3. Mover pallet
  await page.click('#subtab-mover');
  await page.fill('#mv-origen', pos1);
  await page.dispatchEvent('#mv-origen', 'input');
  await page.fill('#mv-destino', pos2);
  await page.click('#btn-mover');
  await page.waitForFunction(p=> posiciones[p] && posiciones[p].estado === 'ocupado', pos2, { timeout: 15000 });
  verificar(await page.evaluate(p=> posiciones[p].estado === 'vacio', pos1), `Pallet movido de ${pos1} a ${pos2}`);

  // 4. Recorrer pantallas donde aparece la descripción (probar XSS)
  for(const t of ['productos','inventario','kardex','pallets','bitacora','reportes']){
    await page.evaluate(n=> switchTab(n), t); await page.waitForTimeout(700);
  }

  // 5. Retirar pallet desde el panel de detalle
  await page.evaluate(()=> switchTab('mov'));
  await page.click(`#slot-${pos2}`);
  await page.waitForSelector('#btn-retirar-pallet', { state: 'visible' });
  await page.click('#btn-retirar-pallet');
  const retirado = await page.waitForFunction(p=> posiciones[p] && posiciones[p].estado === 'vacio' && !pallets['CD0001'], pos2, { timeout: 15000 }).then(()=>true, ()=>false);
  verificar(retirado, `Pallet retirado y ${pos2} liberada`);

  // 6. Kardex y bitácora
  const kardex = await page.evaluate(async ()=>{
    const s = await kardexRef.where('producto','==','P100').get();
    return s.docs.map(d=> d.data()).map(d=> `${d.tipo}:${d.cantidad}:${d.motivo}`).sort();
  });
  verificar(kardex.length === 4, `Kardex con 4 registros: ${kardex.join(' | ')}`);
  verificar(kardex.includes('salida:10:Retiro de pallet completo'), 'Kardex registra la salida de 10 al retirar');
  const bitacora = await page.evaluate(async ()=>{
    const s = await movimientosRef.get(); return s.docs.map(d=> d.data().tipo);
  });
  verificar(['ingreso','movimiento','retiro'].every(t=> bitacora.includes(t)), `Bitácora registra ingreso, movimiento y retiro`);

  // Se verifica al final: cubre también el panel de detalle y el retiro.
  const origenXss = await page.evaluate(()=> window.__xssOrigen);
  verificar(origenXss.length === 0, 'Descripción con HTML no se inserta como código (XSS bloqueado)' + (origenXss.length ? ':\n    ' + [...new Set(origenXss)].join('\n    ') : ''));

  // 7. Reglas de seguridad
  const intentoBorrarBitacora = await page.evaluate(async ()=>{
    const s = await movimientosRef.limit(1).get();
    try{ await s.docs[0].ref.delete(); return 'permitido'; }catch(e){ return e.code; }
  });
  verificar(intentoBorrarBitacora === 'permission-denied', 'Reglas: nadie puede borrar la bitácora');
  await browser.close();

  // Usuario con cuenta pero sin permisos asignados: debe ser expulsado.
  const intruso = await abrirApp({ usuario: { email: 'intruso@ejemplo.com', pass: 'prueba123' } }).then(()=> 'entró', e=> 'rechazado');
  verificar(intruso === 'rechazado', 'Usuario sin permisos no puede entrar');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
