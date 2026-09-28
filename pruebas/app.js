// Abre index.html en Chromium conectado a los emuladores de Firebase (nunca a
// la base real). Las librerías que la app carga desde CDN se sirven desde
// node_modules, así funciona aunque no haya salida a internet.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const RAIZ = path.join(__dirname, '..');
const NM = path.join(__dirname, 'node_modules');
const ORIGEN = 'http://127.0.0.1:5055';
const PROYECTO = 'demo-almacen';
const ADMIN = { email: 'mramos@corporaciongrit.com', pass: 'prueba123' };

const LIBRERIAS = {
  'firebase-app-compat.js': 'firebase/firebase-app-compat.js',
  'firebase-firestore-compat.js': 'firebase/firebase-firestore-compat.js',
  'firebase-auth-compat.js': 'firebase/firebase-auth-compat.js',
  'firebase-storage-compat.js': 'firebase/firebase-storage-compat.js',
  'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js',
  'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js',
  'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
  'pdf.min.js': 'pdfjs-dist/build/pdf.min.js',
  'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js',
};

// Solo para pruebas: conecta la app a los emuladores justo después de iniciar Firebase.
function htmlDePrueba(){
  let html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const init = 'firebase.initializeApp(firebaseConfig);';
  if(!html.includes(init)) throw new Error('No se encontró firebase.initializeApp en index.html');
  html = html.replace(init,
    `firebaseConfig.projectId = '${PROYECTO}'; firebaseConfig.storageBucket = '${PROYECTO}.appspot.com';\n` + init +
    `\nfirebase.firestore().useEmulator('127.0.0.1', 8080);` +
    `\nfirebase.auth().useEmulator('http://127.0.0.1:9099', {disableWarnings:true});` +
    `\nfirebase.storage().useEmulator('127.0.0.1', 9199);`);
  html = html.replace(/https:\/\/(www\.gstatic\.com\/firebasejs\/[^"']+|cdnjs\.cloudflare\.com\/ajax\/libs\/[^"']+)/g,
    m => '/lib/' + path.basename(m));
  return html;
}

async function crearUsuarioAuth(email, pass){
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ email, password: pass, returnSecureToken: true })
  });
  const d = await r.json();
  if(d.error && d.error.message !== 'EMAIL_EXISTS') throw new Error('Auth: ' + d.error.message);
}

async function limpiarEmuladores(){
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
}

// Servidor local: entrega index.html (conectado a emuladores) y las librerías
// que la app pide a los CDN, reescritas a rutas /lib/.
let servidor = null;
function iniciarServidor(){
  if(servidor) return servidor;
  servidor = new Promise(ok=>{
    const srv = http.createServer((req, res)=>{
      const u = new URL(req.url, ORIGEN);
      if(u.pathname === '/' || u.pathname === '/index.html'){
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); return res.end(htmlDePrueba());
      }
      const archivo = u.pathname.startsWith('/lib/') && LIBRERIAS[path.basename(u.pathname)];
      if(archivo){ res.writeHead(200, {'Content-Type': 'application/javascript'}); return res.end(fs.readFileSync(path.join(NM, archivo))); }
      res.writeHead(404); res.end();
    });
    srv.listen(5055, '127.0.0.1', ()=> ok(srv));
  });
  return servidor;
}

async function abrirApp({ usuario = ADMIN, headless = true, scriptInicial = null } = {}){
  await iniciarServidor();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless,
    // Sin proxy: todo lo que la app necesita está en 127.0.0.1; lo externo
    // (fuentes, IP pública) simplemente falla sin afectar la prueba.
    args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
  const errores = [];
  if(scriptInicial) await context.addInitScript(scriptInicial);
  const page = await context.newPage();
  page.on('pageerror', e => errores.push('Error JS: ' + e.message));
  // Recursos externos (fuentes de Google, IP pública) no cargan sin internet: se ignoran.
  page.on('console', m => { if(m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push('Consola: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if(r.status() >= 400 && r.url().startsWith(ORIGEN) && !r.url().endsWith('/favicon.ico')) errores.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('dialog', d => d.accept());
  page.on('requestfailed', r => { if(r.url().startsWith(ORIGEN)) errores.push('Falló: ' + r.url()); });

  await crearUsuarioAuth(usuario.email, usuario.pass);
  await page.goto(ORIGEN + '/');
  await page.fill('#login-email', usuario.email);
  await page.fill('#login-pass', usuario.pass);
  await page.click('#login-btn');
  try{ await page.waitForSelector('#app-shell', { state: 'visible', timeout: 20000 }); }
  catch(e){
    const msg = await page.textContent('#login-msg').catch(()=> '');
    const estado = await page.evaluate(()=>({ user: auth.currentUser && auth.currentUser.email, toasts: document.getElementById('toast-container').innerText })).catch(e=>String(e));
    errores.push('Estado: ' + JSON.stringify(estado));
    await browser.close();
    throw new Error(`No se pudo entrar. Mensaje: "${msg}"\n` + errores.join('\n'));
  }
  return { browser, context, page, errores };
}

// Detector de XSS para pruebas: registra desde qué función se crea de verdad
// un elemento <img src="x"> (el texto malicioso de las pruebas) en la página.
function detectorXss(){
  window.__xssOrigen = [];
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { set(v){
    d.set.call(this, v);
    if(typeof v === 'string' && /<img src=x/i.test(v) && this.querySelector('img[src="x" i]'))
      window.__xssOrigen.push((new Error().stack || '').split('\n').slice(2,4).join(' / ').replace(/https?:\/\/[^)]+:(\d+):\d+/g, 'línea $1'));
  }, get(){ return d.get.call(this); } });
}

module.exports = { detectorXss, abrirApp, crearUsuarioAuth, limpiarEmuladores, ADMIN, PROYECTO };
