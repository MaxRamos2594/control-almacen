# Control de Almacén

App web de una sola página: todo el código está en `index.html` (HTML + CSS +
JS, sin compilación). Backend en Firebase (Auth, Firestore, Storage) del
proyecto `layout-e25cc`. Textos, comentarios y commits en español.

- Reglas de seguridad: `firestore.rules`, `storage.rules`. Se publican a mano en
  la consola de Firebase; avisar al usuario cuando cambien.
- Versión visible: `APP_VERSION` y `APP_UPDATED` en `index.html`; subirla en
  cada cambio que se publique.
- Texto de datos insertado con `innerHTML` siempre va dentro de `esc(...)`.
- Pruebas: ver `pruebas/README.md` (emuladores de Firebase + Chromium). Antes
  de publicar un cambio, correr `npm run todo` en `pruebas/` con los emuladores
  encendidos.
