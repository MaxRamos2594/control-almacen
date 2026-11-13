// Usuarios: lista de usuarios y permisos a detalle (opción del menú y sus secciones).
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const { abrirApp, limpiarEmuladores, ADMIN } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
const visibles = (page, sel)=> page.evaluate(sel=> [...document.querySelectorAll(sel)].filter(b=> b.offsetParent).map(b=> b.dataset.tab || b.id).join(','), sel);

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ()=>{
    // Permisos antiguos: "Venta Online" + "Solo Subir voucher" marcados a la vez (caso real) y sin clave de Rótulos.
    await usuariosRef.doc('yolanda@ejemplo.com').set({ email:'yolanda@ejemplo.com', alias:'YOLANDA', permisos:{ venta_online:true, vo_vouchers:true } });
    await usuariosRef.doc('antiguo@ejemplo.com').set({ email:'antiguo@ejemplo.com', alias:'ANTIGUO', permisos:{ campanas:true, merma:true } });
  });
  await page.click('#btn-menu'); await page.click('#tab-usuarios');
  await page.waitForFunction(()=> document.querySelectorAll('#us-lista .us-item').length === 3, null, { timeout: 10000 });
  const lista = await page.evaluate(()=> [...document.querySelectorAll('#us-lista .us-item')].map(b=> b.innerText.replace(/\s+/g, ' ').trim()));
  verificar(lista.some(t=> /ADMINISTRADOR.*Administrador/i.test(t)) && lista.some(t=> /YOLANDA .*Venta Online \(parcial\)/.test(t)) && lista.some(t=> /ANTIGUO .*Merma.*Campañas \(PDF\).*Rótulos PDF/.test(t)),
    `Lista de usuarios con lo que ve cada uno: ${lista.join(' | ')}`);
  const arbol = await page.evaluate(()=> [...document.querySelectorAll('#us-arbol .us-grupo')].map(g=> g.querySelector('.us-grupo-cab label').innerText.trim() + ': ' + [...g.querySelectorAll('[data-us-tab]')].map(cb=> cb.dataset.usTab).join(',')));
  verificar(arbol.join(' | ') === 'ALMACÉN: diseno,mov,pallets | PRODUCTOS E INVENTARIO: productos,inventario,toma_inventario,regfoto,kardex,merma | CAMPAÑAS: retiros,campanas,rotulos,ventaonline | ADMINISTRACIÓN: reportes,bitacora' ||
    /CAMPAÑAS: retiros,campanas,rotulos,ventaonline/i.test(arbol.join(' | ')), `Permisos ordenados como el menú: ${arbol.join(' | ')}`);
  const nSubs = await page.evaluate(()=> ['campanas','ventaonline','rotulos','merma'].map(t=> t + ':' + document.querySelectorAll(`[data-us-sub-de="${t}"]`).length).join(' '));
  verificar(nSubs === 'campanas:11 ventaonline:2 rotulos:2 merma:0', `Secciones por opción: ${nSubs}`);

  // Yolanda (permiso antiguo): al abrirla se ve solo Subir voucher y sin Rótulos.
  await page.click('#us-lista [data-us-email="yolanda@ejemplo.com"]');
  let f = await page.evaluate(()=> ({ vo: $('us-arbol').querySelector('[data-us-tab="ventaonline"]').checked, carg: $('us-arbol').querySelector('[data-us-sub="vosub-cargar"]').checked,
    vou: $('us-arbol').querySelector('[data-us-sub="vosub-vouchers"]').checked, rot: $('us-arbol').querySelector('[data-us-tab="rotulos"]').checked, res: $('us-resumen').innerText }));
  verificar(f.vo && !f.carg && f.vou && !f.rot && /Venta Online \(📎 Subir voucher\)/.test(f.res), `Permiso antiguo de Yolanda se entiende como solo Subir voucher: ${f.res}`);

  // Detalle: Campañas solo con Compras y Reparto vs Compra; Merma completa; sin eliminar.
  await page.click('#btn-us-nuevo');
  await page.fill('#us-email', 'detalle@ejemplo.com'); await page.fill('#us-alias', 'detalle');
  await page.check('[data-us-tab="campanas"]');
  verificar(await page.evaluate(()=> [...document.querySelectorAll('[data-us-sub-de="campanas"]')].every(x=> x.checked)), 'Al marcar una opción se marcan todas sus secciones');
  for(const id of ['campsub-cargar-campana','campsub-cargar-guia','campsub-regularizaciones','campsub-registros','campsub-buscar','campsub-analisis','campsub-validadores','campsub-vouchers','campsub-participantes'])
    await page.uncheck(`[data-us-sub="${id}"]`);
  await page.check('[data-us-tab="merma"]');
  const cuenta = await page.evaluate(()=> $('us-arbol').querySelector('[data-us-tab="campanas"]').closest('.us-tab').querySelector('.us-sub-cuenta').textContent);
  verificar(cuenta === '2 de 11 secciones', `Contador de secciones: ${cuenta}`);
  await page.locator('#view-usuarios').screenshot({ path: path.join(__dirname, 'salida', 'permisos.png') });
  await page.click('#btn-guardar-usuario');
  await page.waitForFunction(()=> /Permisos guardados/.test($('us-msg').textContent), null, { timeout: 10000 });
  let perm = await page.evaluate(async ()=> (await usuariosRef.doc('detalle@ejemplo.com').get()).data().permisos);
  verificar(perm.campanas && perm.merma && !perm.rotulos && !perm.eliminar && JSON.stringify(perm.subs) === '{"campanas":["campsub-compras","campsub-repcmp"]}', `Se guarda a detalle: ${JSON.stringify(perm.subs)}`);

  // Quitar todo un grupo y guardar: no quedan permisos viejos mezclados.
  await page.click('#us-lista [data-us-email="yolanda@ejemplo.com"]');
  await page.click('[data-us-plantilla="comercial"]');
  await page.click('#btn-guardar-usuario');
  await page.waitForFunction(()=> /Permisos guardados para yolanda/.test($('us-msg').textContent), null, { timeout: 10000 });
  perm = await page.evaluate(async ()=> (await usuariosRef.doc('yolanda@ejemplo.com').get()).data().permisos);
  verificar(perm.vo_vouchers === false && perm.venta_online === true && perm.rotulos === false && JSON.stringify(perm.subs) === '{"ventaonline":["vosub-vouchers"]}', 'Al guardar se reemplazan los permisos completos (sin restos del permiso antiguo)');
  // Recargar la página estando en Usuarios: la lista se carga sola (antes se quedaba en "Cargando…").
  await page.reload();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo' && $('view-usuarios').classList.contains('active'), null, { timeout: 20000 });
  const recarga = await page.waitForFunction(()=> document.querySelectorAll('#us-lista .us-item').length >= 3, null, { timeout: 10000 }).then(()=> true, ()=> false);
  verificar(recarga, 'Al recargar la página estando en Usuarios, la lista de usuarios se carga');
  // Celular: lista y editor son pantallas separadas.
  // Se recarga ya en tamaño celular (ahí los paneles arrancan plegados).
  await page.setViewportSize({ width: 390, height: 860 }); await page.reload();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo' && document.querySelectorAll('#us-lista .us-item').length >= 3, null, { timeout: 20000 });
  const vis = ()=> page.evaluate(()=> ({ lista: !!document.querySelector('.us-lista-panel').offsetParent, editor: !!document.querySelector('.us-editor').offsetParent && !!$('us-email').offsetParent && !!$('btn-guardar-usuario').offsetParent, ancho: document.documentElement.scrollWidth }));
  const m1 = await vis();
  await page.screenshot({ path: path.join(__dirname, 'salida', 'permisos_celular_lista.png') });
  await page.click('#us-lista [data-us-email="yolanda@ejemplo.com"]'); await page.waitForTimeout(200);
  const m2 = await vis(), tit = await page.textContent('#us-titulo');
  await page.screenshot({ path: path.join(__dirname, 'salida', 'permisos_celular_editor.png') });
  await page.click('#btn-us-volver'); await page.waitForTimeout(200);
  const m3 = await vis();
  await page.click('#btn-us-nuevo'); await page.waitForTimeout(200);
  const m4 = await vis();
  verificar(m1.lista && !m1.editor && !m2.lista && m2.editor && tit === 'YOLANDA' && m3.lista && !m3.editor && m4.editor && !m4.lista && Math.max(m1.ancho, m2.ancho) <= 390,
    'Celular: la lista ocupa la pantalla; tocar un usuario abre su editor y «← Usuarios» vuelve; «+ Nuevo» abre el editor; sin desplazarse a los lados');
  await page.setViewportSize({ width: 1440, height: 900 });
  // Eliminar usuario: el botón sale para otros usuarios (no para uno mismo) y borra su documento de permisos.
  await page.evaluate(async ()=>{ await usuariosRef.doc('borrar@ejemplo.com').set({ email:'borrar@ejemplo.com', alias:'BORRAR', permisos:{ campanas:true } }); await cargarUsuarios(); });
  await page.click('#us-lista [data-us-email="' + ADMIN.email + '"]');
  const propio = await page.evaluate(()=> $('btn-eliminar-usuario').hidden);
  await page.click('#btn-us-nuevo'); const nuevo = await page.evaluate(()=> $('btn-eliminar-usuario').hidden);
  await page.click('#us-lista [data-us-email="borrar@ejemplo.com"]');
  const otro = await page.evaluate(()=> !$('btn-eliminar-usuario').hidden);
  await page.click('#btn-eliminar-usuario');
  await page.waitForFunction(()=> /eliminado/.test($('us-msg').textContent), null, { timeout: 10000 });
  const borrado = await page.evaluate(async ()=> ({ doc: (await usuariosRef.doc('borrar@ejemplo.com').get()).exists, lista: !!document.querySelector('#us-lista [data-us-email="borrar@ejemplo.com"]'), msg: $('us-msg').textContent,
    log: (await movimientosRef.where('tipo', '==', 'usuario_eliminado').get()).size }));
  verificar(propio && nuevo && otro && !borrado.doc && !borrado.lista && borrado.log === 1,
    `Eliminar usuario: no sale para uno mismo ni en "Nuevo"; para otro sí; al eliminarlo se borra (${borrado.msg})`);
  await browser.close();

  // Entrar como cada usuario.
  const casos = [
    ['yolanda@ejemplo.com', 'ventaonline', '#view-ventaonline .subtabs button', 'vosub-vouchers'],
    ['detalle@ejemplo.com', 'merma,campanas', '#view-campanas .subtabs button', 'campsub-compras,campsub-repcmp'],
    ['antiguo@ejemplo.com', 'merma,campanas,rotulos', '#view-campanas .subtabs button', null],
  ];
  for(const [email, tabs, sel, subs] of casos){
    const u = await abrirApp({ usuario: { email, pass:'prueba123' } });
    await u.page.waitForTimeout(1500);
    await u.page.evaluate(t=> switchTab(t), sel.includes('ventaonline') ? 'ventaonline' : 'campanas');
    const menu = await u.page.evaluate(()=> [...document.querySelectorAll('nav.tabs button[data-tab]')].filter(b=> !b.classList.contains('hidden-perm')).map(b=> b.dataset.tab).join(','));
    const vs = await visibles(u.page, sel);
    verificar(menu === tabs && (subs === null ? vs.split(',').length === 11 : vs === subs), `${email}: menú ${menu} · secciones ${subs === null ? 'todas (' + vs.split(',').length + ')' : vs}`);
    if(email.startsWith('detalle')){
      const act = await u.page.evaluate(()=> ({ sub: document.querySelector('#view-campanas .subtabs button.active').id, grupos: [...document.querySelectorAll('#view-campanas .subgrupo')].filter(g=> !g.classList.contains('hidden-perm')).map(g=> g.querySelector('.subgrupo-t').innerText).join(',') }));
      verificar(act.sub === 'campsub-compras' && /^cargar,consultar$/i.test(act.grupos), `Abre directo en la primera sección permitida (${act.sub}); grupos visibles: ${act.grupos}`);
    }
    errores.push(...u.errores);
    await u.browser.close();
  }

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
