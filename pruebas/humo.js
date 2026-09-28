// Prueba de humo: entra como admin, abre cada pestaña, toma captura y
// reporta errores de JavaScript. Requiere los emuladores encendidos
// (npm run emuladores). Capturas en pruebas/salida/.
const fs = require('fs');
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');

const PESTANAS = ['diseno','mov','pallets','productos','inventario','toma_inventario','kardex','merma',
  'retiros','campanas','rotulos','reportes','bitacora','usuarios'];

(async ()=>{
  const salida = path.join(__dirname, 'salida');
  fs.mkdirSync(salida, { recursive: true });
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> document.getElementById('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 }).catch(()=>{});
  console.log('Estado:', await page.textContent('#status-text'), '| Usuario:', await page.textContent('#user-email-label'));
  for(const t of PESTANAS){
    const antes = errores.length;
    await page.evaluate(n => switchTab(n), t);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(salida, `${t}.png`) });
    console.log(`${errores.length > antes ? '✗' : '✓'} ${t}`);
  }
  console.log(errores.length ? '\nErrores:\n' + [...new Set(errores)].join('\n') : '\nSin errores de JavaScript.');
  await browser.close();
  process.exit(errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
