// Compresor de PDFs: al subir el PDF de una guía de agencia y, en Almacenamiento, los PDFs ya subidos.
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}
// Espera a que una condición (que puede ser asíncrona) se cumpla en la página.
async function esperar(page, fn, arg, ms){
  const fin = Date.now() + ms;
  while(Date.now() < fin){ if(await page.evaluate(fn, arg)) return; await new Promise(r=> setTimeout(r, 500)); }
  throw new Error('Tiempo agotado esperando: ' + fn.toString().slice(0, 120));
}
const MB = b=> (b / 1048576).toFixed(2) + ' MB';

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });

  // Un PDF "escaneado" pesado (2 páginas de imagen con ruido) y uno liviano.
  await page.evaluate(()=>{
    window.pdfPesado = ()=>{
      const cv = document.createElement('canvas'); cv.width = 1800; cv.height = 2500; const ctx = cv.getContext('2d'), im = ctx.createImageData(cv.width, cv.height);
      for(let i = 0; i < im.data.length; i += 4){ const v = 120 + Math.random() * 120 | 0; im.data[i] = v; im.data[i+1] = v; im.data[i+2] = v; im.data[i+3] = 255; }
      ctx.putImageData(im, 0, 0); ctx.fillStyle = '#000'; ctx.font = 'bold 120px sans-serif'; ctx.fillText('GUIA T001-123', 200, 400);
      const jpg = cv.toDataURL('image/jpeg', 1);
      const pdf = new jspdf.jsPDF({ unit:'pt', format:'a4' }); pdf.addImage(jpg, 'JPEG', 0, 0, 595, 842); pdf.addPage(); pdf.addImage(jpg, 'JPEG', 0, 0, 595, 842);
      return pdf.output('blob');
    };
    window.pdfLiviano = ()=>{ const pdf = new jspdf.jsPDF(); pdf.text('Guia liviana', 20, 20); return pdf.output('blob'); };
  });
  const enBase64 = fn=> page.evaluate(async fn=>{ const b = await window[fn](); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for(let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s); }, fn);
  const pesado = Buffer.from(await enBase64('pdfPesado'), 'base64'), liviano = Buffer.from(await enBase64('pdfLiviano'), 'base64');

  // 1) Agencias: al subir, el PDF se comprime; al reemplazarlo, el anterior se borra.
  await page.evaluate(async ()=>{
    await vouchersAgenciaRef.doc('VOU-00001').set({ correlativo:'VOU-00001', campana_nombre:'CAMPAÑA X', guias:['G1'], cantidad_guias:1 });
    await vouchersAgenciaItemsRef.doc('VOU-00001_G1').set({ voucher_correlativo:'VOU-00001', guia_correlativo:'G1', nro_guia:'T001-123', bultos:2 });
    vchItemsCache = [{ id:'VOU-00001_G1', voucher_correlativo:'VOU-00001', guia_correlativo:'G1', nro_guia:'T001-123', bultos:2 }];
    vchSubidaItemIdActual = 'VOU-00001_G1';
  });
  await page.setInputFiles('#vch-pdf-input-global', { name:'guia escaneada.pdf', mimeType:'application/pdf', buffer: pesado });
  await esperar(page, async ()=> !!(await vouchersAgenciaItemsRef.doc('VOU-00001_G1').get()).data().pdf_url, null, 60000);
  const sub = await page.evaluate(async ()=>{
    const d = (await vouchersAgenciaItemsRef.doc('VOU-00001_G1').get()).data(), ref = vchRefDeUrl(d.pdf_url), m = await ref.getMetadata();
    return { d, path: ref.fullPath, tam: Number(m.size), meta: m.customMetadata || {}, tabla: $('vch-items-body').innerText.replace(/\s+/g, ' '), msg: $('vch-pdf-msg').textContent,
      log: (await movimientosRef.get()).docs.map(x=> x.data()).filter(x=> x.tipo === 'voucher_agencia_pdf_subido').map(x=> x.detalle).join() };
  });
  verificar(sub.tam < pesado.length * 0.6 && sub.d.pdf_tam === sub.tam && sub.d.pdf_tam_original === pesado.length && sub.meta.comprimido === '1' && /^vouchers_agencia\/VOU-00001\/G1\/\d+_guia_escaneada\.pdf$/.test(sub.path) &&
    /comprimido de [\d.]+ MB a [\d.]+ MB/.test(sub.msg) && /comprimido de/.test(sub.log) && /\(de [\d.]+ MB\)/.test(sub.tabla),
    `Agencias: el PDF se comprime al subir (${MB(pesado.length)} → ${MB(sub.tam)}), queda marcado y se ve en la tabla: "${sub.msg}"`);
  await page.evaluate(()=>{ vchSubidaItemIdActual = 'VOU-00001_G1'; });
  await page.setInputFiles('#vch-pdf-input-global', { name:'guia.pdf', mimeType:'application/pdf', buffer: liviano });
  await esperar(page, async ()=> (await vouchersAgenciaItemsRef.doc('VOU-00001_G1').get()).data().pdf_nombre === 'guia.pdf', null, 30000);
  const rep = await page.evaluate(async viejo=>{ const d = (await vouchersAgenciaItemsRef.doc('VOU-00001_G1').get()).data();
    return { viejoExiste: await storage.ref().child(viejo).getMetadata().then(()=> true, ()=> false), tam: d.pdf_tam, orig: d.pdf_tam_original }; }, sub.path);
  verificar(!rep.viejoExiste && rep.tam === liviano.length && rep.orig === liviano.length, 'Agencias: al reemplazar, el PDF anterior se borra; uno liviano se sube tal cual');

  // 2) Almacenamiento: PDFs ya subidos antes del compresor (sin marca) se comprimen y se reemplazan en su guía.
  const pesadoB64 = pesado.toString('base64');
  await page.evaluate(async b64=>{
    const bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0));
    const subir = async (voucher, guia)=>{ const p = `vouchers_agencia/${voucher}/${guia}/1700000000000_guia.pdf`, ref = storage.ref().child(p);
      await ref.put(new Blob([bytes], { type:'application/pdf' }), { contentType:'application/pdf' }); return ref.getDownloadURL(); };
    const url = await subir('VOU-00002', 'G2');
    await vouchersAgenciaItemsRef.doc('VOU-00002_G2').set({ voucher_correlativo:'VOU-00002', guia_correlativo:'G2', nro_guia:'T001-200', pdf_url: url, pdf_nombre:'guia.pdf' });
    await subir('VOU-00003', 'G3');   // sin guía que lo use (huérfano): no se toca
  }, pesadoB64);
  await page.click('#btn-menu'); await page.click('#tab-almacenamiento');
  await page.click('#btn-alm-archivos');
  await page.waitForSelector('#alm-sec-modulos[style*="block"]', { timeout: 20000 });
  await page.click('#alm-modulos tr[data-alm-mod="vouchers_agencia"]');
  const caja = await page.evaluate(()=> document.querySelector('#alm-modulos .alm-comprimir').innerText.replace(/\s+/g, ' '));
  verificar(/^🗜 2 PDF\(s\) de más de 0\.68 MB sin comprimir/.test(caja), `Almacenamiento muestra los PDFs por comprimir (el ya comprimido al subir no cuenta): "${caja.slice(0, 70)}…"`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'comprimir_pdf.png'), fullPage: true });
  const arriba = await page.textContent('#btn-alm-comprimir');
  verificar(/^🗜 Comprimir 2 PDF\(s\) · 7\.9\d MB$/.test(arriba), `Atajo arriba, junto a «Analizar archivos»: "${arriba}"`);
  await page.click('#btn-alm-comprimir');
  await page.waitForFunction(()=> /PDF\(s\) comprimido\(s\)/.test($('alm-msg').textContent), null, { timeout: 120000 });
  const fin = await page.evaluate(async ()=>{
    const d = (await vouchersAgenciaItemsRef.doc('VOU-00002_G2').get()).data(), ref = vchRefDeUrl(d.pdf_url), m = await ref.getMetadata();
    const existe = p=> storage.ref().child(p).getMetadata().then(()=> true, ()=> false);
    return { msg: $('alm-msg').textContent, path: ref.fullPath, tam: Number(m.size), meta: m.customMetadata || {}, d,
      viejo: await existe('vouchers_agencia/VOU-00002/G2/1700000000000_guia.pdf'), huerfano: await existe('vouchers_agencia/VOU-00003/G3/1700000000000_guia.pdf'),
      caja: document.querySelector('#alm-modulos .alm-comprimir').innerText.replace(/\s+/g, ' '),
      arriba: $('btn-alm-comprimir').textContent, arribaOff: $('btn-alm-comprimir').disabled,
      log: (await movimientosRef.get()).docs.map(x=> x.data()).filter(x=> x.tipo === 'almacenamiento_pdfs_comprimidos').map(x=> x.detalle).join() };
  });
  verificar(/^1 PDF\(s\) comprimido\(s\): [\d.]+ MB → [\d.]+ (KB|MB) \(se liberaron [\d.]+ MB\) · 1 sin guía/.test(fin.msg) && fin.tam < pesado.length * 0.6 && fin.d.pdf_tam === fin.tam && fin.d.pdf_tam_original === pesado.length && fin.meta.comprimido === '1' &&
    !fin.viejo && fin.huerfano && fin.arriba === '🗜 PDFs ya comprimidos' && fin.arribaOff && /Todos los PDFs/.test(fin.caja) && fin.path !== 'vouchers_agencia/VOU-00002/G2/1700000000000_guia.pdf' && /Campañas · vouchers de agencia: 1 PDF/.test(fin.log),
    `Comprimir PDFs: "${fin.msg}"; la guía usa el nuevo y el original se borró; el huérfano no se toca`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'comprimir_pdf_hecho.png'), fullPage: true });

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(err=>{ console.error(err); process.exit(1); });
