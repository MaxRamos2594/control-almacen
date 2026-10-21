# Pruebas automáticas

Corren la app completa (`index.html`) en un navegador automatizado conectada a
los **emuladores de Firebase**: login, base de datos y archivos locales,
vacíos en cada prueba. Nunca tocan la base de datos real. Usan las mismas
reglas de seguridad (`../firestore.rules`, `../storage.rules`) que producción.

## Requisitos

Node.js 18+, Java 11+ y Chromium (Playwright). Una sola vez:

```bash
cd pruebas
npm install
```

## Uso

En una terminal, encender los emuladores y dejarlos corriendo:

```bash
npm run emuladores
```

En otra terminal:

| Comando | Qué prueba |
|---|---|
| `npm run humo` | Entra como admin y abre las 14 pestañas; falla si hay errores de JavaScript. Capturas en `salida/`. |
| `npm run flujo` | Crea bloque y nicho → pallet → lo mueve → lo retira; revisa posiciones, kardex, bitácora y reglas de seguridad. |
| `npm run xss` | Carga texto con HTML malicioso en todos los módulos y verifica que no se inserte como código en ninguna pantalla. |
| `npm run bloque` | Inserta un bloque entre A y el pasillo; verifica orden, pasillo, letras AA…, que sus nichos queden a la izquierda de la reja y que nada existente cambie. |
| `npm run piso` | Piso de 1 fila × 2: en A (normal) se conserva la fila de arriba con sus pallets; en B (volteado) solo los nichos de 3 niveles, conservando la fila pegada al rack; nichos nuevos; volver a 5 filas. |
| `npm run pasillo` | Pasillo parcial (desde un nicho hasta otro): queda justo debajo de esos nichos, también en modo compacto, y vuelve a todo el ancho. |
| `npm run columna` | X1–X3 en columna desde 03·04 de A, cruzando el pasillo (2 filas de alto) hasta AB; pasillo de C hasta X1; en Diseño y Movimientos, sin cambiar datos. |
| `npm run alinear` | Fila D compacta + pasillo de 2 filas y fila B alineada: AN 05·06 = W 05·10, AN 07·12 = W 06·11, pasillo = W 07·12 y 08·13; X y AA bajan y quedan debajo del pasillo sin taparse. Caso 2 (compacto): título de W = título de AN y títulos de X y AA = última fila de W; borde de abajo de W estirado hasta el de X. En Diseño y Movimientos, sin cambiar datos. |
| `npm run pdf` | Genera el PDF de inventario con 30 productos (descripciones de distinto largo, con foto) y verifica que ninguna fila se parta entre páginas. PDF en `salida/inventario.pdf`. |
| `npm run costos` | Costos del inventario: del catálogo; si no tiene, del pallet (promedio ponderado); aviso, filtro "ver solo estos" y Excel con columna "Origen del costo". |
| `npm run guia` | Carga una guía de remisión de prueba (encabezado con tildes "Ítem/Código", 3 páginas, 60 ítems) en Cargar Guía y verifica N° de guía, fecha, bultos e ítems; dirección de llegada de 3 líneas completa y participante escrito en ella antes que uno "recordado" equivocado; y el aviso de avance (página que lee, "X de N campañas" y segundos; sigue visible pasados los 5 s; campañas descargadas en paralelo); también una guía con formato SUNAT (`--sunat`: encabezado de varias líneas, "N BULTOS" e ítem partido entre páginas). `node guia_pdf.js ruta.pdf` prueba un PDF real (no lo subas al repo). |
| `npm run posiciones` | Filtro "Posición desde/hasta" del inventario (nichos o posiciones, al revés, solo desde/hasta, posición inexistente) combinado con proveedor; resumen, Ver detalle, Excel con filtros, Excel por pallet (orden por pallet, totales y filtros) y Limpiar. |
| `npm run interfaz` | Pantalla de Inventario: orden por columnas, tarjetas de resumen (y "Costos a revisar" como filtro), foto, cifras a la derecha, descripción en 2 líneas, panel lateral con "Ir ›" a Movimientos y vista de tarjetas en el celular sin que nada se salga. |
| `npm run rotulos` | Rótulos de Campaña: tiendas de todas las campañas activas; aviso "Cargando tiendas…" si tarda; campañas antiguas descargan sus filas una sola vez (en paralelo) y guardan su lista; la segunda vez y tras recargar, sin descargas; avance "X de N campañas" con tiendas elegibles mientras llegan; preparación en segundo plano al entrar a la app. |
| `npm run analisis` | Análisis de Campañas con red lenta simulada: si la lista de campañas aún se está cargando, el desplegable muestra "Cargando campañas…" y se llena solo al terminar (también Validadores y Vouchers); "Cargando participantes…" (gana la última campaña elegida); "Analizar" con avance visible pasados los 5 s. |
| `npm run reemplazar` | Cargar Campaña por partes y "Reemplazar": si el código del PDF ya está cargado se elige "Adicionar" (aviso destacado en verde/ámbar y fecha de transacción tomada de la campaña) y solo se agregan las filas nuevas (participante + SKU), sin nada nuevo avisa y no carga; "Reemplazar": sin permiso de eliminar no deja; reemplaza las filas conservando el correlativo (la guía sigue asociada), actualiza la cabecera y la bitácora; un código nuevo se guarda como campaña nueva. |
| `npm run mapa` | Análisis → Mapa de calor con 16 tiendas × 60 SKU: entran todos ajustando los cuadros al ancho, colores por estado (completo, faltante por tramos, exceso), cumplimiento por tienda, tarjeta y resaltado de fila/columna al pasar el mouse, y "Solo con faltantes". Captura en `salida/mapa_calor.png`. |
| `npm run participantes` | Campañas → Participantes: lista de los participantes registrados en el módulo (campañas, guías, validadores, recordados) sin repetir nombres escritos distinto; agregar (con zona sugerida Lima/Provincia por la dirección de sus guías), agregar todos, crear, unir otro nombre, editar, desactivar, filtros y bitácora; un no administrador lo ve pero no puede editar (reglas). Captura en `salida/participantes.png`. |
| `npm run registros` | Campañas: subpestañas agrupadas (Cargar · Consultar · Gestionar) y "Registros y Detalle" con indicadores, campañas y guías lado a lado, guías por campaña (lee todas aunque sean más de 200), clic en una campaña para ver solo sus guías, indicador "Campañas sin guías" como filtro y vista de celular en una columna. Capturas en `salida/registros.png` y `salida/subpestanas.png`. |
| `npm run vouchers` | Vouchers Agencia: solo lista las guías de tiendas de Provincia según el maestro de participantes (también por sus otros nombres) y avisa cuántas no se muestran (Lima, sin zona, no registradas). |
| `npm run compras` | Campañas → Cargar → Compras (sin campaña): pegar filas de Excel (con o sin títulos, celdas con saltos de línea, pegar desde una celda), validar números/fecha/hora/código de barras científico en rojo, corregir escribiendo, columna SKU sacada de CORREL. / SKU ("#7392 - SST-5" → SST-5), guardar como cargas numeradas COM-00001… (montos "S/ 1,200.50" y "50." convertidos), bloqueo al guardar y "Habilitar edición", totales por SKU (CANT. VALIDADA sumada) guardados en compras_totales, detalle y totales de 20 en 20 (Guardar lleva a la página del error), códigos de barras alfanuméricos aceptados y cargas de 15 en 15 (últimas primero), abrir, corregir y eliminar cargas, columnas de ancho fijo al ordenar, solo filas VALIDADO / EN VALIDACIÓN con CANT. VALIDADA > 0 (las demás se quitan al pegar y al guardar), proveedor obligatorio con sugerencias de las cargas activas, N° de compra obligatorio y sin duplicar (aviso al escribir y alerta al guardar), asignar varias cargas a una campaña (y una carga a varias), tarjetas por campaña (o sin campaña) con resumen, barra de asignación con accesos rápidos y quitar con ✕, buscador por código de producto, descripción, proveedor, N° de compra y rango de fechas (en memoria, con tabla de productos encontrados y "Abrir"); lo guardado por campaña en la versión anterior pasa a ser una carga; bitácora. Capturas en `salida/compras.png` y `salida/compras_campanas.png` y `salida/compras_asignar.png`. |
| `npm run repcompra` | Campañas → Consultar → Reparto vs Compra: filas = códigos del reparto, columnas = tiendas (como la hoja de Excel), COMPRA y COSTO (promedio ponderado) de las cargas activas asignadas a la campaña, cantidad de la guía activa donde la tienda ya tiene guía (en rojo si difiere del reparto; la guía invalidada no cuenta), SALDO, columnas SKU · Descripción · Compra · Costo inmovilizadas al desplazar, tiendas por grupos con color (Lima verde con Mall Plaza Comas, Venta Virtual naranja suave, Arequipa amarillo fosforescente, periferia amarillo, provincia gris), ordenar por cualquier columna sin cambiar anchos, menú e indicadores en un botón flotante, fila TOTAL, indicadores, filtros, búsqueda, exportar a Excel, lista de códigos de guía que no hacen match con el reparto (código o tienda fuera del reparto) con sugerencia y "✓ Corregir" el código en la guía guardada y aviso si la campaña no tiene compras asignadas. Captura en `salida/reparto_compra.png`. |
| `npm run guiasug` | Cargar Guía: las campañas guardan su lista de códigos (skus_lista) y la guía se compara sin descargar los repartos; las campañas antiguas se descargan una sola vez y se les guarda la lista; el participante se sugiere primero con el maestro (nombre, otros nombres o palabras de dirección en el punto de llegada) usando el nombre que tiene en la campaña. |
| `npm run regularizaciones` | Cargar → Regularizaciones: devolución de venta virtual y saldos de campaña con guías en PDF (lectura como Cargar Guía, campaña sugerida por códigos, duplicados contra regularizaciones y guías), merma pegada desde Excel (SKU, descripción, cantidad, participante de la campaña; errores en rojo), campaña opcional al cargar (se asigna después en la lista, con filtro "Sin campaña"), lista con cambiar concepto y anular (lo antiguo de "Sobrantes" cuenta como Merma); en Reparto vs Compra las columnas DEV. VENTA VIRTUAL (verde intenso), MERMA (fucsia), SALDOS CAMPAÑA y SALDO FINAL = SALDO + DEV. VENTA VIRTUAL − MERMA − SALDOS CAMPAÑA, con su valorizado, con los filtros por saldo final; sus códigos no entran en la lista de "Códigos de guía sin reparto" (solo guías); bitácora. Capturas en `salida/regularizaciones*.png`. |
| `npm run mermapdf` | Merma → PDF "RECEPCION DE TIENDAS": la sede va una sola vez en la cabecera (sin columna SEDE) y la columna DESCRIPCION es más ancha. PDF de muestra en `salida/merma_recepcion.pdf`. |
| `npm run ventaonline` | Menú Campañas → Venta Online (pestaña propia, permiso "Venta Online"): Comprobantes Agencia (PDF de boleta/factura → tipo, N°, fecha de emisión, DNI/RUC, nombre, códigos, importe; canal AGENCIA; aviso de duplicados; el PDF se guarda) y Subir voucher (multibuscador por cualquier dato, filtros con/sin voucher, tipo y fechas, teclado / ↑ ↓, varios vouchers PDF o imagen por comprobante con visor y quitar; bitácora). Vouchers de más de 700 KB se reducen antes de subir (PDF a imágenes JPEG, imágenes a 2000 px). Permiso "Solo Subir voucher" (área comercial): solo ve esa sección, puede subir pero no quitar vouchers. Capturas en `salida/vo_*.png`. |
| `npm run permisos` | Usuarios: lista de usuarios (con lo que ve cada uno) y permisos a detalle ordenados como el menú — opción por opción y, en Campañas (PDF), Venta Online, Rótulos PDF y Merma, sección por sección (`permisos.subs`); plantillas (área comercial, todo, quitar todo); resumen "Verá: …"; al guardar se reemplazan los permisos completos; permisos antiguos ("Solo Subir voucher", Rótulos sin clave) se respetan; al entrar cada usuario ve solo lo permitido y abre la primera sección permitida. Captura en `salida/permisos.png`. |
| `npm run revisar` | Revisión del código sin emuladores: datos insertados en HTML sin `esc()` y HTML del programa escapado por error. |
| `npm run todo` | Todas las anteriores. |
| `node texto.js antes` / `node texto.js despues` | Guarda el texto visible de cada pestaña para comparar antes y después de un cambio (`diff salida/texto-antes.txt salida/texto-despues.txt`). |

## Archivos

- `app.js`: abre la app conectada a los emuladores (servidor local en
  `127.0.0.1:5055`, librerías de CDN servidas desde `node_modules`).
- `datos.js`: datos de ejemplo para todos los módulos.
- Usuario de prueba: `mramos@corporaciongrit.com` / `prueba123` (solo existe
  en el emulador).
