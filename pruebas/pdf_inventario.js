// Genera el PDF de inventario con 30 productos (descripciones largas y foto)
// y verifica, página por página, que ninguna fila se parta: el código, toda
// su descripción y su foto quedan en la misma página. Guarda el PDF en
// pruebas/salida/inventario.pdf. Requiere los emuladores encendidos.
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
const TOTAL = 30;
// Largos distintos: filas de distinta altura, para que alguna no quepa al final de una página.
const DESCS = ['COMPRESORA DE AIRE • POTENCIA: 550W • VOLTAJE: 220/60 V/HZ • VELOCIDAD: 1400 R/MIN • TANQUE: 9 L • PRESION: 8 BAR • PESO: 14 KG',
  'VIBRADOR DE LOSETA + 02 UN BATERIA 48VOL + CARGADOR',
  'ESMERIL BLANCO /BATERIA: 400W • VOLTAGE:110/220V-50/60HZ • VELOCIDAD:2950/3450RPM • ACCESORIOS',
  'TALADRO PERCUTOR INALAMBRICO • BATERIA: 21V • 2 BATERIAS DE 4.0AH • CARGADOR RAPIDO • MANDRIL: 13MM • TORQUE: 60NM • VELOCIDAD: 0-450/0-1800 RPM • MALETIN • JUEGO DE 24 BROCAS Y PUNTAS • LUZ LED • EMPUÑADURA AUXILIAR • ACCESORIOS VARIOS',
  'SIERRA'];
const descripcion = i=> DESCS[(i*7) % DESCS.length];

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(async ({ TOTAL, descs })=>{
    // Fotos de prueba (vertical y horizontal) como data URL
    const foto = (w, h, color)=>{ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0,0,w,h); return c.toDataURL('image/png'); };
    const fotos = [foto(120, 160, '#c33'), foto(200, 120, '#3a3'), foto(150, 150, '#33c')];
    for(let i=1;i<=TOTAL;i++){
      const cod = 'JIN-' + String(i).padStart(2,'0');
      await productosRef.doc(cod).set({ descripcion: descs[i-1], costo: 100 + i, proveedor:'HERRAMIENTAS', imagen_url: fotos[i%3], empaque1:null, empaque2:null });
      await palletsRef.doc('CD' + String(i).padStart(4,'0')).set({ items:[{ producto: cod, descripcion: descs[i-1], cantidad: 10 + i, costo: 100 + i }], posicion_actual: null, estado:'activo' });
    }
  }, { TOTAL, descs: Array.from({length: TOTAL}, (_, k)=> descripcion(k+1)) });
  await page.waitForFunction(n=> Object.keys(pallets).length === n && Object.keys(productos).length === n, TOTAL, { timeout: 20000 });
  await page.evaluate(()=> switchTab('inventario'));
  await page.waitForTimeout(800);
  const [descarga] = await Promise.all([ page.waitForEvent('download', { timeout: 60000 }), page.click('#btn-exportar-inventario-pdf') ]);
  const archivo = path.join(__dirname, 'salida', 'inventario.pdf');
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  await descarga.saveAs(archivo);
  await browser.close();

  // Analizar el PDF
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(archivo)), disableWorker: true }).promise;
  const paginaDe = {}; // código → página
  const textoPorPagina = [], imagenesPorPagina = [];
  for(let p=1; p<=pdf.numPages; p++){
    const pg = await pdf.getPage(p);
    const tc = await pg.getTextContent();
    const texto = tc.items.map(t=> t.str).join(' ').replace(/\s+/g, ' ');
    textoPorPagina.push(texto);
    const ops = await pg.getOperatorList();
    imagenesPorPagina.push(ops.fnArray.filter(f=> f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject).length);
    for(const m of texto.matchAll(/JIN-\d\d/g)){ (paginaDe[m[0]] = paginaDe[m[0]] || new Set()).add(p); }
  }
  verificar(pdf.numPages > 1, `El PDF tiene ${pdf.numPages} páginas (hay saltos de página que probar)`);
  const codigos = Object.keys(paginaDe);
  verificar(codigos.length === TOTAL, `Aparecen los ${TOTAL} códigos (${codigos.length})`);
  // Cada código aparece en una sola página, y en esa página está su descripción completa
  const partidos = [];
  for(let i=1;i<=TOTAL;i++){
    const cod = 'JIN-' + String(i).padStart(2,'0');
    const pags = [...(paginaDe[cod] || [])];
    const desc = descripcion(i).replace(/\s+/g, ' ');
    // Palabras de la descripción: todas deben estar en la página del código
    const palabras = desc.split(' ').filter(w=> w.length > 3);
    const t = pags.length === 1 ? textoPorPagina[pags[0]-1].replace(/\s+/g,'') : '';
    const faltan = palabras.filter(w=> !t.includes(w.replace(/\s+/g,'')));
    if(pags.length !== 1 || faltan.length) partidos.push(`${cod} (páginas ${pags.join(',')}${faltan.length ? '; faltan: ' + faltan.slice(0,3).join(' ') : ''})`);
  }
  verificar(partidos.length === 0, partidos.length ? `Filas partidas: ${partidos.join(' | ')}` : 'Ninguna fila partida: cada código está con su descripción completa en la misma página');
  // Fotos: una por fila en cada página (+ el logo en la página 1), nunca pedazos sueltos
  const filasPorPagina = textoPorPagina.map(t=> (t.match(/JIN-\d\d/g) || []).length);
  const cuadran = imagenesPorPagina.every((n, i)=> n === filasPorPagina[i] + (i === 0 ? 1 : 0));
  verificar(cuadran, `Fotos por página = filas por página (+ logo en la 1): fotos ${imagenesPorPagina.join('/')} · filas ${filasPorPagina.join('/')}`);
  verificar(/TOTAL UNIDADES/.test(textoPorPagina[textoPorPagina.length-1]), 'Los totales van al final');

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
