// Carga una guía de remisión en "Campañas (PDF) → Cargar Guía" y verifica que
// se lean sus datos e ítems. Por defecto genera una guía de prueba con el
// formato que trae tildes en el encabezado ("Ítem", "Código", "Vehículo") y el
// número de ítem 1 punto más arriba que el resto de la fila, como las guías
// reales de Bizlinks. Con un argumento usa ese PDF:
//   node guia_pdf.js /ruta/a/guia.pdf
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}

function guiaDePrueba(){
  const items = [];
  for(let i=1;i<=60;i++) items.push([String(i), i===2 ? '021503' : `99NS-${3800+i}`, i===2 ? 'AQUA ALOE VERA JABON EN BARRA' : `LUCES LED ${i}0 L`, 'NIU', (i*2).toFixed(2)]);
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const encabezado = (y)=>{ doc.setFontSize(8); [['Ítem',24],['Código',78],['Descripción',242],['Unidad',422],['Cantidad',513]].forEach(([t,x])=> doc.text(t, x, y)); };
  doc.setFontSize(12); doc.text('GUÍA DE REMISIÓN', 393, 60); doc.text('TG01-00009999', 409, 125);
  doc.setFontSize(8);
  doc.text('Fecha Traslado:', 306, 200); doc.text('03/10/2026', 431, 200);
  doc.text('Punto de Partida:', 20, 213); doc.text('CALLE PRUEBA 123, LIMA', 110, 213);
  doc.text('Punto de Llegada:', 306, 213); doc.text('URB. SOL DE VITARTE, ATE', 431, 213);
  let y = 300; encabezado(y);
  items.forEach(([n, cod, desc, und, cant])=>{
    y += 13;
    if(y > 800){ doc.addPage(); y = 42; encabezado(y); y += 13; }
    doc.text(n, 30, y - 1);              // el número de ítem va 1 pt más arriba
    doc.text(cod, 78, y); doc.text(desc, 138, y); doc.text(und, 428, y); doc.text(cant, 556, y);
  });
  doc.addPage();
  doc.text('Datos del Vehículo y Conductor', 20, 100);
  doc.text('Se traslada 155 cantidad de bultos. Traslado de prueba', 23, 130);
  return { buffer: Buffer.from(doc.output('arraybuffer')), esperado: { nro_guia:'TG01-00009999', items: 60, bultos: 155, fecha:'03/10/2026', primero: '99NS-3801', segundo: '021503' } };
}

// Guía con el formato de SUNAT: encabezado de varias líneas, código 1 pt más
// arriba que la fila, "Observaciones: N BULTOS" y el ítem 30 partido entre
// páginas (se repite arriba de la página 2 sin descripción).
function guiaSunatDePrueba(){
  const doc = new jsPDF({ unit:'pt', format:[842, 1191] });
  const H = 1191, Y = y=> H - y; // coordenadas como en el PDF real (desde abajo)
  doc.setFontSize(8);
  doc.text('GUÍA DE REMISIÓN ELECTRÓNICA', 554, Y(1098)); doc.text('N° EG07 - 00000099', 599, Y(1070));
  doc.text('Fecha de entrega de Bienes al transportista:', 14, Y(991)); doc.text('06/10/2026', 228, Y(991));
  doc.text('Punto de Partida', 382, Y(991)); doc.text('CAL. SANTA FRANCISCA NRO. 890', 469, Y(991)); doc.text('- LIMA - LIMA - LIMA', 469, Y(979));
  doc.text('Punto de llegada', 382, Y(940)); doc.text('AV. GIRALDEZ NRO. 354 - HUANCAYO - JUNIN', 469, Y(940));
  doc.text('Bienes por transportar:', 14, Y(887));
  const cab = (y0)=>{ [['Bien',59,y0],['Código de',109,y0-6],['Partida',247,y0-6],['N°',17,y0-11],['normalizado',42,y0-11],['producto',174,y0-11],['Descripción Detallada',454,y0-11],['Cantidad',727,y0-11],['Unidad de',656,y0-6]].forEach(([t,x,y])=> doc.text(t, x, Y(y))); };
  cab(856);
  const fila = (n, y, cod, desc, cant)=>{ doc.text(String(n), 21, Y(y)); doc.text('NO', 64, Y(y)); if(cod) doc.text(cod, 112, Y(y+1)); if(desc) doc.text(desc, 358, Y(y)); doc.text('UNIDAD (NIU)', 656, Y(y)); doc.text(cant, 764, Y(y)); };
  let y = 823;
  for(let n=1;n<=30;n++){ fila(n, y, n===4 ? '1311' : `06X-${1900+n}`, n===2 ? 'Cinta métrica suave de 30 cm' : `PRODUCTO ${n}`, (n*3).toFixed(2)); y -= 18; }
  doc.addPage([842, 1191]); doc.setFontSize(8);
  cab(1120);
  fila(30, 1087, '06X-1930', '', '90.00');               // ítem 30 repetido sin descripción
  y = 1069;
  for(let n=31;n<=35;n++){ fila(n, y, `06X-${1900+n}`, `PRODUCTO ${n}`, (n*3).toFixed(2)); y -= 18; }
  doc.text('Observaciones :', 14, Y(571)); doc.text('11 BULTOS', 95, Y(571));
  return { buffer: Buffer.from(doc.output('arraybuffer')), esperado: { nro_guia:'EG07-00000099', items: 35, bultos: 11, fecha:'06/10/2026', primero:'06X-1901', segundo:'06X-1902' } };
}

