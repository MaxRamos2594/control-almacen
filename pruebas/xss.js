// Carga texto malicioso en todos los módulos y verifica que en ninguna
// pantalla se inserte como HTML real. Requiere los emuladores encendidos.
const { abrirApp, limpiarEmuladores, detectorXss } = require('./app');
const { cargarDatosEjemplo } = require('./datos');

const MALICIOSO = `<img src=x onerror="window.__xss=(window.__xss||0)+1">`;
const PESTANAS = ['diseno','mov','pallets','productos','inventario','toma_inventario','kardex','merma',
  'retiros','campanas','rotulos','reportes','bitacora','usuarios'];

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp({ scriptInicial: detectorXss });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await cargarDatosEjemplo(page, MALICIOSO);
  await page.reload();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  for(const t of PESTANAS){
    await page.evaluate(n => switchTab(n), t);
    await page.waitForTimeout(900);
  }
  await page.evaluate(()=> switchTab('mov'));
  await page.click('#slot-A01').catch(()=>{});
  await page.waitForTimeout(600);
  const r = await page.evaluate(()=> ({ ejecutado: window.__xss || 0, origen: [...new Set(window.__xssOrigen)] }));
  if(r.ejecutado || r.origen.length){
    console.log(`✗ Texto malicioso insertado como HTML (${r.ejecutado} ejecución(es)):\n  ` + r.origen.join('\n  '));
  } else console.log('✓ Ningún texto malicioso se insertó como HTML en las 14 pestañas ni en el panel de detalle.');
  await browser.close();
  process.exit(r.ejecutado || r.origen.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
