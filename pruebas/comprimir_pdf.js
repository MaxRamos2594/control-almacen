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
  verificar(/^🗜 2 PDF\(s\) de más de 700\.0 KB sin comprimir/.test(caja), `Almacenamiento muestra los PDFs por comprimir (el ya comprimido al subir no cuenta): "${caja.slice(0, 70)}…"`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'comprimir_pdf.png'), fullPage: true });
  const arriba = await page.textContent('#btn-alm-comprimir');
  verificar(/^🗜 Comprimir 2 archivo\(s\) · 7\.9\d MB$/.test(arriba), `Atajo arriba, junto a «Analizar archivos»: "${arriba}"`);
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
    !fin.viejo && fin.huerfano && fin.arriba === '🗜 Todo comprimido' && fin.arribaOff && /Todos los PDFs/.test(fin.caja) && fin.path !== 'vouchers_agencia/VOU-00002/G2/1700000000000_guia.pdf' && /Campañas · vouchers de agencia: 1 PDF/.test(fin.log),
    `Comprimir PDFs: "${fin.msg}"; la guía usa el nuevo y el original se borró; el huérfano no se toca`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'comprimir_pdf_hecho.png'), fullPage: true });

  // 3) Fotos ya subidas (registro fotográfico y toma de inventario): se achican y se cambian en su registro.
  await page.evaluate(async ()=>{
    const foto = async p=>{
      const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1800; const ctx = cv.getContext('2d'), im = ctx.createImageData(cv.width, cv.height);
      for(let i = 0; i < im.data.length; i += 4){ const v = 90 + Math.random() * 140 | 0; im.data[i] = v; im.data[i+1] = v * 0.9; im.data[i+2] = v * 0.7; im.data[i+3] = 255; }
      ctx.putImageData(im, 0, 0);
      const blob = await new Promise(ok=> cv.toBlob(ok, 'image/jpeg', 0.95)), ref = storage.ref().child(p);
      await ref.put(blob, { contentType:'image/jpeg' });
      return { path: p, url: await ref.getDownloadURL(), tam: blob.size };
    };
    const f1 = await foto('registros_foto/RF-00001/pos_1.jpg'), f2 = await foto('registros_foto/RF-00001/p1_1.jpg'), f3 = await foto('registros_foto/RF-00002/pos_1.jpg'), f4 = await foto('tomas_inventario/TI-00001/pallet_CD0001_1.jpg');
    await registrosFotoRef.doc('RF-00001').set({ estado:'CONFIRMADO', posicion:'A01', foto_posicion: f1, items:[{ sku:'P100', cantidad:1, fotos:[f2] }], fecha_creacion: new Date().toISOString() });
    await registrosFotoRef.doc('RF-00002').set({ estado:'BORRADOR', posicion:'A02', foto_posicion: f3, items:[], fecha_creacion: new Date().toISOString() });
    window.fotosAntes = { f1, f2, f3, f4 };
  });
  // PDF firmado de la toma, subido antes del compresor (sin marca).
  await page.evaluate(async b64=>{
    const bytes = Uint8Array.from(atob(b64), c=> c.charCodeAt(0)), ref = storage.ref().child('tomas_inventario/TI-00001/1700000000000_firmado.pdf');
    await ref.put(new Blob([bytes], { type:'application/pdf' }), { contentType:'application/pdf' });
    const f5 = { path: ref.fullPath, url: await ref.getDownloadURL(), tam: bytes.length }; window.fotosAntes.f5 = f5;
    await inventarioTomasRef.doc('TI-00001').set({ correlativo:'TI-00001', imagenes:[{ pallet_codigo:'CD0001', url: window.fotosAntes.f4.url, nombre:'pallet.jpg' }], pdf_firmado_url: f5.url, pdf_firmado_nombre:'firmado.pdf' });
  }, pesadoB64);
  await page.click('#btn-alm-archivos');
  await page.waitForFunction(()=> /archivo\(s\) analizados/.test($('alm-msg').textContent), null, { timeout: 30000 });
  const arribaFotos = await page.textContent('#btn-alm-comprimir');
  await page.click('#alm-modulos tr[data-alm-mod="registros_foto"]');
  const cajaRf = await page.evaluate(()=> document.querySelector('#alm-modulos .alm-comprimir').innerText.replace(/\s+/g, ' '));
  verificar(/^🗜 Comprimir 6 archivo\(s\)/.test(arribaFotos) && /^🗜 3 foto\(s\) de más de 200\.0 KB sin comprimir .*Antes se analiza la base de datos/.test(cajaRf), `Fotos por comprimir: arriba "${arribaFotos}"; en el módulo "${cajaRf.slice(0, 60)}…"`);
  await page.click('#alm-modulos [data-alm-comprimir="registros_foto"]');
  await page.waitForFunction(()=> /foto\(s\) comprimido\(s\)/.test($('alm-msg').textContent), null, { timeout: 120000 });
  const rf = await page.evaluate(async ()=>{
    const a = window.fotosAntes, d1 = (await registrosFotoRef.doc('RF-00001').get()).data(), d2 = (await registrosFotoRef.doc('RF-00002').get()).data();
    const existe = p=> storage.ref().child(p).getMetadata().then(m=> Number(m.size), ()=> 0);
    return { msg: $('alm-msg').textContent, a, d1, d2, tamNuevo: await existe(d1.foto_posicion.path), urlOk: decodeURIComponent(d1.foto_posicion.url).includes(d1.foto_posicion.path),
      viejo1: await existe(a.f1.path), viejo2: await existe(a.f2.path), borrador: await existe(a.f3.path), item: d1.items[0].fotos[0] };
  });
  verificar(/^2 foto\(s\) comprimido\(s\): [\d.]+ MB → [\d.]+ (KB|MB) \(se liberaron [\d.]+ (KB|MB)\) · 1 en un registro que se está llenando o modificando\.$/.test(rf.msg) &&
    rf.d1.foto_posicion.path !== rf.a.f1.path && rf.urlOk && rf.tamNuevo === rf.d1.foto_posicion.tam && rf.tamNuevo < rf.a.f1.tam * 0.6 && rf.item.path !== rf.a.f2.path && rf.item.tam < rf.a.f2.tam &&
    !rf.viejo1 && !rf.viejo2 && rf.borrador && rf.d2.foto_posicion.path === rf.a.f3.path && rf.d1.items[0].sku === 'P100' && rf.d1.estado === 'CONFIRMADO',
    `Registro fotográfico: "${rf.msg}" (${(rf.a.f1.tam / 1024).toFixed(0)} KB → ${(rf.tamNuevo / 1024).toFixed(0)} KB por foto); el borrador no se toca`);
  await page.click('#alm-modulos tr[data-alm-mod="tomas_inventario"]');
  await page.click('#alm-modulos [data-alm-comprimir="tomas_inventario"]');
  await page.waitForFunction(()=> /^2 archivo\(s\) comprimido\(s\)/.test($('alm-msg').textContent), null, { timeout: 120000 });
  const ti = await page.evaluate(async ()=>{ const d = (await inventarioTomasRef.doc('TI-00001').get()).data(), a = window.fotosAntes.f4, b = window.fotosAntes.f5;
    const existe = p=> storage.ref().child(p).getMetadata().then(()=> true, ()=> false);
    return { msg: $('alm-msg').textContent, url: d.imagenes[0].url, pallet: d.imagenes[0].pallet_codigo, viejo: await existe(a.path), mismo: d.imagenes[0].url === a.url,
      pdf: decodeURIComponent(d.pdf_firmado_url), pdfViejo: await existe(b.path), pdfTam: Number((await vchRefDeUrl(d.pdf_firmado_url).getMetadata()).size), pdfAntes: b.tam }; });
  verificar(!ti.mismo && /pallet_CD0001_1_c\d+\.jpg/.test(decodeURIComponent(ti.url)) && ti.pallet === 'CD0001' && !ti.viejo &&
    /1700000000000_firmado_c\d+\.pdf/.test(ti.pdf) && !ti.pdfViejo && ti.pdfTam < ti.pdfAntes * 0.6,
    `Toma de inventario: foto del pallet y PDF firmado (${MB(ti.pdfAntes)} → ${MB(ti.pdfTam)}) comprimidos y cambiados en la toma: "${ti.msg}"`);

  // 4) Toma de inventario: el PDF firmado se comprime al subirlo y, al reemplazarlo, el anterior se borra.
  await page.evaluate(()=>{ tiRegAllCache = [{ correlativo:'TI-00002', pdf_firmado_url: null }]; tiSubidaCorrelativoActual = 'TI-00002'; return inventarioTomasRef.doc('TI-00002').set({ correlativo:'TI-00002' }); });
  await page.setInputFiles('#ti-pdf-input-global', { name:'acta firmada.pdf', mimeType:'application/pdf', buffer: pesado });
  await esperar(page, async ()=> !!(await inventarioTomasRef.doc('TI-00002').get()).data().pdf_firmado_url, null, 60000);
  const t1 = await page.evaluate(async ()=>{ const d = (await inventarioTomasRef.doc('TI-00002').get()).data(), ref = vchRefDeUrl(d.pdf_firmado_url), m = await ref.getMetadata();
    return { path: ref.fullPath, tam: Number(m.size), d, meta: m.customMetadata || {} }; });
  await page.evaluate(()=>{ tiSubidaCorrelativoActual = 'TI-00002'; });
  await page.setInputFiles('#ti-pdf-input-global', { name:'acta.pdf', mimeType:'application/pdf', buffer: liviano });
  await esperar(page, async ()=> (await inventarioTomasRef.doc('TI-00002').get()).data().pdf_firmado_nombre === 'acta.pdf', null, 30000);
  const t2 = await page.evaluate(async p=> ({ viejo: await storage.ref().child(p).getMetadata().then(()=> true, ()=> false),
    log: (await movimientosRef.get()).docs.map(x=> x.data()).filter(x=> x.tipo === 'toma_inventario_pdf_subido').map(x=> x.detalle).join(' | ') }), t1.path);
  verificar(t1.tam < pesado.length * 0.6 && t1.d.pdf_firmado_tam === t1.tam && t1.d.pdf_firmado_tam_original === pesado.length && t1.meta.comprimido === '1' && /^tomas_inventario\/TI-00002\/\d+_acta_firmada\.pdf$/.test(t1.path) &&
    !t2.viejo && /comprimido de [\d.]+ MB a [\d.]+ MB/.test(t2.log),
    `Toma de inventario: el PDF firmado se comprime al subir (${MB(pesado.length)} → ${MB(t1.tam)}) y al reemplazarlo se borra el anterior`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'comprimir_fotos.png'), fullPage: true });

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(err=>{ console.error(err); process.exit(1); });
