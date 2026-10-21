// Merma → PDF "RECEPCION DE TIENDAS": la sede va una sola vez en la cabecera
// (no hay columna SEDE) y la columna DESCRIPCION es más ancha.
// Requiere los emuladores encendidos (npm run emuladores).
const fs = require('fs');
const path = require('path');
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
  const r = await page.evaluate(async ()=>{
    const sede = 'CALLE SANTA FRANCISCA ROMANA 890, 890, LIMA, LIMA, LIMA, PERU';
    const filas = [['T8-30','A7 YS TUBO FLUO RECENTE/T8-30',1],['M161','AUDIFONO BLUT',2],['99YT-8730','CARGADOR PORTATIL - CARGA RAPIDA',1]]
      .map(([codigo, descripcion, cantidad], i)=> ({ nro: i + 1, sede, nro_guia:'TG07-00000178', codigo, descripcion, cantidad, total_unidades: cantidad, diferencia:'-', no_apta_venta:'', observacion:'MERMA' }));
    let base64 = '', anchoDesc = 0;
    const { jsPDF } = window.jspdf;
    const saveOrig = jsPDF.API.save;
    jsPDF.API.save = function(){ base64 = this.output('datauristring').split(',')[1]; anchoDesc = this.lastAutoTable.columns[3].width; };
    try{ generarPDFMerma({ correlativo:'FM-PRUEBA', sede, filas, fecha_texto:'martes, 20 de octubre de 2026' }); } finally { jsPDF.API.save = saveOrig; }
    const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(base64), c=> c.charCodeAt(0)) }).promise;
    const texto = (await (await pdf.getPage(1)).getTextContent()).items.map(i=> i.str).join(' ');
    return { base64, anchoDesc, texto };
  });
  fs.writeFileSync(path.join(__dirname, 'salida', 'merma_recepcion.pdf'), Buffer.from(r.base64, 'base64'));
  const vecesSede = (r.texto.match(/CALLE SANTA FRANCISCA ROMANA/g) || []).length;
  verificar(/\bSEDE\b/.test(r.texto) && vecesSede === 1, `La sede aparece una sola vez, en la cabecera (${vecesSede} vez)`);
  verificar(!/SEDE\s+N° GUIA/.test(r.texto) && /Nº\s+N° GUIA\s+CODIGO\s+DESCRIPCION\s+CNTD\./.test(r.texto), 'La tabla ya no tiene columna SEDE');
  verificar(r.anchoDesc > 50, `Columna DESCRIPCION más ancha: ${r.anchoDesc.toFixed(1)} mm`);

  if(errores.length) console.log('\nErrores de JavaScript:\n' + [...new Set(errores)].join('\n'));
  console.log(fallas || errores.length ? `\n${fallas} verificación(es) fallida(s).` : '\nTodo correcto.');
  await browser.close();
  process.exit(fallas || errores.length ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
