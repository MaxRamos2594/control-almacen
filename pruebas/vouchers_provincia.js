// Vouchers Agencia: solo se listan las guías de tiendas marcadas como
// PROVINCIA en el maestro de participantes (también por sus otros nombres);
// las demás se explican en un aviso (Lima / sin zona / no registradas).
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
    for(const c of ['REG-00001','REG-00002']) await campanaRegistrosRef.doc(c).set({ correlativo:c, campana:'CAMP '+c, estado:'ACTIVO', fecha_carga: hoy });
    const pm = (id, nombre, zona, alias)=> participantesMaestroRef.doc(id).set({ nombre, zona, alias: alias||[], palabras_direccion:[], activo:true });
    await pm('HUANCAYO','HUANCAYO','PROVINCIA',['HUANCAYO REAL PLAZA']); await pm('ATE','ATE','LIMA'); await pm('TACNA','TACNA','');
    const guia = (id, camp, participante, extra)=> guiasRegistrosRef.doc(id).set(Object.assign({ correlativo:id, nro_guia:'TG-'+id, campana_correlativo:camp, participante, estado:'ACTIVO', fecha_traslado:'2026-10-05', punto_llegada:'DIR '+participante, fecha_carga: hoy }, extra||{}));
    await guia('G1','REG-00001','HUANCAYO'); await guia('G2','REG-00001','Huancayo Real Plaza');
    await guia('G3','REG-00001','ATE'); await guia('G4','REG-00001','TACNA'); await guia('G5','REG-00001','PIURA');
    await guia('G6','REG-00001','HUANCAYO', { voucher_correlativo:'VOU-00001' });   // ya está en un voucher
    await guia('G7','REG-00002','ATE');
    await cargarRegistrosCampana(true);
    switchTab('campanas');
  });
  await page.waitForFunction(()=> Object.keys(participantesMaestroCache).length === 3, null, { timeout: 10000 });
  await page.click('#campsub-vouchers');
  await page.waitForFunction(()=> $('vch-campana-select').options.length > 2, null, { timeout: 10000 });
  const cargar = async (c)=>{
    await page.selectOption('#vch-campana-select', c);
    await page.click('#btn-vch-cargar-guias');
    await page.waitForFunction(()=> !$('btn-vch-cargar-guias').disabled, null, { timeout: 10000 });
    await page.waitForTimeout(200);
    return page.evaluate(()=> ({ guias: [...document.querySelectorAll('#vch-guias-body tr')].map(r=> r.cells[1].innerText).join(','),
      aviso: getComputedStyle($('vch-guias-fuera')).display !== 'none' ? $('vch-guias-fuera').innerText : '', vacio: $('vch-guias-empty').style.display !== 'none' ? $('vch-guias-empty').innerText : '' }));
  };
  let r = await cargar('REG-00001');
  verificar(r.guias === 'TG-G1,TG-G2', `Solo guías de Provincia, también por otro nombre ("Huancayo Real Plaza"): ${r.guias}`);
  verificar(/No se muestran: 1 de Lima · 1 de tiendas sin zona en el maestro \(TACNA\) · 1 de tiendas que no están en el maestro \(PIURA\)\. Complétalas en Gestionar → Participantes\./.test(r.aviso), `Aviso: "${r.aviso}"`);
  r = await cargar('REG-00002');
  verificar(r.guias === '' && /No hay guías de tiendas de Provincia/.test(r.vacio) && /1 de Lima\.$/.test(r.aviso), `Campaña solo con Lima: "${r.vacio}" · "${r.aviso}"`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
