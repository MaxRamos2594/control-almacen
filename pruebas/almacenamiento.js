// Almacenamiento: en qué se gasta el espacio (archivos de Storage y base de datos), huérfanos y Excel.
// Requiere los emuladores encendidos (npm run emuladores).
const path = require('path');
const XLSX = require('xlsx');
const { abrirApp, limpiarEmuladores } = require('./app');

let fallas = 0;
function verificar(condicion, texto){
  console.log(`${condicion ? '✓' : '✗'} ${texto}`);
  if(!condicion) fallas++;
}

(async ()=>{
  await limpiarEmuladores();
  const { browser, page, errores } = await abrirApp();
  await page.waitForFunction(()=> $('status-text').textContent === 'Sincronizado en vivo', null, { timeout: 20000 });

  // Archivos de prueba: 4 en uso (por ruta o por URL de descarga) y 1 huérfano (RF-00002 ya no existe).
  await page.evaluate(async ()=>{
    const subir = (p, n, tipo)=> storage.ref().child(p).put(new Blob([new Uint8Array(n)], { type: tipo }), { contentType: tipo });
    await subir('registros_foto/RF-00001/pos_1.jpg', 30000, 'image/jpeg');
    await subir('registros_foto/RF-00001/p1_1.jpg', 20000, 'image/jpeg');
    await subir('registros_foto/RF-00002/pos_1.jpg', 10000, 'image/jpeg');
    await subir('vo_comprobantes/BV01-1_1.pdf', 50000, 'application/pdf');
    await subir('productos/P100.png', 5000, 'image/png');
    const url = await storage.ref().child('productos/P100.png').getDownloadURL();
    await registrosFotoRef.doc('RF-00001').set({ estado:'CONFIRMADO', posicion:'A01', foto_posicion:{ path:'registros_foto/RF-00001/pos_1.jpg' }, items:[{ sku:'P100', cantidad:1, fotos:[{ path:'registros_foto/RF-00001/p1_1.jpg' }] }] });
    await voComprobantesRef.doc('BV01-1').set({ nro:'BV01-1', archivos:[{ path:'vo_comprobantes/BV01-1_1.pdf' }] });
    await productosRef.doc('P100').set({ codigo:'P100', descripcion:'PELOTA', imagen_url: url });
    // Registros cuyo PDF no está: uno se borró y otro quedó en otro bucket.
    await voComprobantesRef.doc('BV01-2').set({ nro:'BV01-2', pdf_path:'vo_comprobantes/BV01-2_1.pdf' });
    await vouchersAgenciaItemsRef.doc('V1-G1').set({ voucher_correlativo:'V1', guia_correlativo:'G1', pdf_url:'https://firebasestorage.googleapis.com/v0/b/otro-bucket.appspot.com/o/vouchers_agencia%2FV1%2FG1%2Fguia.pdf?alt=media&token=x' });
  });

  // Solo administradores: no aparece en los permisos ni para usuarios sin "Administrador".
  const soloAdmin = await page.evaluate(()=> !permTabPermitida({ eliminar:true, reportes:true, bitacora:true }, 'almacenamiento') && permTabPermitida({ admin:true }, 'almacenamiento') && !PERM_TAB_CLAVE.almacenamiento);
  verificar(soloAdmin, 'Almacenamiento: solo para administradores (no se asigna como permiso)');
  await page.click('#btn-menu'); await page.click('#tab-almacenamiento');

  // Archivos.
  await page.click('#btn-alm-archivos');
  await page.waitForSelector('#alm-sec-modulos[style*="block"]', { timeout: 20000 });
  const cards = await page.evaluate(()=> $('alm-cards').innerText.replace(/\s+/g, ' '));
  verificar(/Archivos \(Storage\) 112\.3 KB 5 archivo\(s\)/i.test(cards) && /PDFs 48\.8 KB 1 archivo/i.test(cards) && /Imágenes 63\.5 KB 4 archivo/i.test(cards), `Resumen: ${cards}`);
  const mods = await page.evaluate(()=> [...document.querySelectorAll('#alm-modulos tr[data-alm-mod]')].map(t=> t.innerText.replace(/\s+/g, ' ').trim()));
  const vacios = await page.evaluate(()=> [...document.querySelectorAll('#alm-modulos tr.alm-vacio')].map(t=> t.cells[0].innerText.replace(/\s+/g, ' ').trim()));
  verificar(mods.length === 3 && vacios.length === 7 && vacios.some(t=> /Saldos · fotos de cajas/.test(t)) && vacios.some(t=> /vouchers de agencia vouchers_agencia\//.test(t)) && vacios.some(t=> /Venta Online · vouchers/.test(t)) && /^▸ Registro fotográfico registros_foto\/ 3 58\.6 KB 52 %$/.test(mods[0]) && /^▸ Venta Online · comprobantes vo_comprobantes\/ 1 48\.8 KB 43 %$/.test(mods[1]) && /Productos · imágenes/.test(mods[2]),
    `Por módulo, del más pesado al más liviano: ${mods.join(' | ')}; sin archivos: ${vacios.join(' | ')}`);
  const comprimido = await page.evaluate(()=> !document.querySelector('#alm-modulos .rf-rep-exp'));
  await page.click('#alm-modulos tr[data-alm-mod="registros_foto"]');
  const carps = await page.evaluate(()=> [...document.querySelectorAll('#alm-modulos .rf-rep-exp .alm-tabla')[0].querySelectorAll(':scope > tbody > tr')].map(t=> t.innerText.replace(/\s+/g, ' ').trim()));
  const pesadosMod = await page.evaluate(()=> [...document.querySelectorAll('#alm-modulos .rf-rep-exp [data-alm-ver]')].map(b=> b.dataset.almVer).join(','));
  verificar(comprimido && /^RF-00001 2 48\.8 KB 83 %$/.test(carps[0]) && /^RF-00002 1 9\.8 KB 17 %$/.test(carps[1]) && pesadosMod === 'registros_foto/RF-00001/pos_1.jpg,registros_foto/RF-00001/p1_1.jpg,registros_foto/RF-00002/pos_1.jpg',
    `Módulo comprimido; al tocarlo, sus carpetas (${carps.join(' | ')}) y sus archivos más pesados`);
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#alm-modulos [data-alm-ver="registros_foto/RF-00001/pos_1.jpg"]')]);
  await popup.waitForURL(/pos_1\.jpg/, { timeout: 10000 }).catch(()=>{});
  verificar(/registros_foto%2FRF-00001%2Fpos_1\.jpg/.test(popup.url()), '«👁 Ver» abre el archivo');
  await popup.close();
  await page.click('#alm-modulos [data-alm-ocultar]');
  const oculto = await page.evaluate(()=> !document.querySelector('#alm-modulos .rf-rep-exp'));
  await page.click('#alm-modulos tr[data-alm-mod="registros_foto"]'); await page.click('#alm-modulos tr[data-alm-mod="registros_foto"]');
  const oculto2 = await page.evaluate(()=> !document.querySelector('#alm-modulos .rf-rep-exp'));
  verificar(oculto && oculto2, 'Se comprime con «▴ Ocultar» o tocándolo otra vez');
  const tipos = await page.evaluate(()=> [...document.querySelectorAll('#alm-tipos tbody tr')].map(t=> t.cells[0].innerText + ' ' + t.cells[2].innerText).join(' | '));
  const pesados = await page.evaluate(()=> [...document.querySelectorAll('#alm-pesados [data-alm-ver]')].map(b=> b.dataset.almVer.split('/').pop()).join(','));
  const meses = await page.evaluate(()=> document.querySelectorAll('#alm-meses tbody tr').length);
  verificar(tipos === 'Imagen JPG 58.6 KB | PDF 48.8 KB | Imagen PNG 4.9 KB' && pesados === 'BV01-1_1.pdf,pos_1.jpg,p1_1.jpg,pos_1.jpg,P100.png' && meses === 1, `Por tipo (${tipos}), por mes y los más pesados (${pesados})`);

  // Base de datos y huérfanos.
  await page.click('#btn-alm-base');
  await page.waitForSelector('#alm-sec-huerfanos[style*="block"]', { timeout: 30000 });
  const base = await page.evaluate(()=>{ const f = c=> { const t = document.querySelector(`#alm-base [data-alm-col="${c}"]`); return t ? t.cells[1].innerText : '?'; };
    return { rf: f('registros_foto'), vo: f('vo_comprobantes'), prod: f('productos'), usuarios: f('usuarios'), errores: document.querySelectorAll('#alm-base .alm-error').length, filas: document.querySelectorAll('#alm-base tbody tr').length, vacias: ($('alm-vacias') || {}).textContent || '',
      total: document.querySelector('#alm-base tfoot').innerText.replace(/\s+/g, ' ') }; });
  verificar(base.rf === '1' && base.vo === '2' && base.prod === '1' && base.usuarios === '1' && base.errores === 0 && base.filas === 6 && /^Sin documentos \(34\): .*Kardex.*Pallets/.test(base.vacias) && /≈ [\d.]+ KB/.test(base.total),
    `Base de datos por colección: ${base.filas} con datos (sin errores; ${base.total}); vacías en una línea: ${base.vacias.slice(0, 60)}…`);
  const huerf = await page.evaluate(()=> ({ txt: $('alm-huerfanos').innerText.replace(/\s+/g, ' '), rutas: [...document.querySelectorAll('#alm-huerfanos [data-alm-ver]')].map(b=> b.dataset.almVer), boton: !!$('btn-alm-borrar-huerfanos') }));
  verificar(huerf.rutas.join() === 'registros_foto/RF-00002/pos_1.jpg' && !huerf.boton && /menos de 24 horas/.test(huerf.txt), `Huérfanos: ${huerf.rutas.join()} (recién subido: todavía no se ofrece borrarlo)`);
  const falt = await page.evaluate(()=> ({ aviso: document.querySelector('#alm-faltantes .alm-error').innerText, filas: [...document.querySelectorAll('#alm-faltantes .alm-tabla')[0].querySelectorAll(':scope > tbody > tr')].map(t=> t.innerText.replace(/\s+/g, ' ').trim()) }));
  verificar(/^⚠ 2 archivo\(s\)/.test(falt.aviso) && falt.filas.length === 2 && falt.filas.some(t=> /^Venta Online · comprobantes vo_comprobantes\/ Venta Online · comprobantes 1 No existe/.test(t)) && falt.filas.some(t=> /^Campañas · vouchers de agencia vouchers_agencia\/ Vouchers de agencia · ítems 1 En otro bucket: otro-bucket\.appspot\.com/.test(t)),
    `Registrados que no se encontraron: ${falt.filas.join(' | ')}`);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'almacenamiento.png'), fullPage: true });

  // Excel con todos los archivos (en uso o no) y la base de datos.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-alm-excel')]);
  const xl = path.join(__dirname, 'salida', 'almacenamiento.xlsx'); await dl.saveAs(xl);
  const wb = XLSX.readFile(xl), arch = XLSX.utils.sheet_to_json(wb.Sheets['Archivos']), bd = XLSX.utils.sheet_to_json(wb.Sheets['Base de datos']);
  verificar(arch.length === 5 && arch[0]['Ruta'] === 'vo_comprobantes/BV01-1_1.pdf' && arch[0]['Tamaño (bytes)'] === 50000 && arch.find(f=> f['Ruta'] === 'registros_foto/RF-00002/pos_1.jpg')['En uso'] === 'NO (huérfano)' && bd.some(r=> r['Colección'] === 'registros_foto' && r['Documentos'] === 1),
    `Excel: ${arch.length} archivos (${Object.keys(arch[0]).join(' | ')}) y ${bd.length} colecciones`);

  // Pasado el margen, el huérfano se puede eliminar (y queda en la bitácora).
  await page.evaluate(()=>{ ALM_MARGEN_HUERFANO_MS = 0; renderAlm(); });
  await page.click('#btn-alm-borrar-huerfanos');
  await page.waitForFunction(()=> /No hay archivos huérfanos/.test($('alm-huerfanos').innerText), null, { timeout: 15000 });
  const tras = await page.evaluate(async ()=> ({
    existe: await storage.ref().child('registros_foto/RF-00002/pos_1.jpg').getMetadata().then(()=> true, ()=> false),
    enUso: await storage.ref().child('registros_foto/RF-00001/pos_1.jpg').getMetadata().then(()=> true, ()=> false),
    log: (await movimientosRef.get()).docs.map(d=> d.data()).filter(d=> d.tipo === 'almacenamiento_huerfanos_eliminados').map(d=> d.detalle).join() }));
  verificar(!tras.existe && tras.enUso && /1 archivo\(s\) huérfano\(s\) eliminado\(s\) · 9\.8 KB liberados/.test(tras.log), `Eliminar huérfanos: borra solo el que no se usa; bitácora "${tras.log}"`);

  // Celular: entra en la pantalla.
  await page.setViewportSize({ width: 390, height: 860 });
  await page.click('#alm-modulos tr[data-alm-mod="registros_foto"]'); await page.waitForTimeout(200);
  const ancho = await page.evaluate(()=> document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(__dirname, 'salida', 'almacenamiento_celular.png'), fullPage: true });
  verificar(ancho <= 390, `Celular: entra en la pantalla (${ancho}px)`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(err=>{ console.error(err); process.exit(1); });
