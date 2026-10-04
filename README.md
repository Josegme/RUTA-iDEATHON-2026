# RUTA IDEATHON 2026

Plataforma web para la dinámica **RUTA IDEATHON 2026**: 7 grupos recorren 7 postas, con sorteo de turnos en vivo, ruleta de misiones, validación por mentores y paneles en tiempo real.

> Estado: **V3.2** — aplicación de archivo único (`index.html`, JS vanilla, persistencia local). El siguiente hito es la sincronización multi-dispositivo con Supabase y el despliegue en Vercel.

## Funcionalidades

| Área | Descripción |
|---|---|
| Organización | Panel de organizadora: sorteo en vivo, accesos de grupos, resumen, gestión y actividad de mentores, reinicio de grupo/juego. |
| Sorteo | Selección aleatoria y animada del grupo que gira la ruleta; el grupo sorteado queda fuera de la siguiente ronda. |
| Grupos | Ingreso por QR único + código (`GP01`–`GP07`), confirmación «Somos este grupo», ruleta, mapa de postas. Match grupo + misión. |
| Mentores | Acceso con PIN, estados (disponible / ocupado / no disponible), alertas de solicitudes, aceptar → aprobar o rechazar con motivo. |
| Validación | El grupo solicita validación al terminar una posta; un único mentor la toma; si no aprueba, el grupo rehace la posta y solicita de nuevo. |
| Público | Tablero para proyectar el avance en vivo. |

## Rutas (hash)

`#admin` · `#public` · `#ruleta` · `#mentor` · `#grupo` (destino del QR)

## Datos por defecto (solo desarrollo)

- Códigos de grupo: `GP01`…`GP07`
- PIN de mentores: `1001`…`1010`
- PIN de organización: `2026`

> Estos valores son de demostración. En producción se almacenarán hasheados en servidor y se podrán modificar desde el panel.

## Ejecución local

```bash
python3 -m http.server 8000   # desde la raíz del repositorio
# abrir http://localhost:8000/
```

## Pruebas (Playwright, e2e multi-pestaña)

```bash
npm i -g playwright
cd test && ./build.sh                 # genera test/site/index.html con la librería QR local
cd site && python3 -m http.server 8765 &
cd .. && NODE_PATH=$(npm root -g) node e2e.js   # 88 verificaciones
```

## Roadmap

1. **GitHub** — repositorio y documentación (este paso).
2. **Supabase** — esquema por entidad, funciones RPC para escrituras sensibles (sorteo, asignación de misión, claim/aprobación), RLS, realtime, PIN hasheados.
3. **Vercel** — proyecto Vite, preview por rama y producción desde `main`.
4. **Validación** — re-ejecución de la suite e2e sobre el despliegue y ensayo con varios teléfonos.
5. **Evento** — proyecto Supabase dedicado, separado del de pruebas.

## Estructura

```
index.html          Aplicación (V3.2)
docs/v2-original.html  Línea base V2
test/               Suite e2e y script de build
```
