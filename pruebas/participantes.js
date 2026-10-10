// Campañas → Participantes: maestro de tiendas (nombre oficial, Lima/Provincia,
// otros nombres, palabras de dirección) y lista de los participantes ya
// registrados en el módulo que aún no están en el maestro. Solo admin edita.
// Requiere los emuladores encendidos (npm run emuladores).
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
    await campanaRegistrosRef.doc('REG-00001').set({ correlativo:'REG-00001', campana:'C1', estado:'ACTIVO', fecha_carga: hoy, participantes_lista:['ICA','MALL PLAZA COMAS','VENTANILLA'] });
    // Mismo participante escrito distinto ("Mall plaza  Comas"): cuenta como el mismo
    await campanaRegistrosRef.doc('REG-00002').set({ correlativo:'REG-00002', campana:'C2', estado:'ACTIVO', fecha_carga: hoy, participantes_lista:['HUANCAYO','Mall plaza  Comas'] });
    await guiasRegistrosRef.doc('G1').set({ correlativo:'G1', participante:'VENTANILLA', estado:'ACTIVO', punto_llegada:'CONDOMINIO AV. NESTOR GAMBETTA KM8, VENTANILLA, CALLAO, CALLAO, PERU' });
    await guiasRegistrosRef.doc('G2').set({ correlativo:'G2', participante:'HUANCAYO', estado:'ACTIVO', punto_llegada:'AV. GIRALDEZ NRO. 354 - HUANCAYO - HUANCAYO - JUNIN' });
    await guiasRegistrosRef.doc('G3').set({ correlativo:'G3', participante:'HUANCAYO', estado:'ACTIVO', punto_llegada:'AV. GIRALDEZ NRO. 354 - HUANCAYO - JUNIN' });
    await validadoresRef.doc('REG-00001__TACNA').set({ correlativo:'REG-00001', participante:'TACNA', validadores:[] });
    await mapeoDestinoParticipanteRef.doc('dest-x').set({ participante:'PIURA', punto_llegada_original:'AV. GRAU, PIURA' });
    // Usuario que no es administrador (para probar que no puede editar)
    await usuariosRef.doc('operador@ejemplo.com').set({ alias:'OPERADOR', permisos:{ campanas:true } });
    switchTab('campanas');
  });
  await page.click('#campsub-participantes');
  await page.waitForFunction(()=> $('pm-nuevos-body').children.length > 0 || $('pm-nuevos-empty').style.display === 'block', null, { timeout: 20000 });
  const filasNuevos = ()=> page.evaluate(()=> [...document.querySelectorAll('#pm-nuevos-body tr')].map(r=> [...r.cells].slice(0,4).map(c=> c.innerText.trim()).join('/')));
  let n = await filasNuevos();
  verificar(n.length === 6 && n.includes('MALL PLAZA COMAS/2/0/SIN DEFINIR') && n.includes('VENTANILLA/1/1/LIMA') && n.includes('HUANCAYO/1/2/PROVINCIA') && n.some(x=> x.startsWith('TACNA/0/0')) && n.some(x=> x.startsWith('PIURA/0/0')),
    `Registrados en el módulo (campañas, guías, validadores, recordados), sin repetir "Mall plaza  Comas": ${n.join(' | ')}`);

  // Agregar uno: queda con la zona sugerida
  await page.click('#pm-nuevos-body [data-pm-agregar="VENTANILLA"]');
  await page.waitForFunction(()=> participantesMaestroCache['VENTANILLA'], null, { timeout: 10000 });
  await page.waitForTimeout(300);
  let m = await page.evaluate(()=> [...document.querySelectorAll('#pm-body tr')].map(r=> [...r.cells].slice(0,7).map(c=> c.innerText.trim()).join('/')));
  verificar(m.length === 1 && m[0] === 'VENTANILLA/LIMA/—/—/1/1/Activo' && (await filasNuevos()).length === 5, `Agregar VENTANILLA: queda en el maestro con zona LIMA y su uso (${m[0]})`);

  // Crear con el formulario y unir otro nombre
  await page.fill('#pm-nombre', 'Mall Plaza Comas Norte'); await page.selectOption('#pm-zona', 'LIMA'); await page.fill('#pm-alias', 'mp comas'); await page.fill('#pm-palabras', 'av. tupac amaru');
  await page.click('#btn-pm-guardar');
  await page.waitForFunction(()=> participantesMaestroCache['MALL PLAZA COMAS NORTE'], null, { timeout: 10000 });
  await page.selectOption('#pm-nuevos-body [data-pm-unir="MALL PLAZA COMAS"]', 'MALL PLAZA COMAS NORTE');
  await page.waitForFunction(()=> (participantesMaestroCache['MALL PLAZA COMAS NORTE'].alias||[]).length === 2, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  m = await page.evaluate(()=> { const r = [...document.querySelectorAll('#pm-body tr')].find(r=> /NORTE/.test(r.cells[0].innerText)); return [...r.cells].slice(0,6).map(c=> c.innerText.replace(/\s+/g,' ').trim()).join('/'); });
  verificar(m === 'MALL PLAZA COMAS NORTE/LIMA/MP COMAS MALL PLAZA COMAS/AV. TUPAC AMARU/2/0', `Formulario + "Unir a…": ${m}`);
  verificar(await page.evaluate(()=> participanteDelMaestro('mall plaza comas').nombre === 'MALL PLAZA COMAS NORTE' && participanteDelMaestro('MP  Comas').nombre === 'MALL PLAZA COMAS NORTE' && !participanteDelMaestro('LIMA')), 'participanteDelMaestro() reconoce los otros nombres (sin importar mayúsculas ni espacios)');

  // Nombre repetido
  await page.fill('#pm-nombre', 'mp comas'); await page.selectOption('#pm-zona', 'LIMA'); await page.fill('#pm-alias', ''); await page.fill('#pm-palabras', '');
  await page.click('#btn-pm-guardar');
  await page.waitForTimeout(400);
  verificar(/ya es un nombre de MALL PLAZA COMAS NORTE/.test(await page.textContent('#pm-msg')), `No deja repetir un nombre: "${await page.textContent('#pm-msg')}"`);

  // Agregar todos
  await page.click('#btn-pm-agregar-todos');
  await page.waitForFunction(()=> Object.keys(participantesMaestroCache).length === 6, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const z = await page.evaluate(()=> Object.values(participantesMaestroCache).map(p=> p.nombre + ':' + (p.zona||'-')).sort().join(' '));
  verificar(z === 'HUANCAYO:PROVINCIA ICA:- MALL PLAZA COMAS NORTE:LIMA PIURA:- TACNA:- VENTANILLA:LIMA' && await page.evaluate(()=> $('pm-nuevos-empty').style.display === 'block'), `"Agregar todos": ${z}`);
  await page.selectOption('#pm-filtro-zona', 'ND');
  await page.waitForTimeout(200);
  verificar((await page.evaluate(()=> [...document.querySelectorAll('#pm-body tr')].map(r=> r.cells[0].innerText).join(','))) === 'ICA,PIURA,TACNA', 'Filtro "Sin definir": ICA, PIURA, TACNA');

  // Editar zona y desactivar
  await page.click('#pm-body [data-pm-editar="ICA"]');
  await page.selectOption('#pm-zona', 'PROVINCIA'); await page.fill('#pm-palabras', 'ica');
  await page.click('#btn-pm-guardar');
  await page.waitForFunction(()=> participantesMaestroCache['ICA'].zona === 'PROVINCIA', null, { timeout: 10000 });
  await page.selectOption('#pm-filtro-zona', '');
  await page.click('#pm-body [data-pm-activo="PIURA"]');
  await page.waitForFunction(()=> participantesMaestroCache['PIURA'].activo === false, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const r = await page.evaluate(()=> ({ resumen: $('pm-resumen').textContent, filas: document.querySelectorAll('#pm-body tr').length, ica: participantesMaestroCache['ICA'].palabras_direccion.join(',') }));
  verificar(r.resumen === '5 activos · 2 Lima · 2 Provincia' && r.filas === 5 && r.ica === 'ICA', `Editar ICA a Provincia y desactivar PIURA: ${r.resumen}`);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^participante_/.test(t)).sort().join(','));
  await page.selectOption('#pm-filtro-estado', '');
  await page.waitForTimeout(300);
  await page.locator('#campsub-panel-participantes').screenshot({ path: require('path').join(__dirname, 'salida', 'participantes.png') });
  await page.selectOption('#pm-filtro-estado', 'ACTIVO');
  verificar(/participante_creado/.test(log) && /participante_unido/.test(log) && /participante_editado/.test(log) && /participante_desactivado/.test(log), `Bitácora: ${log}`);
  await browser.close();

  // Usuario sin permiso de administrador: ve el maestro pero no puede editarlo
  const op = await abrirApp({ usuario: { email: 'operador@ejemplo.com', pass: 'prueba123' } });
  await op.page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await op.page.evaluate(()=> switchTab('campanas'));
  await op.page.click('#campsub-participantes');
  await op.page.waitForTimeout(800);
  const o = await op.page.evaluate(async ()=>{
    const filas = document.querySelectorAll('#pm-body tr').length;
    let escribir;
    try{ await participantesMaestroRef.doc('X').set({ nombre:'X' }); escribir = 'permitido'; }catch(e){ escribir = e.code; }
    return { filas, form: getComputedStyle($('pm-form')).display, botones: document.querySelectorAll('#pm-body [data-pm-editar], #btn-pm-agregar-todos:not(.hidden-perm)').length, escribir };
  });
  verificar(o.filas === 5 && o.form === 'none' && o.botones === 0, `Operador (no admin) ve los ${o.filas} participantes sin formulario ni botones de edición (${o.form}, ${o.botones} botones)`);
  verificar(o.escribir === 'permission-denied', `Reglas: un no administrador no puede escribir en el maestro (${o.escribir})`);
  errores.push(...op.errores);
  await op.browser.close();

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
