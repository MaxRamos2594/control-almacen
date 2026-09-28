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
| `npm run piso` | Cambia el piso del bloque A a 1 fila × 2 con pallets en la fila de arriba: se conserva esa fila (05 y 10) con sus pallets, no se tocan nichos con pallets abajo, nichos nuevos con la numeración del bloque, volver a 5 filas. |
| `npm run revisar` | Revisión del código sin emuladores: datos insertados en HTML sin `esc()` y HTML del programa escapado por error. |
| `npm run todo` | Todas las anteriores. |
| `node texto.js antes` / `node texto.js despues` | Guarda el texto visible de cada pestaña para comparar antes y después de un cambio (`diff salida/texto-antes.txt salida/texto-despues.txt`). |

## Archivos

- `app.js`: abre la app conectada a los emuladores (servidor local en
  `127.0.0.1:5055`, librerías de CDN servidas desde `node_modules`).
- `datos.js`: datos de ejemplo para todos los módulos.
- Usuario de prueba: `mramos@corporaciongrit.com` / `prueba123` (solo existe
  en el emulador).
