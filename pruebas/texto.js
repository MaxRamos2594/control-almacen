// Carga datos de ejemplo y guarda el texto visible de cada pestaña en
// pruebas/salida/texto-<etiqueta>.txt. Sirve para comparar el antes y el
// después de un cambio: node texto.js antes → cambio → node texto.js despues
// → diff salida/texto-antes.txt salida/texto-despues.txt
const fs = require('fs');
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');
const { cargarDatosEjemplo } = require('./datos');

const PESTANAS = ['diseno','mov','pallets','productos','inventario','toma_inventario','kardex','merma',
  'retiros','campanas','rotulos','reportes','bitacora','usuarios'];

(async ()=>{
  const etiqueta = process.argv[2] || 'actual';
  const salida = path.join(__dirname, 'salida');
  fs.mkdirSync(salida, { recursive: true });
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await cargarDatosEjemplo(page);
  // Recargar para que las listas que se leen una sola vez (campañas, merma…) tomen los datos.
  await page.reload();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  let texto = '';
  for(const t of PESTANAS){
    await page.evaluate(n => switchTab(n), t);
    await page.waitForTimeout(900);
    // Se abren los paneles colapsables para incluir todo su contenido.
    const contenido = await page.evaluate(n => {
      const v = document.getElementById('view-' + n);
      v.querySelectorAll('details').forEach(d => d.open = true);
      return v.innerText;
    }, t);
    texto += `\n===== ${t} =====\n` + contenido.replace(/\d{1,2}\/\d{1,2}\/\d{4},? \d{1,2}:\d{2}(:\d{2})?( ?[ap]\. ?m\.)?/g, '<FECHA>') + '\n';
  }
  // Panel de detalle de una posición ocupada
  await page.evaluate(()=> switchTab('mov'));
  await page.click('#slot-A01').catch(()=>{});
  await page.waitForTimeout(600);
  texto += '\n===== detalle A01 =====\n' + await page.evaluate(()=> $('detalle-content').innerText);
  const archivo = path.join(salida, `texto-${etiqueta}.txt`);
  fs.writeFileSync(archivo, texto);
  const muestra = (texto.match(/P&G "CAJA" 5 < 10 'X'/g) || []).length;
  console.log(`Guardado ${archivo} (${texto.length} caracteres; el texto de ejemplo aparece ${muestra} veces)`);
  if(errores.length) console.log('Errores:\n' + [...new Set(errores)].join('\n'));
  await browser.close();
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
