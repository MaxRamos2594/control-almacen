// Campañas → Venta Online: cargar comprobantes de Agencia (boletas/facturas
// electrónicas en PDF) y, en "Subir voucher", el multibuscador, el detalle con
// visor de PDF y la carga de uno o varios vouchers por comprobante.
// Los comprobantes de prueba se generan aquí (sin datos reales).
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
// Comprobante con la misma disposición que los de Bizlinks (coordenadas desde abajo, como el PDF real).
function comprobante({ tipo, nro, nombre, docLabel, doc, fecha, items, total }){
  const pdf = new jsPDF({ unit:'pt', format:'a4' }), H = 842, Y = y=> H - y;
  pdf.setFontSize(8);
  pdf.text('EMPRESA DE PRUEBA SAC', 20, Y(691)); pdf.text('R.U.C.', 396, Y(799)); pdf.text('20000000001', 448, Y(799));
  pdf.text(tipo === 'FACTURA' ? 'FACTURA' : 'BOLETA DE VENTA', 392, Y(776)); pdf.text('ELECTRÓNICA', 409, Y(753)); pdf.text(nro, 408, Y(730));
  pdf.text(tipo === 'FACTURA' ? 'Razón Social:' : 'Nombre/Razón Social:', 20, Y(653)); pdf.text(nombre, 99, Y(653)); pdf.text(docLabel, 306, Y(653)); pdf.text(doc, 418, Y(653));
  pdf.text('Dirección:', 20, Y(638)); pdf.text('Fecha Emisión:', 306, Y(638)); pdf.text(fecha, 418, Y(638));
  pdf.text('Moneda:', 20, Y(623)); pdf.text('Sol', 99, Y(623));
  [['Ítem',24],['Código',56],['Descripción',162],['Und.',276],['Cantidad',305],['V. Unitario',358],['P. Unitario',418],['Descuento',472],['Valor Venta',526]].forEach(([t, x])=> pdf.text(t, x, Y(592)));
  let y = 573;
  items.forEach(([cod, desc, cant, tot], i)=>{ pdf.text(String(i + 1), 30, Y(y)); if(cod) pdf.text(cod, 49, Y(y)); pdf.text(desc, 95, Y(y)); pdf.text('NIU', 277, Y(y)); pdf.text(cant.toFixed(2), 330, Y(y)); pdf.text('0.00', 500, Y(y)); pdf.text(tot.toFixed(2), 556, Y(y)); y -= 13; });
  pdf.text('Op. Gravada', 284, Y(527)); pdf.text('S/', 452, Y(527)); pdf.text('1.00', 556, Y(527));
  pdf.text('Importe Total', 284, Y(449)); pdf.text('S/', 452, Y(449)); pdf.text(total, 556, Y(449));
  pdf.text(`Código Hash: X  20000000001-${nro}`, 20, Y(24));
  const f = path.join(__dirname, 'salida', nro + '.pdf'); fs.writeFileSync(f, Buffer.from(pdf.output('arraybuffer'))); return f;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });
  await page.evaluate(()=> switchTab('campanas'));
  const g = await page.evaluate(()=> [...document.querySelectorAll('#view-campanas .subgrupo')].map(x=> x.querySelector('.subgrupo-t').innerText + ':' + x.innerText.replace(/\s+/g, ' ')).pop());
  verificar(/VENTA ONLINE/i.test(g) && /Comprobantes Agencia/.test(g) && /Subir voucher/.test(g), `Apartado "Venta Online" con sus dos subapartados: ${g}`);

  const b1 = comprobante({ tipo:'BOLETA', nro:'BV01-00000721', nombre:'ANA PRUEBA TORRES', docLabel:'DNI:', doc:'12345678', fecha:'13/10/2026 03:56:27', total:'17.40',
    items: [['08SZ-60337','LUCES CON SENSORES',1,10.59],['0019','CINTA DOBLE CONTACTO/KB-9',1,3.31],['XDYH-0010','LUPA/2XDYH-0010',2,0.85]] });
  const f1 = comprobante({ tipo:'FACTURA', nro:'F001-00000045', nombre:'COMERCIAL EJEMPLO EIRL', docLabel:'RUC:', doc:'20999888777', fecha:'15/10/2026 10:00:00', total:'1,250.00',
    items: [['M161','AUDIFONO BLUT',10,1000]] });
  await page.click('#campsub-vo-cargar');
  await page.setInputFiles('#vo-pdf-input', [b1, f1]);
  await page.click('#btn-vo-procesar');
  await page.waitForFunction(()=> !$('btn-vo-procesar').disabled && $('vo-batch-wrap').style.display === 'block', null, { timeout: 30000 });
  const lote = await page.evaluate(()=> [...document.querySelectorAll('#vo-batch-body tr')].map(r=> [...r.cells].slice(1).map(c=> c.innerText.trim()).join('|')));
  verificar(lote[0] === 'BOLETA|BV01-00000721|13/10/2026 03:56:27|DNI 12345678|ANA PRUEBA TORRES|3|S/ 17.40|AGENCIA|✓ Listo para guardar', `Boleta leída: ${lote[0]}`);
  verificar(lote[1] === 'FACTURA|F001-00000045|15/10/2026 10:00:00|RUC 20999888777|COMERCIAL EJEMPLO EIRL|1|S/ 1,250.00|AGENCIA|✓ Listo para guardar', `Factura leída: ${lote[1]}`);
  await page.click('#btn-vo-guardar');
  await page.waitForFunction(()=> /Guardado! 2 comprobante/.test($('vo-msg').textContent), null, { timeout: 30000 });
  const bd = await page.evaluate(async ()=> (await voComprobantesRef.doc('BV01-00000721').get()).data());
  verificar(bd.canal === 'AGENCIA' && bd.fecha_emision === '2026-10-13' && bd.importe_total === 17.4 && bd.cant_codigos === 3 && bd.unidades === 4 && bd.items[2].codigo === 'XDYH-0010' && /^http/.test(bd.pdf_url),
    `Guardado con canal AGENCIA, fecha ${bd.fecha_emision}, ${bd.cant_codigos} códigos, importe ${bd.importe_total} y su PDF`);
  await page.setInputFiles('#vo-pdf-input', [b1]);
  await page.click('#btn-vo-procesar');
  await page.waitForFunction(()=> !$('btn-vo-procesar').disabled && $('vo-batch-wrap').style.display === 'block', null, { timeout: 30000 });
  verificar(/Ya está cargado \(BV01-00000721\)/.test(await page.textContent('#vo-batch-body')), 'Volver a subir el mismo comprobante avisa que ya está cargado');
  await page.locator('#campsub-panel-vo-cargar').screenshot({ path: path.join(__dirname, 'salida', 'vo_cargar.png') });

  // Subir voucher: multibuscador
  await page.click('#campsub-vo-vouchers');
  await page.waitForFunction(()=> document.querySelectorAll('#vo-res .vo-fila').length === 2, null, { timeout: 15000 });
  const buscar = async q=>{ await page.fill('#vo-q', q); await page.waitForTimeout(250); return page.evaluate(()=> [...document.querySelectorAll('#vo-res .vo-fila')].map(b=> b.dataset.voId).join(',')); };
  const casos = [['12345678','BV01-00000721'],['comercial','F001-00000045'],['lupa','BV01-00000721'],['m161','F001-00000045'],['17.40','BV01-00000721'],['1250','F001-00000045'],['15/10/2026','F001-00000045'],['agencia','F001-00000045,BV01-00000721'],['ana boleta','BV01-00000721']];
  const res = [];
  for(const [q, esp] of casos){ const r = await buscar(q); res.push(`${q}→${r}`); if(r !== esp) verificar(false, `Buscar "${q}": ${r} (esperado ${esp})`); }
  verificar(true, `Multibuscador por DNI, nombre, producto, código, importe, fecha, canal y varias palabras: ${res.join(' · ')}`);
  const marca = await page.evaluate(()=> [...document.querySelectorAll('#vo-res mark')].map(m=> m.textContent).join(','));
  verificar(/ANA/.test(marca), `Resalta lo buscado (${marca})`);
  await buscar('');
  await page.click('#vo-seg [data-vo-f="sin"]');
  verificar((await page.evaluate(()=> document.querySelectorAll('#vo-res .vo-fila').length)) === 2, 'Filtro "Sin voucher": los 2');

  // Teclado: ↓ abre el primero
  await page.focus('#vo-q'); await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=> !!document.querySelector('#vo-detalle .vo-visor'), null, { timeout: 5000 });
  let det = await page.evaluate(()=> ({ sel: voSel, iframe: (document.querySelector('#vo-detalle iframe') || {}).src || '', datos: $('vo-detalle').innerText }));
  verificar(det.sel === 'F001-00000045' && /^http/.test(det.iframe) && /COMERCIAL EJEMPLO EIRL/.test(det.datos) && /20999888777/.test(det.datos), `Con ↓ se abre el detalle con el visor del PDF del comprobante (${det.sel})`);

  // Subir 2 vouchers (PDF e imagen)
  const vpdf = path.join(__dirname, 'salida', 'voucher_prueba.pdf'); const vp = new jsPDF(); vp.text('VOUCHER DE PAGO 1250.00', 20, 20); fs.writeFileSync(vpdf, Buffer.from(vp.output('arraybuffer')));
  const vpng = path.join(__dirname, 'salida', 'voucher_prueba.png'); fs.writeFileSync(vpng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  await page.setInputFiles('#vo-voucher-input', [vpdf, vpng]);
  await page.waitForFunction(()=> (voLista.find(c=> c.id === 'F001-00000045').vouchers || []).length === 2 && !document.querySelector('#vo-subidas .vo-subiendo'), null, { timeout: 30000 });
  det = await page.evaluate(async ()=> ({ docs: [...document.querySelectorAll('#vo-detalle .vo-doc')].map(d=> d.innerText.replace(/[↗✕]/g, '').replace(/\s+/g, ' ').trim()).join(' | '), img: !!document.querySelector('#vo-detalle .vo-visor img'),
    bd: (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.map(v=> v.nombre).join(','), fila: document.querySelector('#vo-res [data-vo-id="F001-00000045"]') ? 1 : 0 }));
  verificar(det.bd === 'voucher_prueba.pdf,voucher_prueba.png' && /Comprobante \| 📄 voucher_prueba\.pdf \| 🖼 voucher_prueba\.png/.test(det.docs) && det.img, `2 vouchers subidos y visibles; se muestra el último (${det.docs})`);
  verificar(det.fila === 0, 'Con el filtro "Sin voucher", el que ya tiene voucher sale de la lista');
  await page.click('#vo-seg [data-vo-f="con"]');
  verificar(await buscar('voucher_prueba') === 'F001-00000045', 'Filtro "Con voucher" y búsqueda por nombre del voucher');
  await page.click('#vo-detalle [data-vo-doc="1"]');
  verificar(await page.evaluate(()=> /voucher/.test(decodeURIComponent((document.querySelector('#vo-detalle iframe') || {}).src || ''))), 'Clic en un voucher PDF lo muestra en el visor');
  await page.locator('#campsub-panel-vo-vouchers').screenshot({ path: path.join(__dirname, 'salida', 'vo_vouchers.png') });
  await page.click('#vo-detalle .vo-doc[data-vo-doc="2"] [data-vo-quitar]');
  await page.waitForFunction(()=> (voLista.find(c=> c.id === 'F001-00000045').vouchers || []).length === 1, null, { timeout: 10000 });
  verificar((await page.evaluate(async ()=> (await voComprobantesRef.doc('F001-00000045').get()).data().vouchers.length)) === 1, 'Quitar un voucher');
  const log = await page.evaluate(async ()=> (await movimientosRef.get()).docs.map(d=> d.data().tipo).filter(t=> /^vo_/.test(t)).sort().join(','));
  verificar(log === 'vo_comprobante_cargado,vo_comprobante_cargado,vo_voucher_quitado,vo_voucher_subido,vo_voucher_subido', `Bitácora: ${log}`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
