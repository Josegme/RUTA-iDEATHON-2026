# RUTA IDEATHON 2026

Plataforma web para la dinámica **RUTA IDEATHON 2026**: 7 grupos recorren 7 postas, con sorteo de turnos en vivo, ruleta de misiones, validación por mentores y paneles en tiempo real.

> Estado: **V3.2 + sincronización** — aplicación de archivo único (`index.html`, JS vanilla). Los datos se comparten entre dispositivos con Supabase (tabla `kv` + Realtime) y la app está desplegada en Vercel: **https://ruta-ideathon.vercel.app**

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

## Sincronización multi-dispositivo (Supabase)

`localStorage` sigue siendo la caché local; cada escritura se sube a la tabla `public.kv` y los cambios de otros dispositivos llegan por Realtime (WebSocket) con un sondeo cada 2 s de respaldo. Sin internet la app sigue funcionando en local (el puntito de abajo a la derecha se pone rojo).

- Esquema, políticas RLS, Realtime y la función de fusión de solicitudes: [`supabase/schema.sql`](supabase/schema.sql).
- La sincronización está **apagada en `localhost`** (para que las pruebas no toquen la base real). Se enciende con `?sync=1` y se apaga en cualquier sitio con `?nosync`.
- Las solicitudes de validación se fusionan por `id` con un contador `_n`; el resto de las claves son «gana la última escritura».
- Los borrados (reinicios) viajan como marca `{"__deleted":true}`.
- La clave `sb_publishable_…` embebida en `index.html` es pública por diseño. La app no usa autenticación de Supabase (los PIN se validan en el cliente), así que la tabla queda abierta a esa clave solo para claves `rutaideathon_v3_*`.

### Día del evento

1. Abrir el panel desde la URL corta: `https://ruta-ideathon.vercel.app/#admin` (el QR de los grupos usa la dirección desde la que se abre).
2. Una vez, en «Gestión de mentores» → «Reiniciar todos los equipos» para empezar limpio.
3. Abrir la app unos días antes: Supabase (plan gratis) pausa el proyecto tras 7 días sin actividad.

### Despliegue

```bash
vercel deploy --prod --yes --scope josegmescobar-2036s-projects   # proyecto ruta-ideathon-2026
```

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

Prueba de sincronización con 5 dispositivos independientes (organización, proyector, celular de grupo, 2 mentores) contra Supabase real. **Vacía la tabla `kv`**, no correr durante el evento:

```bash
cd test && CONFIRM_WIPE=yes NODE_PATH=$(npm root -g) node sync.js
# contra producción: BASE_URL='https://ruta-ideathon.vercel.app/index.html?sync=1'
```

Nota: `e2e.js` espera `qrcode.js` junto a `test/site/index.html`; si no está, falla solo la verificación «Panel muestra el QR único».

## Roadmap

1. ~~GitHub~~ — repositorio y documentación.
2. ~~Supabase~~ — sincronización multi-dispositivo (tabla `kv`, RLS, Realtime, fusión de solicitudes).
3. ~~Vercel~~ — despliegue estático por CLI en `ruta-ideathon.vercel.app`.
4. ~~Validación~~ — prueba de 5 dispositivos sobre el despliegue real.
5. **Evento** — ensayo con teléfonos reales y reinicio previo desde el panel.
6. Futuro: PIN hasheados en servidor y RPC para escrituras sensibles (sorteo, claim/aprobación).

## Estructura

```
index.html             Aplicación (V3.2 + sincronización)
supabase/schema.sql    Tabla kv, RLS, Realtime y función de fusión
docs/v2-original.html  Línea base V2
test/                  Suite e2e, prueba de sincronización y script de build
```
