# AutoShop Automotora — web

Web de **AutoShop Automotora** (autos usados con financiación propia, Montevideo; locales en Bv. Batlle y Ordóñez y Av. Eugenio Garzón). Diseño de Claude Design en `diseno/` (no cambiarlo). Hasta el lanzamiento queda con `indexar: false` (noindex).

- Repo: https://github.com/matias-bermudez/autoshop-automotora (público: GitHub Pages gratis no publica repos privados)
- Web: https://matias-bermudez.github.io/autoshop-automotora/
- Seguimiento: issues del repo. Los commits cierran issues con `Closes #N`.

## Plataforma Automotoras

Sigue las reglas de `~/Proyectos/plataforma-automotoras/README.md` (leerlo). Referencia: `~/Proyectos/DNAutos`; locales y año/km opcionales como `~/Proyectos/JHMotors`.
Base compartida en Supabase, `concesionaria = 'autoshop'`. **No tocar el esquema desde acá**: lo que falte va en `autos.extra` / `negocios.extra`.

## Stack

Sitio estático generado por `scripts/generar.js` (Node 18+, sin dependencias) → `_site/` (no se commitea).
GitHub Actions (`.github/workflows/publicar.yml`, igual al de DN) publica en Pages en push, `workflow_dispatch` (trigger de Supabase) y cron de 15 min "solo si cambió".

| Archivo | Qué es |
|---|---|
| `js/config.js` | WhatsApp, Instagram/Facebook, financiación (`cuotas`, `entregaPct`, `condiciones`), locales (`sedes`), Supabase, `sitio`, `indexar`. La fila de `negocios` lo pisa al publicar |
| `js/common.js` | Helpers navegador/generador (`window.AS`): precios, slug, íconos, WhatsApp y el selector "¿Estás en el clearing?" |
| `js/autos.js` | Autos de ejemplo (formato de la tabla `autos`) para probar en local con `--ejemplos`; fotos en `ejemplos/fotos/`. No se publica |
| `src/*.html`, `src/_partials/` | Plantillas: `{{ dato }}` (sin escapar: el generador escapa) y `{{> parcial }}` |
| `scripts/generar.js` | Lee autos y negocio, baja fotos, arma páginas, JSON-LD, sitemap, robots, estado.json |
| `js/catalogo.js`, `ficha.js`, `vende.js` | Filtros del catálogo (en la URL), galería y mensaje de "Me interesa", formulario → WhatsApp |
| `src/admin.html`, `js/admin.js` | Panel (supabase-js 2.45.4): autos, fotos (recorte 4:3, "Sacar foto"), "Datos del negocio" |
| `css/styles.css`, `fonts/` | Estilos (tokens en `:root`, celular primero) y Archivo (normal e itálica, ancho variable, OFL) |

URLs: `/`, `/autos/` (acepta `?sucursal=Batlle&tipo=&combustible=&caja=&precio=&orden=`), `/autos/<slug>/`, `/vende-tu-auto/`, `/donde-estamos/`, `404.html`, `/admin/`.

## Datos

- `autos.extra`: `version`, `sede` (`Batlle` | `Garzón`), `cuota` (U$S por mes en 60 cuotas; vacío = "Consultá la cuota"), `entrega_pct` (si no es la general), `sin_km`, `vendido_el`.
  `modelo` = modelo + versión; `AS.partirModelo()` los separa.
- `negocios`: `whatsapp`/`telefono`, `instagram`, `facebook`; `extra.sedes` (`{"Batlle": {direccion, horario, whatsapp, whatsappLabel, telefono}}`), `extra.condiciones`, `extra.entrega_pct`.
- "¿Estás en el clearing?": se guarda en el navegador (`localStorage` `autoshop-clearing`) y pone `html[data-clearing="no|si"]`; el CSS muestra la variante (`.v-ambos`, `.v-no`, `.v-si`). Sin JavaScript solo se ve el precio contado.
- Entrega en clearing = precio × `entrega_pct` (el del auto o el general, 50 %).

## Probar

`node scripts/generar.js --local --ejemplos && python3 -m http.server 8833 -d _site` → http://localhost:8833 (sin `--ejemplos` usa la base).
Capturas: Playwright de `/Users/matibermudez/Proyectos/TapStore-listas/node_modules/playwright`, `devices['iPhone 13']` y escritorio 1440.

## Registro

- 2026-11-02: web armada desde el diseño (inicio, catálogo, ficha, vendé o permutá, dónde estamos, 404, panel), con el selector de clearing, dos locales, año/km opcionales y datos del negocio editables. Publicada con GitHub Actions. Stock vacío en la base.
- Pendiente: alta de `autoshop` en `concesionarias`, repo en el token de GitHub y usuario del panel. Datos del negocio a cargar desde el panel (WhatsApp de cada local, horarios, condiciones).