(async ()=>{
  const real = process.argv[2] && process.argv[2] !== '--sunat' ? process.argv[2] : null;
  const sunat = process.argv.includes('--sunat');
  const archivo = real || path.join(__dirname, 'salida', sunat ? 'guia_sunat_prueba.pdf' : 'guia_prueba.pdf');
  let esperado = null;
  if(!real){ const g = sunat ? guiaSunatDePrueba() : guiaDePrueba(); fs.mkdirSync(path.dirname(archivo), { recursive: true }); fs.writeFileSync(archivo, g.buffer); esperado = g.esperado; }

  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  // Modo normal: 3 campañas activas con red lenta simulada (7 s por descarga)
  // para ver el aviso de avance, que no se oculte a los 5 s y que las
  // descargas vayan en paralelo.
  const conAvance = !real && !sunat;
  if(conAvance) await page.evaluate(async ()=>{
    const hoy = firebase.firestore.Timestamp.now();
    for(const [corr, skus] of [['CAMP-0001',['99NS-3801','99NS-3802','021503']], ['CAMP-0002',['OTRO-1']], ['CAMP-0003',['OTRO-2']]]){
      await campanaRegistrosRef.doc(corr).set({ correlativo:corr, campana:'CAMP '+corr, estado:'ACTIVO', fecha_carga: hoy, total_filas: skus.length });
      for(const sku of skus) await campanaItemsRef.doc().set({ correlativo: corr, participante:'ATE', sku, cantidad:1 });
    }
    campRegAllCache = []; campRegCache = {};
    const whereOrig = campanaItemsRef.where.bind(campanaItemsRef);
    window.__tramos = [];
    campanaItemsRef.where = (...args)=>{ const q = whereOrig(...args);
      const envolver = (qq)=> new Proxy(qq, { get(t, prop){ if(prop==='get') return async (...a)=>{ const ini = performance.now(); await new Promise(r=> setTimeout(r, 7000)); const res = await t.get(...a); window.__tramos.push([ini, performance.now()]); return res; };
        if(prop==='limit' || prop==='where' || prop==='orderBy') return (...a)=> envolver(t[prop](...a)); const v = t[prop]; return typeof v === 'function' ? v.bind(t) : v; } });
      return envolver(q); };
    // Registra cada texto del aviso y si estaba visible
    window.__avisos = [];
    const el = $('guia-msg');
    new MutationObserver(()=> window.__avisos.push(el.innerText)).observe(el, { childList:true, characterData:true, subtree:true });
  });
  await page.evaluate(()=> switchTab('campanas'));
  await page.setInputFiles('#guia-pdf-input', archivo);
  const t0 = Date.now();
  await page.evaluate(()=> $('btn-procesar-guia').click());
  if(conAvance){
    await page.waitForTimeout(6000);
    const a = await page.evaluate(()=> ({ visible: getComputedStyle($('guia-msg')).display !== 'none', txt: $('guia-msg').innerText, giro: !!document.querySelector('#guia-msg .giro') }));
    verificar(a.visible && /^Procesando/.test(a.txt) && a.giro, `A los 6 s el aviso sigue visible: "${a.txt}"`);
  }
  await page.waitForFunction(()=> !$('btn-procesar-guia').disabled && guiaBatch.length > 0, null, { timeout: 30000 });
  if(conAvance){
    const ms = Date.now() - t0;
    const info = await page.evaluate(()=> ({ avisos: window.__avisos, tramos: window.__tramos, sug: guiaBatch[0].correlativoSugerido, fin: $('guia-msg').innerText }));
    verificar(info.avisos.some(t=> /página 1 de 3/.test(t)) && info.avisos.some(t=> /página 3 de 3/.test(t)), 'Muestra la página que está leyendo (1 de 3 … 3 de 3)');
    verificar(info.avisos.some(t=> /campañas activas: 0 de 3/.test(t)) && info.avisos.some(t=> /campañas activas: 3 de 3/.test(t)) && info.avisos.some(t=> /\d+ s$/.test(t)), 'Muestra el avance "X de 3 campañas" y los segundos que lleva');
    const ini = info.tramos.map(t=> t[0]).sort((x,y)=> x-y);
    verificar(info.tramos.length === 3 && ini[2] - ini[0] < 1000 && ms < 12000, `Descarga las 3 campañas en paralelo (total ${ms} ms en vez de 21 s+)`);
    verificar(info.sug === 'CAMP-0001' && /^Se procesaron 1 archivo/.test(info.fin), `Sugiere la campaña correcta (${info.sug}) y termina con "${info.fin}"`);
  }
  const r = await page.evaluate(()=> guiaBatch.map(g=> ({ error: g.error || null, nro: g.resultado && g.resultado.nro_guia, fecha: g.resultado && g.resultado.fecha_traslado,
    bultos: g.resultado && g.resultado.bultos, llegada: g.resultado && g.resultado.punto_llegada, n: g.resultado ? g.resultado.items.length : 0,
    items: g.resultado ? g.resultado.items.map(i=> [i.item, i.codigo, i.descripcion, i.cantidad]) : [] }))[0]);
  verificar(!r.error, `Sin error al procesar (${r.error || 'ok'})`);
  console.log(`  Guía ${r.nro} · traslado ${r.fecha} · ${r.bultos} bultos · ${r.n} ítems · llegada: ${r.llegada}`);
  if(r.n) console.log(`  Primer ítem: ${JSON.stringify(r.items[0])} · último: ${JSON.stringify(r.items[r.n-1])}`);
  const numeros = r.items.map(i=> i[0]);
  verificar(numeros.every((n, k)=> n === k+1), `Ítems numerados 1…${r.n} sin saltos ni repetidos`);
  if(esperado){
    verificar(r.nro === esperado.nro_guia && r.fecha === esperado.fecha && r.bultos === esperado.bultos, 'N° de guía, fecha de traslado y bultos correctos');
    verificar(r.n === esperado.items && r.items[0][1] === esperado.primero && r.items[1][1] === esperado.segundo, `Lee los ${esperado.items} ítems de todas las páginas con su código`);
    if(sunat){
      const i30 = r.items.find(i=> i[0]===30) || [];
      verificar(i30[2] === 'PRODUCTO 30' && i30[3] === 90 && r.items.filter(i=> i[0]===30).length === 1, `Ítem 30 partido entre páginas: una sola vez, con descripción y cantidad 90 (${JSON.stringify(i30)})`);
      verificar(r.items[1][2] === 'CINTA MÉTRICA SUAVE DE 30 CM' && r.items[3][1] === '1311', 'Descripción en mayúsculas y código corto (1311) bien leídos');
      verificar(/HUANCAYO/.test(r.llegada), `Punto de llegada: ${r.llegada}`);
    }
  } else {
    verificar(r.n > 0, `Lee ítems del PDF real (${r.n})`);
  }

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
