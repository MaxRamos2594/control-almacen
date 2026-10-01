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
| `npm run revisar` | Revisión del código sin emuladores: datos insertados en HTML sin `esc()` y HTML del programa escapado por error. |
| `npm run todo` | Todas las anteriores. |
| `node texto.js antes` / `node texto.js despues` | Guarda el texto visible de cada pestaña para comparar antes y después de un cambio (`diff salida/texto-antes.txt salida/texto-despues.txt`). |

## Archivos

- `app.js`: abre la app conectada a los emuladores (servidor local en
  `127.0.0.1:5055`, librerías de CDN servidas desde `node_modules`).
- `datos.js`: datos de ejemplo para todos los módulos.
- Usuario de prueba: `mramos@corporaciongrit.com` / `prueba123` (solo existe
  en el emulador).
