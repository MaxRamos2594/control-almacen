// Registro fotográfico por usuario: correlativo propio (RF-PREFIJO-00001), cada uno ve solo lo suyo
// (también en las reglas de Firestore), "ver todos" para reportes, y elegir la tienda a inventariar.
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const { abrirApp, limpiarEmuladores, ADMIN } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
const YOLANDA = { email: 'yolanda@ejemplo.com', pass: 'prueba123' }, JOHAN = { email: 'johan@ejemplo.com', pass: 'prueba123' };
// Espera una condición que puede ser asíncrona (lee Firestore).
async function esperar(page, fn, arg, ms){
  const fin = Date.now() + ms;
  while(Date.now() < fin){ if(await page.evaluate(fn, arg)) return; await new Promise(r=> setTimeout(r, 300)); }
  throw new Error('Tiempo agotado esperando: ' + fn.toString().slice(0, 120));
}
const listo = page=> page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });

(async ()=>{
  await limpiarEmuladores();

  // 1) Administrador: tiendas, un registro suyo en el CD y los usuarios con sus prefijos.
  let { browser, page, errores } = await abrirApp();
  const erroresTodos = [];
  await listo(page);
  await page.evaluate(async email=>{
    await participantesMaestroRef.doc('COMAS').set({ nombre:'COMAS' });
    await participantesMaestroRef.doc('CERCADO').set({ nombre:'CERCADO DE LIMA' });
    await bloquesRef.doc('B1').set({ nombre:'BLOQUE A', orden:1 });
    await posicionesRef.doc('A01').set({ bloque_id:'B1', estado:'vacio' });
    await registrosFotoRef.doc('RF-ADM-00001').set({ estado:'CONFIRMADO', participante:'CD VENEZUELA', posicion:'A01', usuario:'Administrador', usuario_email: email,
      fecha_creacion:'2026-11-01T10:00:00.000Z', items:[{ sku:'P1', cantidad:5, fotos:[] }], cant_items:1, unidades:5, skus:['P1'] });
    await registrosFotoRef.doc('RF-ADM-00002').set({ estado:'CONFIRMADO', participante:'CERCADO DE LIMA', posicion:'CAJA 1', usuario:'Administrador', usuario_email: email,
      fecha_creacion:'2026-11-02T10:00:00.000Z', items:[{ sku:'P2', cantidad:3, fotos:[] }], cant_items:1, unidades:3, skus:['P2'] });
    await usuariosRef.doc('yolanda@ejemplo.com').set({ email:'yolanda@ejemplo.com', alias:'YOLANDA', permisos:{ reg_fotos:true } });
    await usuariosRef.doc('johan@ejemplo.com').set({ email:'johan@ejemplo.com', alias:'JOHAN', permisos:{ reg_fotos:true } });
  }, ADMIN.email);
  // La lista de tiendas se actualiza cuando llegan (o cambian) los participantes, sin volver a entrar.
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('nuevo'); });
  await page.waitForFunction(()=> $('rf-tienda').options.length === 3, null, { timeout: 10000 });
  await page.evaluate(()=> participantesMaestroRef.doc('SJL').set({ nombre:'SAN JUAN DE LURIGANCHO' }));
  await page.waitForFunction(()=> [...$('rf-tienda').options].some(o=> o.value === 'SAN JUAN DE LURIGANCHO'), null, { timeout: 10000 });
  await page.evaluate(()=> participantesMaestroRef.doc('SJL').delete());
  await page.waitForFunction(()=> $('rf-tienda').options.length === 3, null, { timeout: 10000 });
  verificar(true, 'Una tienda nueva del maestro aparece al momento en "¿Dónde haces el inventario?" (y desaparece si se borra)');
  await page.click('#btn-menu'); await page.click('#tab-usuarios');
  await page.waitForSelector('#us-lista [data-us-email="johan@ejemplo.com"]', { timeout: 10000 });
  // Yolanda: además de lo suyo, ve los registros de CERCADO DE LIMA (de cualquier usuario).
  await page.click('#us-lista [data-us-email="yolanda@ejemplo.com"]');
  const chips = await page.evaluate(()=> [...document.querySelectorAll('#us-rf-part [data-us-rf-part]')].map(x=> x.dataset.usRfPart).join(','));
  await page.check('#us-rf-part [data-us-rf-part="CERCADO DE LIMA"]'); await page.click('#btn-guardar-usuario');
  await esperar(page, async ()=> (((await usuariosRef.doc('yolanda@ejemplo.com').get()).data() || {}).permisos.rf_participantes || []).join() === 'CERCADO DE LIMA', null, 10000);
  verificar(chips === 'CD VENEZUELA,CERCADO DE LIMA,COMAS', `Usuarios: participantes del registro fotográfico para elegir (${chips}); a YOLANDA se le da CERCADO DE LIMA`);
  // Tras guardar se recarga la lista: se espera a que vuelva a abrir a Yolanda antes de pasar a Johan.
  await page.waitForFunction(()=> /Permisos guardados/.test($('us-msg').textContent) && $('us-email').value === 'yolanda@ejemplo.com' && !!document.querySelector('#us-lista [data-us-email="johan@ejemplo.com"]'), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.click('#us-lista [data-us-email="johan@ejemplo.com"]');
  await page.waitForFunction(()=> $('us-email').value === 'johan@ejemplo.com', null, { timeout: 10000 });
  // Un prefijo repetido (YOL es el automático de YOLANDA) se rechaza.
  await page.fill('#us-rf-prefijo', 'yol'); await page.click('#btn-guardar-usuario');
  const repetido = await page.textContent('#us-msg');
  await page.fill('#us-rf-prefijo', 'J1'); await page.click('#btn-guardar-usuario');
  const invalido = await page.textContent('#us-msg');
  await page.fill('#us-rf-prefijo', 'jhn'); await page.check('#us-rf-todos'); await page.click('#btn-guardar-usuario');
  await esperar(page, async ()=> ((await usuariosRef.doc('johan@ejemplo.com').get()).data() || {}).rf_prefijo === 'JHN', null, 10000);
  const johanDoc = await page.evaluate(async ()=> (await usuariosRef.doc('johan@ejemplo.com').get()).data());
  verificar(/YOL ya lo usa YOLANDA/.test(repetido) && /de 2 a 5 letras/.test(invalido) && johanDoc.rf_prefijo === 'JHN' && johanDoc.permisos.rf_todos === true && johanDoc.permisos.reg_fotos === true,
    `Usuarios: prefijo repetido y prefijo con números rechazados; JOHAN queda con JHN y "ver todos" (${repetido.slice(0, 40)}…)`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_usuarios_permisos.png'), fullPage: true });
  erroresTodos.push(...errores); await browser.close();

  // 2) Yolanda: solo lo suyo, su correlativo RF-YOL-00001 y una tienda con ubicación libre.
  ({ browser, page, errores } = await abrirApp({ usuario: YOLANDA }));
  await listo(page);
  // Su única opción es Registro fotográfico: entra directo, antes de que lleguen los participantes.
  await page.waitForFunction(()=> $('view-regfoto').classList.contains('active') && $('rf-tienda').options.length >= 3, null, { timeout: 10000 });
  await page.waitForFunction(()=> $('rf-tienda').options.length >= 3, null, { timeout: 10000 });
  const inicio = await page.evaluate(()=> ({ pref: $('rf-mi-prefijo').textContent, tiendas: [...$('rf-tienda').options].map(o=> o.value).join(',') }));
  await page.selectOption('#rf-tienda', 'COMAS');
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> !$('rf-form').hidden && $('rf-correlativo').value === 'RF-YOL-00001', null, { timeout: 15000 });
  const form = await page.evaluate(()=> ({ part: $('rf-participante').value, ro: $('rf-posicion').readOnly, boton: $('btn-rf-pos').hidden, lbl: $('rf-pos-lbl').textContent, modal: !$('rf-pos-modal').hidden, foco: document.activeElement.id }));
  verificar(inicio.pref === 'RF-YOL-00001…' && inicio.tiendas === 'CD VENEZUELA,CERCADO DE LIMA,COMAS' && form.part === 'COMAS' && !form.ro && form.boton && /Ubicación en la tienda/.test(form.lbl) && !form.modal && form.foco === 'rf-posicion',
    `Yolanda elige la tienda al iniciar (${inicio.tiendas}); RF-YOL-00001 en COMAS con ubicación libre (sin layout)`);
  await page.fill('#rf-posicion', 'góndola 3');
  await esperar(page, async ()=> ((await registrosFotoRef.doc('RF-YOL-00001').get()).data() || {}).posicion === 'GÓNDOLA 3', null, 10000);
  await page.click('#btn-rf-guardar');
  const aviso = await page.textContent('#rf-aviso-txt'); await page.click('#btn-rf-aviso-ok');
  const doc = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-YOL-00001').get()).data());
  verificar(doc.participante === 'COMAS' && doc.posicion === 'GÓNDOLA 3' && doc.usuario_email === 'yolanda@ejemplo.com' && /Falta la foto de la posición/.test(aviso),
    `La ubicación se autoguarda (GÓNDOLA 3); al confirmar en una tienda no se exige el layout: "${aviso}"`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_usuarios_tienda.png'), fullPage: true });
  // Solo ve lo suyo; leer lo de otro lo bloquean las reglas.
  await page.evaluate(()=> setRfSubtab('lista'));
  await page.waitForFunction(()=> rfLeidos, null, { timeout: 10000 });
  const vis = await page.evaluate(async ()=>{
    const err = async p=>{ try{ await p; return 'leyó'; }catch(e){ return e.code; } };
    return { ids: rfLista.map(r=> r.id).join(','), usuarioOculto: $('rf-usuario-f').hidden, cercado: await err(registrosFotoRef.doc('RF-ADM-00002').get()), otro: await err(registrosFotoRef.doc('RF-ADM-00001').get()), todos: await err(registrosFotoRef.get()),
      ajeno: await err(registrosFotoRef.doc('RF-XYZ-00001').set({ usuario_email:'otro@ejemplo.com', estado:'BORRADOR' })) };
  });
  const aptoYol = await page.evaluate(()=>{ rfAbrir('RF-ADM-00002'); return { valor: ($('rf-apto-valor') || {}).textContent, botones: document.querySelectorAll('#rf-detalle [data-rf-apto]').length, puede: rfPuedeMarcarApto() }; });
  const alcance = await page.evaluate(()=>{ setRfSubtab('layout'); renderRfLayout(); return ($('rfl-resumen').querySelector('.rf-alcance') || {}).textContent || ''; });
  await page.evaluate(()=> setRfSubtab('lista'));
  verificar(/Ves tus registros y los de CERCADO DE LIMA\. Para ver los de otros usuarios/.test(alcance), `Aviso de qué registros ve Yolanda: "${alcance.slice(0, 70)}…"`);
  verificar(aptoYol.valor === 'SIN MARCAR' && aptoYol.botones === 0 && !aptoYol.puede, 'Yolanda (sin "ver todos" ni editar) ve "Apto para ajuste: SIN MARCAR" pero no puede marcarlo');
  verificar(vis.ids === 'RF-YOL-00001,RF-ADM-00002' && !vis.usuarioOculto && vis.otro === 'permission-denied' && vis.todos === 'permission-denied' && vis.ajeno === 'permission-denied' && vis.cercado === 'leyó',
    `Yolanda ve lo suyo y lo de CERCADO DE LIMA (${vis.ids}); las reglas le impiden leer lo de otro participante (${vis.otro}), listar todo (${vis.todos}) y crear a nombre de otro (${vis.ajeno})`);
  erroresTodos.push(...errores); await browser.close();

  // 3) Johan (ver todos, prefijo JHN): ve los de todos, filtra por tienda y usuario y su correlativo es propio.
  ({ browser, page, errores } = await abrirApp({ usuario: JOHAN }));
  await listo(page);
  await page.evaluate(()=>{ switchTab('regfoto'); setRfSubtab('nuevo'); });
  await page.waitForFunction(()=> $('rf-tienda').options.length >= 3, null, { timeout: 10000 });
  const prefJ = await page.textContent('#rf-mi-prefijo');
  await page.click('#btn-rf-iniciar');
  await page.waitForFunction(()=> $('rf-correlativo').value === 'RF-JHN-00001' && !$('rf-pos-modal').hidden, null, { timeout: 15000 });
  const cdForm = await page.evaluate(()=> ({ ro: $('rf-posicion').readOnly, part: $('rf-participante').value }));
  await page.keyboard.press('Escape');
  verificar(prefJ === 'RF-JHN-00001…' && cdForm.ro && cdForm.part === 'CD VENEZUELA', 'Johan: RF-JHN-00001 en el CD (recuerda la última tienda: CD) con el selector de posición del layout');
  await page.evaluate(()=> setRfSubtab('reportes'));
  await page.waitForFunction(()=> rfLeidos && $('rfr-tienda').options.length >= 3, null, { timeout: 10000 });
  await page.selectOption('#rfr-estado', '');
  const rep = await page.evaluate(()=> ({ ids: rfLista.map(r=> r.id).sort().join(','), resumen: [...document.querySelectorAll('#rf-rep-usuarios tbody tr')].map(t=> t.innerText.replace(/\s+/g, ' ').trim()),
    bloques: [...document.querySelectorAll('#rf-rep-resumen tr[data-rfr-bloque]')].map(t=> t.dataset.rfrBloque).join(','), usuarioVisible: !$('rfr-usuario').hidden,
    usuarios: [...$('rfr-usuario').options].map(o=> o.textContent).join(',') }));
  verificar(rep.ids === 'RF-ADM-00001,RF-ADM-00002,RF-JHN-00001,RF-YOL-00001' && rep.resumen.length === 4 && rep.resumen.some(t=> /^🏬 COMAS 👤 YOLANDA 1/.test(t)) && rep.resumen.some(t=> /^🏬 CD VENEZUELA 👤 Administrador 1 5/.test(t)) &&
    /BLOQUE A/.test(rep.bloques) && /🏬 COMAS/.test(rep.bloques) && rep.usuarioVisible && /YOLANDA/.test(rep.usuarios),
    `Johan ve todos (${rep.ids}); resumen por tienda y usuario: ${rep.resumen.join(' | ')}; bloques: ${rep.bloques}`);
  await page.selectOption('#rfr-tienda', 'COMAS');
  const soloComas = await page.evaluate(()=> ({ filas: [...document.querySelectorAll('#rf-rep-usuarios tbody tr')].length, bloques: [...document.querySelectorAll('#rf-rep-resumen tr[data-rfr-bloque]')].map(t=> t.dataset.rfrBloque).join(','),
    pos: [...document.querySelectorAll('#rf-rep-tabla tr[data-rfr-pos]')].map(t=> t.innerText.replace(/\s+/g, ' ').trim()).join(' | ') }));
  await page.selectOption('#rfr-tienda', ''); await page.selectOption('#rfr-usuario', 'yolanda@ejemplo.com');
  const soloYol = await page.evaluate(()=> rfFiltradosReporte().map(r=> r.id).join(','));
  await page.screenshot({ path: path.join(__dirname, 'salida', 'rf_usuarios_reportes.png'), fullPage: true });
  verificar(soloComas.filas === 1 && soloComas.bloques === '🏬 COMAS' && /📍 GÓNDOLA 3 🏬 COMAS/.test(soloComas.pos) && soloYol === 'RF-YOL-00001',
    `Filtro de tienda COMAS: solo su bloque y la ubicación "${soloComas.pos}"; filtro de usuario YOLANDA: ${soloYol}`);
  // Johan ("ver todos") marca apto para ajuste; los filtros y el resumen lo usan.
  await page.selectOption('#rfr-usuario', '');
  await page.evaluate(async ()=>{ await rfMarcarApto('RF-ADM-00001', 'SI'); await rfMarcarApto('RF-ADM-00002', 'NO'); });
  await page.selectOption('#rfr-apto', 'SI'); const fSi = await page.evaluate(()=> rfFiltradosReporte().map(r=> r.id).join(','));
  await page.selectOption('#rfr-apto', 'NO'); const fNo = await page.evaluate(()=> rfFiltradosReporte().map(r=> r.id).join(','));
  await page.selectOption('#rfr-apto', 'SIN'); const fSin = await page.evaluate(()=> rfFiltradosReporte().map(r=> r.id).sort().join(','));
  await page.selectOption('#rfr-apto', '');
  const resApto = await page.evaluate(()=> document.querySelector('#rf-rep-usuarios tfoot').innerText.replace(/\s+/g, ' ').trim());
  await page.evaluate(()=> setRfSubtab('lista')); await page.waitForFunction(()=> rfLeidos, null, { timeout: 10000 });
  await page.selectOption('#rf-apto-f', 'SI'); const lSi = await page.evaluate(()=> rfFiltrados().map(r=> r.id).join(',')); await page.selectOption('#rf-apto-f', '');
  const bd = await page.evaluate(async ()=> (await registrosFotoRef.doc('RF-ADM-00001').get()).data());
  verificar(fSi === 'RF-ADM-00001' && fNo === 'RF-ADM-00002' && fSin === 'RF-JHN-00001,RF-YOL-00001' && /^Total 4 \d+ 1 1 2$/i.test(resApto) && lSi === 'RF-ADM-00001' && bd.apto_ajuste === 'SI' && bd.apto_ajuste_por === 'JOHAN',
    `Apto para ajuste: Johan marca; filtro SÍ → ${fSi}, NO → ${fNo}, sin marcar → ${fSin}; resumen "${resApto}"; filtro en Registros → ${lSi}`);
  await page.evaluate(()=> setRfSubtab('reportes'));
  // Layout del CD: los registros de tiendas no se pintan.
  await page.evaluate(()=>{ setRfSubtab('layout'); $('rfl-estado').value = ''; renderRfLayout(); });
  const layout = await page.evaluate(()=> [...rflConteo().entries()].filter(([k])=> k).map(([k, L])=> k + ':' + L.map(r=> r.id).join('+')).join(' '));
  verificar(layout === 'A01:RF-ADM-00001', `Layout del CD con "Todos": solo cuenta registros del CD (${layout}); GÓNDOLA 3 de COMAS no entra`);
  // Filtro de usuario en el Layout: todos los usuarios o uno solo.
  await page.evaluate(async ()=>{
    await registrosFotoRef.doc('RF-JHN-00099').set({ estado:'CONFIRMADO', participante:'CD VENEZUELA', posicion:'A01', usuario:'JOHAN', usuario_email:'johan@ejemplo.com',
      fecha_creacion:'2026-11-03T10:00:00.000Z', items:[{ sku:'P9', cantidad:1, fotos:[] }], cant_items:1, unidades:1, skus:['P9'] });
    await rfCargar(true); $('rfl-estado').value = 'CONFIRMADO'; renderRfLayout();
  });
  const conteo = ()=> page.evaluate(()=> [...rflConteo().entries()].filter(([k])=> k).map(([k, L])=> k + ':' + L.map(r=> r.id).sort().join('+')).join(' '));
  const opciones = await page.evaluate(()=> [...$('rfl-usuario').options].map(o=> o.textContent).join(','));
  const todos = await conteo();
  await page.selectOption('#rfl-usuario', 'johan@ejemplo.com'); const soloJohan = await conteo();
  await page.selectOption('#rfl-usuario', { label: 'Administrador' }); const soloAdmin = await conteo();
  await page.selectOption('#rfl-usuario', ''); const otraVez = await conteo();
  verificar(opciones === '👤 Todos los usuarios,Administrador,JOHAN' && todos === 'A01:RF-ADM-00001+RF-JHN-00099' && soloJohan === 'A01:RF-JHN-00099' && soloAdmin === 'A01:RF-ADM-00001' && otraVez === todos,
    `Layout con filtro de usuario (${opciones}): todos → ${todos}; JOHAN → ${soloJohan}; Administrador → ${soloAdmin}`);
  erroresTodos.push(...errores); await browser.close();

  if(erroresTodos.length) console.log('\nErrores de JavaScript:\n' + [...new Set(erroresTodos)].join('\n'));
  console.log(fallas || erroresTodos.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas || erroresTodos.length ? 1 : 0);
})().catch(err=>{ console.error(err); process.exit(1); });
