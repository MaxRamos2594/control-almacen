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

(async ()=>{
  const real = process.argv[2];
  const archivo = real || path.join(__dirname, 'salida', 'guia_prueba.pdf');
  let esperado = null;
  if(!real){ const g = guiaDePrueba(); fs.mkdirSync(path.dirname(archivo), { recursive: true }); fs.writeFileSync(archivo, g.buffer); esperado = g.esperado; }

  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(()=> switchTab('campanas'));
  await page.setInputFiles('#guia-pdf-input', archivo);
  await page.evaluate(()=> $('btn-procesar-guia').click());
  await page.waitForFunction(()=> !$('btn-procesar-guia').disabled && guiaBatch.length > 0, null, { timeout: 30000 });
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
  } else {
    verificar(r.n > 0, `Lee ítems del PDF real (${r.n})`);
  }

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
