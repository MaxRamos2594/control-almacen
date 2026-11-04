// Asistente IA: herramientas que consultan los datos, permisos, conversación y errores.
// Gemini se simula (las pruebas no salen a internet): el chat simulado pide una herramienta
// y luego "redacta" la respuesta con lo que la herramienta devolvió.
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

  // Datos: un producto con una entrada y dos salidas, un pallet en una posición y acciones en la bitácora.
  await page.evaluate(async ()=>{
    const ts = s=> firebase.firestore.Timestamp.fromDate(new Date(s));
    await bloquesRef.doc('B1').set({ nombre:'BLOQUE A', orden:1 });
    await posicionesRef.doc('A03').set({ bloque_id:'B1', estado:'ocupado', pallet_codigo:'CD0005' });
    await palletsRef.doc('CD0005').set({ items:[{ producto:'17891', descripcion:'PELOTA ROJA', cantidad:40, costo:5 }] });
    await productosRef.doc(codigoADocId('17891')).set({ descripcion:'PELOTA ROJA', costo:5 });
    await kardexRef.add({ producto:'17891', descripcion:'PELOTA ROJA', cantidad:100, tipo:'ingreso', motivo:'Ingreso de pallet', pallet_codigo:'CD0005', posicion:'A03', usuario:'JUAN', timestamp: ts('2026-10-01T09:15:00') });
    await kardexRef.add({ producto:'17891', descripcion:'PELOTA ROJA', cantidad:20, tipo:'salida', motivo:'Retiro de campaña', pallet_codigo:'CD0005', posicion:'A03', usuario:'ANA', timestamp: ts('2026-10-15T16:40:00') });
    await kardexRef.add({ producto:'17891', descripcion:'PELOTA ROJA', cantidad:40, tipo:'salida', motivo:'Retiro de campaña', pallet_codigo:'CD0005', posicion:'A03', usuario:'ANA', timestamp: ts('2026-10-28T11:05:00') });
    await kardexRef.add({ producto:'55555', descripcion:'CAJA AZUL', cantidad:7, tipo:'salida', motivo:'Retiro', pallet_codigo:'CD0009', posicion:'A04', usuario:'LUIS', timestamp: ts('2026-10-28T12:00:00') });
    await movimientosRef.add({ tipo:'movimiento', pallet_codigo:'CD0005', origen:'A01', destino:'A03', detalle:'Movido de A01 a A03', usuario:'JUAN', timestamp: ts('2026-10-02T08:00:00') });
  });
  await page.waitForFunction(()=> !!pallets.CD0005 && !!posiciones.A03 && !!productos['17891'], null, { timeout: 10000 });

  // Herramientas (lo que Gemini recibe).
  const h = await page.evaluate(async ()=> ({
    mov: await asiEjecutar('movimientos_producto', { codigo:'17891', tipo:'salida' }),
    todos: await asiEjecutar('movimientos_producto', { codigo:'17891' }),
    nada: await asiEjecutar('movimientos_producto', { codigo:'00000' }),
    fecha: await asiEjecutar('movimientos_por_fecha', { desde:'2026-10-28', hasta:'2026-10-28', tipo:'salida' }),
    ubicar: await asiEjecutar('ubicar_producto', { codigo:'17891' }),
    buscar: await asiEjecutar('buscar_productos', { texto:'pelota' }),
    pallet: await asiEjecutar('info_pallet', { codigo:'cd0005' }),
    posicion: await asiEjecutar('info_posicion', { codigo:'A03' }),
    bit: await asiEjecutar('bitacora', { usuario:'juan' }),
    inventada: await asiEjecutar('borrar_todo', {}) }));
  verificar(h.mov.total_movimientos === 2 && h.mov.unidades_salidas === 60 && /^28\/10\/26/.test(h.mov.movimientos[0].fecha) && /^15\/10\/26/.test(h.mov.movimientos[1].fecha) && h.mov.movimientos[0].usuario === 'ANA' && h.mov.descripcion === 'PELOTA ROJA',
    `movimientos_producto 17891 (salidas): ${h.mov.movimientos.map(m=> m.fecha + ' ' + m.cantidad).join(' · ')}`);
  verificar(h.todos.total_movimientos === 3 && h.todos.unidades_ingresadas === 100 && h.nada.encontrado === false, 'movimientos_producto: todos los tipos y código inexistente');
  verificar(h.fecha.total_movimientos === 2 && h.fecha.por_producto[0].codigo === '17891' && h.fecha.por_producto[0].unidades === 40 && h.fecha.por_producto[1].codigo === '55555',
    `movimientos_por_fecha 28/10: ${h.fecha.por_producto.map(p=> p.codigo + '=' + p.unidades).join(', ')}`);
  verificar(h.ubicar.stock_total === 40 && h.ubicar.ubicaciones[0].pallet === 'CD0005' && h.ubicar.ubicaciones[0].posicion === 'A03' && h.ubicar.ubicaciones[0].bloque === 'BLOQUE A' && h.buscar.productos[0].codigo === '17891' && h.buscar.productos[0].stock === 40,
    'ubicar_producto y buscar_productos: CD0005 en A03 (BLOQUE A), stock 40');
  verificar(h.pallet.posicion === 'A03' && h.pallet.productos[0].cantidad === 40 && h.pallet.historial.length === 1 && h.posicion.pallet === 'CD0005' && h.bit.total === 1 && h.inventada.error,
    'info_pallet (con historial), info_posicion, bitácora por usuario; una herramienta que no existe se rechaza');

  // Permisos: un usuario que solo ve Venta Online no tiene herramientas del almacén.
  const perm = await page.evaluate(()=>{ const antes = currentPermisos; currentPermisos = { venta_online:true };
    const n1 = asiHerramientas().map(x=> x.name); currentPermisos = { kardex:true }; const n2 = asiHerramientas().map(x=> x.name); currentPermisos = antes; return { n1, n2 }; });
  const permAsi = await page.evaluate(()=> [permTabPermitida({ asistente:true }, 'asistente'), permTabPermitida({ kardex:true }, 'asistente'), [...document.querySelectorAll('#us-arbol [data-us-tab]')].length]);
  verificar(perm.n1.length === 0 && perm.n2.join() === 'movimientos_producto,movimientos_por_fecha,ubicar_producto,buscar_productos,info_pallet,info_posicion' && permAsi[0] && !permAsi[1],
    `Permisos: sin almacén → ninguna herramienta; solo Kardex → ${perm.n2.join(', ')}; el asistente se da como permiso aparte`);

  // Conversación con Gemini simulado: pide la herramienta y responde con su resultado.
  await page.evaluate(()=>{
    window.llamadasIA = [];
    asiCrearChat = async ()=>({
      async sendMessage(m){
        window.llamadasIA.push(m);
        if(typeof m === 'string') return { response: { functionCalls: ()=> [{ name:'movimientos_producto', args:{ codigo:'17891', tipo:'salida' } }], text: ()=> '' } };
        const r = m[0].functionResponse.response;
        return { response: { functionCalls: ()=> undefined, text: ()=> `El código **${r.codigo}** (${r.descripcion}) salió por última vez el **${r.movimientos[0].fecha}** (${r.movimientos[0].cantidad} und).\nAntes salió el ${r.movimientos[1].fecha}.` } };
      }
    });
  });
  await page.click('#btn-menu'); await page.click('#tab-asistente');
  const ejemplos = await page.evaluate(()=> document.querySelectorAll('#asi-ejemplos [data-asi-ejemplo]').length);
  await page.click('#asi-ejemplos [data-asi-ejemplo]');
  await page.waitForFunction(()=> document.querySelectorAll('#asi-chat .asi-msg.ia:not(.pensando)').length === 1, null, { timeout: 10000 });
  const conv = await page.evaluate(()=> ({ yo: document.querySelector('#asi-chat .asi-msg.yo').innerText, ia: document.querySelector('#asi-chat .asi-msg.ia .asi-burbuja').innerHTML,
    consultas: document.querySelector('#asi-chat .asi-consultas').innerText, enviados: window.llamadasIA.length, ejemplosOcultos: $('asi-ejemplos').style.display === 'none' }));
  verificar(ejemplos === 4 && conv.yo === '¿El código 17891 qué día salió?' && /<b>17891<\/b> \(PELOTA ROJA\) salió por última vez el <b>28\/10\/26/.test(conv.ia) && /<br>Antes salió el 15\/10\/26/.test(conv.ia) &&
    /Consultó: kardex del producto 17891/.test(conv.consultas) && conv.enviados === 2 && conv.ejemplosOcultos,
    `Pregunta de ejemplo → respuesta con negrita y la fecha del kardex: "${conv.consultas}"`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'asistente.png'), fullPage: true });

  // Texto malicioso en la respuesta: se muestra como texto.
  await page.evaluate(()=>{ window.xssIA = false; asiChat = { sendMessage: async ()=> ({ response: { functionCalls: ()=> undefined, text: ()=> '<img src=x onerror="window.xssIA=true"> **ok**' } }) }; });
  await page.fill('#asi-input', 'hola'); await page.press('#asi-input', 'Enter');
  await page.waitForFunction(()=> document.querySelectorAll('#asi-chat .asi-msg.ia:not(.pensando)').length === 2, null, { timeout: 10000 });
  const xss = await page.evaluate(()=> ({ xss: window.xssIA, img: !!document.querySelector('#asi-chat img'), txt: [...document.querySelectorAll('#asi-chat .asi-msg.ia .asi-burbuja')].pop().innerText }));
  verificar(!xss.xss && !xss.img && /<img src=x/.test(xss.txt), 'Un texto con HTML en la respuesta se muestra como texto (no se ejecuta)');

  // Si AI Logic no está activado, se explica qué hacer.
  await page.evaluate(()=>{ asiChat = null; asiCrearChat = async ()=>{ const e = new Error('Firebase AI Logic API has not been used in project or it is disabled'); e.code = 'AI/api-not-enabled'; throw e; }; });
  await page.fill('#asi-input', '¿Dónde está el 17891?'); await page.click('#btn-asi-enviar');
  await page.waitForFunction(()=> !!document.querySelector('#asi-chat .asi-msg.error'), null, { timeout: 10000 });
  const err = await page.evaluate(()=> document.querySelector('#asi-chat .asi-msg.error').innerText);
  verificar(/^Falta activar el servicio.*AI Logic.*Gemini Developer API.*Detalle técnico: AI\/api-not-enabled/s.test(err), `Sin AI Logic activado: "${err.slice(0, 90)}…"`);
  // Errores reales de Google: cada causa con su indicación y el detalle técnico.
  const causas = await page.evaluate(()=>{
    const url = 'https://firebasevertexai.googleapis.com/v1beta/projects/layout-e25cc/models/gemini-2.5-flash:generateContent';
    const e = (code, msg, extra)=> Object.assign(new Error(msg), { code, customData: extra });
    return [
      asiMensajeError(e('AI/fetch-error', `Error fetching from ${url}: [403 ] Requests to this API firebasevertexai.googleapis.com method google.firebase.vertexai.v1beta.GenerativeService.GenerateContent are blocked.`, { status: 403, errorDetails:[{ reason:'API_KEY_SERVICE_BLOCKED' }] })),
      asiMensajeError(e('AI/fetch-error', `Error fetching from ${url}: [403 ] Requests from referer https://maxramos2594.github.io/ are blocked.`, { status: 403, errorDetails:[{ reason:'API_KEY_HTTP_REFERRER_BLOCKED' }] })),
      asiMensajeError(e('AI/api-not-enabled', `Error fetching from ${url}: [403 ] Firebase AI Logic API has not been used in project 649129212982 before or it is disabled.`)),
      asiMensajeError(e('AI/fetch-error', `Error fetching from ${url}: [404 ] models/gemini-2.5-flash is not found for API version v1beta.`)),
      asiMensajeError(e('AI/fetch-error', `Error fetching from ${url}: [403 ] The caller does not have permission (PERMISSION_DENIED).`)) ].map(t=> t.split('\n')[0]);
  });
  verificar(/Restricciones de API.*Firebase AI Logic API/.test(causas[0]) && /Restricciones de aplicaciones/.test(causas[1]) && /^Falta activar/.test(causas[2]) && /no está disponible/.test(causas[3]) && /rechazó la consulta por permisos/.test(causas[4]),
    `Errores de Google bien explicados (clave restringida, referer, sin activar, modelo, permisos): ${causas.map(c=> c.slice(0, 40)).join(' | ')}`);
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data()).filter(d=> d.tipo === 'asistente_consulta').map(d=> d.detalle).join(' | '));
  verificar(/¿El código 17891 qué día salió\? \| hola|hola \| ¿El código 17891 qué día salió\?/.test(log), `Las preguntas respondidas quedan en la bitácora: ${log}`);

  // Nueva conversación y celular.
  await page.click('#btn-asi-nueva');
  const limpio = await page.evaluate(()=> !$('asi-chat').children.length && $('asi-ejemplos').style.display === '' && asiChat === null);
  await page.setViewportSize({ width: 390, height: 860 }); await page.waitForTimeout(200);
  const ancho = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'asistente_celular.png'), fullPage: true });
  verificar(limpio && ancho <= 390, `«Nueva conversación» limpia el chat; en celular entra en la pantalla (${ancho}px)`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(err=>{ console.error(err); process.exit(1); });
