# FORSYN

Aplicación web estática de demostración para monitoreo personal. Las lecturas que muestra son simuladas y no son mediciones clínicas ni sustituyen la evaluación de un profesional de salud.

## Uso

Abre `index.html` en un navegador o publícalo con GitHub Pages.

## Animación del electrocardiograma

La animación visual mejorada está en `ecg-animation.js`. Para activarla, incluye este script en `index.html` después del script principal de la aplicación y antes de `</body>`:

```html
<script src="ecg-animation.js"></script>
```

La animación dibuja una retícula tenue, un trazo P-QRS-T estilizado con brillo y un barrido suave. Se sincroniza con la pausa de la simulación y respeta la preferencia del sistema para reducir movimiento. Es un efecto visual ilustrativo, no una señal médica real.

## Archivos

- `index.html`: estructura y lógica actual de la app.
- `ecg-animation.js`: animación visual mejorada del ECG.
- `styles.css` y `script.js`: archivos existentes del repositorio.
