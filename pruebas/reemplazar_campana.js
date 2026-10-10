// Cargar Campaña → "Reemplazar una campaña ya cargada": el PDF nuevo reemplaza
// las filas de una campaña existente conservando su correlativo, así sus guías
// siguen asociadas. Si el código del PDF ya está cargado, se sugiere reemplazar.
// Las filas "leídas del PDF" se ponen directo (la lectura del PDF ya tiene sus
// propias pruebas). Requiere los emuladores encendidos (npm run emuladores).
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
    const hoy = firebase.firestore.Timestamp.now();
    await campanaRegistrosRef.doc('REG-00046').set({ correlativo:'REG-00046', campana:'CAMPAÑA 08-10', codigo:'CAMP-1', estado:'ACTIVO', fecha_carga: hoy,
      fecha_transaccion:'2026-10-08', total_filas:3, sku_distintos:2, participantes:2, participantes_lista:['ATE','COMAS'] });
    for(const [t, sku, q] of [['ATE','S1',10],['ATE','S2',5],['COMAS','S1',8]])
      await campanaItemsRef.doc().set({ correlativo:'REG-00046', codigo:'CAMP-1', campana:'CAMPAÑA 08-10', participante:t, sku, producto:'P '+sku, cantidad:q });
    await guiasRegistrosRef.doc('G1').set({ correlativo:'G1', nro_guia:'TG01-1', campana_correlativo:'REG-00046', participante:'ATE', estado:'ACTIVO' });
    await guiaItemsRef.doc().set({ campana_correlativo:'REG-00046', participante:'ATE', codigo:'S1', cantidad:10 });
    await cargarRegistrosCampana(true);
    switchTab('campanas');
  });
  const leerPdf = (codigo, filas)=> page.evaluate(async ([codigo, filas])=>{
    campParsedRows = filas.map(([participante, sku, cantidad])=> ({ codigo, campana:'CAMPAÑA 08-10 V2', participante, sku, producto:'P '+sku, area:'1-P-1', cantidad, desglose:'' }));
    $('camp-preview-wrap').style.display = 'block';
    await prepararModoCampana(codigo);
    return { modo: modoCampana(), sel: $('camp-reemplazar-select').value, boton: $('btn-guardar-campana').textContent, hint: $('camp-reemplazar-hint').textContent,
      msg: $('camp-msg').textContent, opciones: $('camp-reemplazar-select').options.length - 1 };
  }, [codigo, filas]);

  // 1. Mismo código ya cargado: se sugiere reemplazar esa campaña
  let r = await leerPdf('CAMP-1', [['ATE','S1',50],['PIURA','S3',7]]);
  verificar(r.modo === 'reemplazar' && r.sel === 'REG-00046' && r.boton === 'Reemplazar REG-00046', `Mismo código CAMP-1: queda elegido "Reemplazar REG-00046" (${r.modo}, ${r.boton})`);
  verificar(/ya hay una campaña activa con el código CAMP-1/i.test(r.msg) && /3 filas de REG-00046 por las 2/.test(r.hint) && /siguen asociados/.test(r.hint), `Avisa y explica: "${r.hint}"`);

  // 2. Sin permiso de eliminar: no deja reemplazar
  const sinPermiso = await page.evaluate(async ()=>{
    const antes = currentPermisos; currentPermisos = Object.assign({}, antes, { admin:false, eliminar:false });
    actualizarModoCampana();
    $('camp-fecha-transaccion').value = '2026-10-09';
    $('btn-guardar-campana').click();
    await new Promise(r=> setTimeout(r, 500));
    const res = { hint: $('camp-reemplazar-hint').textContent, msg: $('camp-msg').textContent, filas: (await campanaItemsRef.where('correlativo','==','REG-00046').get()).size };
    currentPermisos = antes; actualizarModoCampana();
    return res;
  });
  verificar(/permiso de eliminar/.test(sinPermiso.hint) && /permiso de eliminar/.test(sinPermiso.msg) && sinPermiso.filas === 3, `Sin permiso de eliminar no reemplaza (${sinPermiso.filas} filas intactas)`);

  // 3. Reemplazar
  await page.evaluate(()=> $('btn-guardar-campana').click());
  await page.waitForFunction(()=> /Reemplazada|Error/.test($('camp-msg').textContent), null, { timeout: 30000 });
  const fin = await page.evaluate(async ()=>{
    const filas = (await campanaItemsRef.where('correlativo','==','REG-00046').get()).docs.map(d=> d.data()).map(f=> `${f.participante}/${f.sku}:${f.cantidad}`).sort();
    const cab = (await campanaRegistrosRef.doc('REG-00046').get()).data();
    const cabeceras = (await campanaRegistrosRef.get()).size;
    const guia = (await guiaItemsRef.where('campana_correlativo','==','REG-00046').get()).size;
    const log = (await movimientosRef.get()).docs.map(d=> d.data()).find(m=> m.tipo === 'campana_pdf_reemplazada' || m.accion === 'campana_pdf_reemplazada');
    return { msg: $('camp-msg').textContent, filas, cab, cabeceras, guia, log: !!log, preview: $('camp-preview-wrap').style.display };
  });
  verificar(/Reemplazada! REG-00046 — 3 filas anteriores reemplazadas por 2/.test(fin.msg), `Mensaje: "${fin.msg}"`);
  verificar(fin.filas.join(',') === 'ATE/S1:50,PIURA/S3:7', `Quedan solo las filas del PDF nuevo: ${fin.filas.join(', ')}`);
  verificar(fin.cab.estado === 'ACTIVO' && fin.cab.total_filas === 2 && fin.cab.participantes_lista.join(',') === 'ATE,PIURA' && fin.cab.campana === 'CAMPAÑA 08-10 V2' && fin.cab.fecha_transaccion === '2026-10-09' && fin.cab.reemplazos === 1,
    `Cabecera actualizada con el mismo correlativo (${fin.cab.total_filas} filas, tiendas ${fin.cab.participantes_lista.join(', ')}, reemplazos ${fin.cab.reemplazos})`);
  verificar(fin.cabeceras === 1 && fin.guia === 1, `No se creó otra campaña y la guía sigue asociada a REG-00046 (${fin.cabeceras} cabecera, ${fin.guia} ítem de guía)`);
  verificar(fin.log, 'Queda en la bitácora (campana_pdf_reemplazada)');

  // 4. Código distinto: por defecto "Campaña nueva" y se guarda con otro correlativo
  r = await leerPdf('CAMP-2', [['ICA','S9',4]]);
  verificar(r.modo === 'nueva' && r.boton === 'Guardar en base de datos' && r.opciones === 1, `Código nuevo CAMP-2: "Campaña nueva" por defecto (la lista para reemplazar tiene ${r.opciones} campaña)`);
  await page.evaluate(()=>{ $('camp-fecha-transaccion').value = '2026-10-10'; $('btn-guardar-campana').click(); });
  await page.waitForFunction(()=> /Guardado|Error/.test($('camp-msg').textContent), null, { timeout: 30000 });
  const nueva = await page.evaluate(async ()=> ({ cabeceras: (await campanaRegistrosRef.get()).docs.map(d=> d.id).sort(), viejas: (await campanaItemsRef.where('correlativo','==','REG-00046').get()).size }));
  verificar(nueva.cabeceras.length === 2 && nueva.viejas === 2, `Guardar como nueva no toca la otra campaña (${nueva.cabeceras.join(', ')})`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
