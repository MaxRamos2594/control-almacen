// Datos de ejemplo para las pruebas. Se escriben desde la página (como admin)
// para que pasen por las mismas reglas de seguridad que la app real.
// El texto incluye &, comillas y "<" a propósito, para verificar que se
// muestra tal cual en pantalla.
const T = `P&G "CAJA" 5 < 10 'X'`;

async function cargarDatosEjemplo(page, texto = T){
  await page.evaluate(async (T)=>{
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const hoy = firebase.firestore.Timestamp.now();
    const set = (ref, id, d)=> ref.doc(id).set(d);

    await set(bloquesRef, 'B1', { nombre: 'BLOQUE ' + T, creado_en: ts });
    await set(nichosRef, 'A', { bloque_id:'B1', orden:0, pos_visual:0, tipo:'solo_rack', niveles:2, creado_en: ts });
    for(const [cod, nivel, estado, pal] of [['A01','arriba','ocupado','CD0001'],['A02','arriba','vacio',null],['A03','abajo','vacio',null],['A04','abajo','vacio',null]])
      await set(posicionesRef, cod, { tipo:'rack', nicho:'A', bloque_id:'B1', nivel, estado, bloqueada:false, pallet_codigo:pal, actualizado: ts });
    await set(productosRef, 'P100', { descripcion:'PRODUCTO ' + T, costo:2.5, proveedor:'PROV ' + T, empaque1:null, empaque2:null, creado_en: ts });
    await set(palletsRef, 'CD0001', { items:[{producto:'P100', descripcion:'PRODUCTO ' + T, cantidad:10, costo:2.5}], posicion_actual:'A01', estado:'activo', creado_en: ts, actualizado: ts });
    await kardexRef.add({ producto:'P100', descripcion:'PRODUCTO ' + T, costo:2.5, cantidad:10, tipo:'ingreso', motivo:'MOTIVO ' + T, pallet_codigo:'CD0001', posicion:'A01', usuario:'USUARIO ' + T, timestamp: ts });
    await movimientosRef.add({ tipo:'ingreso', pallet_codigo:'CD0001', origen:null, destino:'A01', usuario:'USUARIO ' + T, detalle:'DETALLE ' + T, timestamp: ts });
    await set(validadoresMaestroRef, '12345678', { nombre:'VALIDADOR ' + T, foto_url:null });
    await retirosCampanaRef.add({ pallet_codigo:'CD0001', producto:'P100', descripcion:'PRODUCTO ' + T, costo:2.5, cantidad:1, usuario:'USUARIO ' + T, estado:'ACTIVO', timestamp: ts });

    const comun = { estado:'ACTIVO', usuario:'USUARIO ' + T, cargado_por:'USUARIO ' + T, generado_por:'USUARIO ' + T,
      fecha_carga: hoy, generado_en: hoy, fecha: hoy, timestamp: hoy };
    await set(campanaRegistrosRef, 'CAMP-0001', Object.assign({ correlativo:'CAMP-0001', campana:'CAMPAÑA ' + T, nombre:'CAMPAÑA ' + T, nombre_archivo:'archivo ' + T + '.pdf', total_filas:1, total_unidades:5 }, comun));
    await campanaItemsRef.add({ correlativo:'CAMP-0001', codigo:'1', campana:'CAMPAÑA ' + T, participante:'PARTICIPANTE ' + T, sku:'P100', producto:'PRODUCTO ' + T, area:'AREA ' + T, cantidad:5, desglose:'1+4', timestamp: hoy });
    await set(guiasRegistrosRef, 'GUIA-0001', Object.assign({ correlativo:'GUIA-0001', campana_correlativo:'CAMP-0001', nro_guia:'T001-' + T, participante:'PARTICIPANTE ' + T, punto_partida:'ORIGEN ' + T, punto_llegada:'DESTINO ' + T, fecha_traslado:'28/09/2026', total_items:1, total_unidades:5 }, comun));
    await guiaItemsRef.add({ correlativo_guia:'GUIA-0001', campana_correlativo:'CAMP-0001', item:1, codigo:'P100', descripcion:'PRODUCTO ' + T, unidad:'UND', cantidad:5 });
    await set(mermaGuiasRef, 'MER-0001', Object.assign({ correlativo:'MER-0001', nro_guia:'M001-' + T, sede:'SEDE ' + T, fecha_guia:'28/09/2026', total_items:1, total_unidades:3 }, comun));
    await mermaGuiaItemsRef.add({ correlativo_guia:'MER-0001', item:1, codigo:'P100', descripcion:'PRODUCTO ' + T, unidad:'UND', cantidad:3, bultos:1 });
    await set(inventarioTomasRef, 'TI-0001', Object.assign({ correlativo:'TI-0001', area:'AREA ' + T, proveedor_filtro:'PROV ' + T, total_items:1, total_lineas:1, estado:'GENERADA', imagenes:[], observaciones_pendientes:0, total_observaciones:0 }, comun));
  }, texto);
}

module.exports = { cargarDatosEjemplo, T };
