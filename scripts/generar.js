// Arma el sitio estático en _site/ a partir de src/ y de los autos de AutoShop en Supabase
// (base compartida de la Plataforma Automotoras, concesionaria = 'autoshop').
// Cada auto tiene su propia página (/autos/<slug>/) con su título, descripción y datos estructurados
// para Google. Las fotos se bajan y se publican junto con la web, así las visitas no consumen Supabase.
// GitHub Actions lo corre en cada push a main, cuando se guarda un auto en el panel y cada 15 minutos.
//
//   node scripts/generar.js                       → para publicar
//   node scripts/generar.js --local               → para probar: python3 -m http.server 8833 -d _site
//   node scripts/generar.js --local --ejemplos    → con los autos de ejemplo de js/autos.js (fotos de ejemplos/fotos/)
//   SOLO_SI_CAMBIO=1 node scripts/generar.js      → no hace nada si los autos y los datos del negocio no cambiaron
//   AUTOS_JSON=filas.json node scripts/generar.js --local   → usa esas filas (mismo formato que la API)
//   NEGOCIO_JSON=fila.json node scripts/generar.js --local  → usa esa fila de `negocios` en vez de la de Supabase
//
// Sin dependencias, solo Node 18+.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const SALIDA = path.join(RAIZ, '_site');
const ESTATICOS = ['css', 'js', 'img', 'fonts'];
const EJEMPLOS = process.argv.includes('--ejemplos');

// Se cargan los mismos archivos que usa el navegador.
const ctx = vm.createContext({ window: {} });
const correr = (f) => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
correr('js/config.js');
correr('js/common.js');
const C = ctx.window.AS_CONFIG;
const AS = ctx.window.AS;
const { esc, miles, icono } = AS;

const SITIO = C.sitio.replace(/\/?$/, '/');
const BASE = process.argv.includes('--local') ? '/' : new URL(SITIO).pathname;
const HOY = new Date().toISOString().slice(0, 10);
const TIPOS = ['auto', 'camioneta', 'utilitario'];
const NOMBRE = 'AutoShop Automotora';

let AUTOS;

async function main() {
  // ---- Datos ----
  const [filas, negocio] = await Promise.all([leerAutos(), leerNegocio()]);
  // Los datos del negocio de la base pisan a js/config.js en todas las páginas.
  Object.assign(C, configDeNegocio(negocio));
  const autos = filas.map(deFila).filter(Boolean);

  const hash = crypto.createHash('sha256').update(JSON.stringify({ autos: filas, negocio })).digest('hex').slice(0, 16);
  if (process.env.SOLO_SI_CAMBIO) {
    const anterior = await fetch(SITIO + 'estado.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (anterior && anterior.hash === hash) {
      console.log('Los autos y los datos del negocio no cambiaron desde la última publicación, no hay nada para publicar.');
      salida('cambio', 'false');
      return;
    }
  }

  fs.rmSync(SALIDA, { recursive: true, force: true });
  // js/autos.js son los autos de ejemplo: no se publican.
  for (const dir of ESTATICOS) {
    fs.cpSync(path.join(RAIZ, dir), path.join(SALIDA, dir), { recursive: true, filter: (f) => !f.endsWith(path.join('js', 'autos.js')) });
  }
  // El navegador (formularios, mensajes de WhatsApp, panel) usa la misma config, ya con los datos del negocio.
  // Se reescribe entera para que un número viejo no quede en ningún archivo.
  escribir('js/config.js', '// Generado por scripts/generar.js: js/config.js con los datos del negocio de Supabase (panel → Datos del negocio).\n' +
    'window.AS_CONFIG = ' + JSON.stringify(C, null, 2) + ';\n');
  await bajarFotos(autos);
  // Más nuevos primero.
  AUTOS = autos.sort((a, b) => b.creado.localeCompare(a.creado));

  generarPaginas();
  escribir('estado.json', JSON.stringify({ hash, generado: new Date().toISOString(), autos: AUTOS.length }) + '\n');
  salida('cambio', 'true');
  const origen = EJEMPLOS ? 'js/autos.js (ejemplos)' : process.env.AUTOS_JSON || 'Supabase';
  console.log(`Listo: ${AUTOS.length} autos (${origen}). indexar=${C.indexar} → _site/`);
}

// ---- Supabase ----

// Las claves nuevas (sb_publishable_...) van solo en apikey; las viejas (anon, JWT) también en Authorization.
function cabeceras() {
  const headers = { apikey: C.supabaseKey };
  if (!C.supabaseKey.startsWith('sb_')) headers.Authorization = 'Bearer ' + C.supabaseKey;
  return headers;
}

async function leerAutos() {
  if (EJEMPLOS) {
    const v = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/autos.js'), 'utf8'), v, { filename: 'js/autos.js' });
    return v.window.AS_EJEMPLOS;
  }
  if (process.env.AUTOS_JSON) return JSON.parse(fs.readFileSync(process.env.AUTOS_JSON, 'utf8'));
  const res = await fetch(`${C.supabaseUrl}/rest/v1/autos?select=*&concesionaria=eq.${encodeURIComponent(C.concesionaria)}&order=created_at.desc`, { headers: cabeceras() });
  if (!res.ok) throw new Error(`Supabase respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

// Datos del negocio que el dueño edita desde el panel (WhatsApp, redes, condiciones, locales).
// Si no hay fila o no se puede leer, se usa js/config.js tal cual.
async function leerNegocio() {
  if (process.env.NEGOCIO_JSON) {
    const x = JSON.parse(fs.readFileSync(process.env.NEGOCIO_JSON, 'utf8'));
    return (Array.isArray(x) ? x[0] : x) || null;
  }
  const res = await fetch(`${C.supabaseUrl}/rest/v1/negocios?select=*&concesionaria=eq.${encodeURIComponent(C.concesionaria)}`, { headers: cabeceras() }).catch(() => null);
  if (!res || !res.ok) {
    console.warn(`Aviso: no se pudieron leer los datos del negocio (${res ? res.status : 'sin conexión'}), se usa js/config.js.`);
    return null;
  }
  return (await res.json())[0] || null;
}

// Fila de negocios → claves de AS_CONFIG (solo las que tienen valor; null = queda lo de config.js).
// Cada local va en extra.sedes ({ "Batlle": { direccion, horario, whatsapp, whatsappLabel, telefono } });
// ahí un texto vacío = no se muestra (o, en el WhatsApp, se usa el general).
function configDeNegocio(n) {
  if (!n) return {};
  const mapa = { whatsapp: 'whatsapp', telefono: 'whatsappLabel', instagram: 'instagram', facebook: 'facebook' };
  const c = Object.fromEntries(Object.entries(mapa).filter(([k]) => n[k]).map(([k, clave]) => [clave, n[k]]));
  const x = n.extra || {};
  if (typeof x.condiciones === 'string' && x.condiciones.trim()) c.condiciones = x.condiciones.trim();
  const pct = Number(x.entrega_pct);
  if (pct > 0 && pct <= 100) c.entregaPct = pct;
  const sedes = x.sedes || {};
  c.sedes = C.sedes.map((s) => {
    const d = sedes[s.nombre] || {};
    const sede = Object.assign({}, s);
    for (const k of ['direccion', 'horario', 'whatsapp', 'whatsappLabel', 'telefono']) if (typeof d[k] === 'string') sede[k] = d[k];
    return sede;
  });
  return c;
}

// Fila de la base → auto listo para las plantillas. Si a un auto le falta algo, se saltea (no rompe la web).
// Los vendidos y los borradores no llegan con la clave pública; igual se filtran por si vienen de AUTOS_JSON.
function deFila(r) {
  if (r.publicado === false || r.estado === 'vendido') return null;
  const falta = ['slug', 'marca', 'modelo'].filter((k) => r[k] === null || r[k] === undefined || r[k] === '');
  if (falta.length || !TIPOS.includes(r.tipo || 'auto')) {
    console.warn(`Aviso: se saltea el auto ${r.id} (${r.marca} ${r.modelo}), falta: ${falta.join(', ') || 'tipo'}`);
    return null;
  }
  const x = r.extra || {};
  const { modelo, version } = AS.partirModelo(r);
  const moneda = r.moneda === 'UYU' ? 'UYU' : 'USD';
  const ruta = `autos/${r.slug}/`;
  const dir = `img/autos/${r.slug}/`;
  const pctPropio = Number(x.entrega_pct);
  const pct = pctPropio > 0 && pctPropio <= 100 ? pctPropio : C.entregaPct;
  const cuota = Number(x.cuota) > 0 ? Math.round(Number(x.cuota)) : null;
  const sede = AS.sede(x.sede);
  return {
    id: r.id, slug: r.slug, ruta, url: SITIO + ruta,
    marca: r.marca, modelo, version, anio: r.anio || null,
    nombre: `${r.marca} ${modelo}`,
    titulo: [r.marca, modelo, r.anio].filter(Boolean).join(' '),
    // extra.sin_km: el dueño no sabe los km (campo vacío en el panel). Un 0 escrito es un 0 km.
    km: r.km || 0, sinKm: x.sin_km === true,
    kmFmt: x.sin_km === true ? 'Km a consultar' : miles(r.km || 0) + ' km',
    carroceria: r.carroceria || { camioneta: 'Pick-up', utilitario: 'Utilitario' }[r.tipo] || '',
    tipo: r.tipo || 'auto',
    combustible: r.combustible || '', transmision: r.transmision || '',
    motor: r.motor || '', color: r.color || '', duenos: r.duenos || null, puertas: r.puertas || null,
    precio: r.precio || null, moneda,
    precioFmt: AS.precio(r.precio, moneda),
    dolares: AS.enDolares(r.precio, moneda),
    cuota, pct,
    entrega: r.precio ? Math.round((r.precio * pct) / 100) : null,
    sede,
    reservado: r.estado === 'reservado',
    destacado: !!r.destacado,
    etiqueta: r.etiqueta || '',
    equipamiento: r.equipamiento || [],
    descripcion: r.descripcion || '',
    creado: r.created_at,
    actualizado: (r.updated_at || r.created_at).slice(0, 10),
    fotos: [],
    // Rutas en el bucket; bajarFotos() completa `fotos` con las que se pudieron bajar.
    _fotos: (r.fotos || []).map((p) => ({ p, archivo: dir + path.posix.basename(p) }))
  };
}

// Las fotos no cambian nunca (nombre = uuid): se guardan en .cache/fotos/ y solo se bajan las nuevas.
// GitHub Actions conserva esa carpeta entre publicaciones (actions/cache), así no se gasta cupo de Supabase.
// Con --ejemplos se toman de ejemplos/fotos/.
const CACHE_FOTOS = path.join(RAIZ, '.cache', 'fotos');

async function bajarFotos(autos) {
  const url = (p) => `${C.supabaseUrl}/storage/v1/object/public/fotos/${p.split('/').map(encodeURIComponent).join('/')}`;
  const bajar = async (p, destino) => {
    let origen = path.join(CACHE_FOTOS, p);
    if (EJEMPLOS) origen = path.join(RAIZ, 'ejemplos', 'fotos', p);
    else if (!fs.existsSync(origen)) {
      const res = await fetch(url(p)).catch(() => null);
      if (!res || !res.ok) return false;
      fs.mkdirSync(path.dirname(origen), { recursive: true });
      fs.writeFileSync(origen, Buffer.from(await res.arrayBuffer()));
    }
    if (!fs.existsSync(origen)) return false;
    const f = path.join(SALIDA, destino);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.copyFileSync(origen, f);
    return true;
  };
  const tareas = autos.flatMap((a) => a._fotos.map((f) => async () => {
    const chica = f.archivo.replace(/\.jpg$/, '_m.jpg');
    f.ok = await bajar(f.p, f.archivo);
    f.chica = f.ok && (await bajar(f.p.replace(/\.jpg$/, '_m.jpg'), chica)) ? chica : f.archivo;
    if (!f.ok) console.warn(`Aviso: no se pudo bajar la foto ${f.p} de ${a.slug}`);
  }));
  // De a 6 descargas a la vez.
  const cola = tareas.slice();
  await Promise.all(Array.from({ length: 6 }, async () => { while (cola.length) await cola.shift()(); }));
  for (const a of autos) {
    a.fotos = a._fotos.filter((f) => f.ok).map((f) => ({ grande: f.archivo, chica: f.chica }));
    delete a._fotos;
  }
}

function salida(clave, valor) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${clave}=${valor}\n`);
}

// ---- Plantillas: {{ clave.sub }} y {{> parcial }} ----
// Los valores se insertan tal cual: todo texto que venga de la base pasa por esc() antes.

const parciales = {};
for (const f of fs.readdirSync(path.join(SRC, '_partials'))) {
  parciales[path.basename(f, '.html')] = fs.readFileSync(path.join(SRC, '_partials', f), 'utf8');
}

function render(tpl, datos) {
  return tpl.replace(/\{\{\s*(>\s*)?([\w.-]+)\s*\}\}/g, (_, parcial, clave) => {
    if (parcial) {
      if (!(clave in parciales)) throw new Error(`No existe el parcial ${clave}`);
      return render(parciales[clave], datos);
    }
    const v = clave.split('.').reduce((o, k) => (o == null ? undefined : o[k]), datos);
    if (v === undefined) throw new Error(`Falta el dato {{${clave}}}`);
    return String(v);
  });
}

function jsonld(...objs) {
  return objs.map((o) => '<script type="application/ld+json">' +
    JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n');
}

// ?v=<hash del archivo>: cuando cambia un css/js, el navegador no usa la copia vieja (Pages cachea 10 min).
const versiones = {};
function v(rel) {
  versiones[rel] = versiones[rel] || crypto.createHash('sha1').update(fs.readFileSync(path.join(SALIDA, rel))).digest('hex').slice(0, 8);
  return versiones[rel];
}

function scripts(raiz, nombres) {
  return nombres.map((n) => `<script src="${raiz}js/${n}.js?v=${v(`js/${n}.js`)}" defer></script>`).join('\n');
}

// ruta: '' (inicio), 'autos/', 'autos/<slug>/', '404.html'...
function pagina(plantilla, ruta, datos) {
  const prof = ruta.endsWith('/') ? ruta.split('/').length - 1 : 0;
  // El 404 se sirve en cualquier URL, por eso usa rutas absolutas.
  const raiz = ruta === '404.html' ? BASE : prof ? '../'.repeat(prof) : './';
  const d = Object.assign({
    raiz,
    v: { css: v('css/styles.css'), admin: v('js/admin.js') },
    canonical: SITIO + ruta,
    robots: C.indexar ? '<meta name="robots" content="index, follow, max-image-preview:large">' : '<meta name="robots" content="noindex">',
    ogTipo: 'website',
    ogImagen: SITIO + 'img/og.jpg',
    jsonld: '',
    claseBody: '',
    cuotas: C.cuotas,
    wa: { href: esc(AS.waUrl(MSG_GENERICO)), label: esc(C.whatsappLabel), icono: icono('wa', 20), icono30: icono('wa', 30) },
    anio: new Date().getFullYear()
  }, datos);
  d.header = d.header === undefined ? header(raiz, d.actual || '') : d.header;
  d.pie = d.pie === undefined ? pie(raiz) : d.pie;
  d.scripts = scripts(raiz, d.js || ['config', 'common']);
  const html = render(fs.readFileSync(path.join(SRC, plantilla), 'utf8'), d);
  escribir(ruta === '' || ruta.endsWith('/') ? ruta + 'index.html' : ruta, html);
}

function escribir(rel, contenido) {
  const f = path.join(SALIDA, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenido);
}

// ---- Piezas de HTML ----

const MSG_GENERICO = 'Hola AutoShop, te escribo desde la web.';
const sedeEtiqueta = (s) => (s ? s.etiqueta : '');
const mapsUrl = (s) => 'https://maps.google.com/?q=' + encodeURIComponent(s.mapa || s.direccion + ', Montevideo');
const instagramUrl = () => `https://instagram.com/${C.instagram}`;
const facebookUrl = () => (/^https?:\/\//.test(C.facebook) ? C.facebook : `https://facebook.com/${C.facebook}`);
const autosEn = (s) => AUTOS.filter((a) => a.sede === s).length;
const nAutos = (n) => (n === 1 ? '1 auto' : n + ' autos');
const pctFmt = (p) => p + ' %';
const cuotaFmt = (a) => (a.cuota ? 'U$S ' + miles(a.cuota) : '');
const entregaFmt = (a) => (a.entrega ? AS.precio(a.entrega, a.moneda) : '');

// Logo + "AutoShop" del encabezado.
function marca(raiz, chico) {
  return `<a class="marca${chico ? ' marca--chica' : ''}" href="${raiz}" aria-label="${NOMBRE}, inicio">` +
    `<img src="${raiz}img/logo.png" alt="" width="52" height="52"><span class="marca__txt">Auto<span>Shop</span></span></a>`;
}

// actual: 'inicio' | 'catalogo' | 'vende' | 'donde' | 'ficha' | '404'
function header(raiz, actual) {
  const link = (href, txt, id) => `<a href="${raiz}${href}"${actual === id ? ' aria-current="page"' : ''}>${txt}</a>`;
  const wa = AS.waUrl(MSG_GENERICO);
  if (actual === '404') return `<header class="header"><div class="header__in">${marca(raiz)}</div></header>`;
  const movil = actual === 'inicio'
    ? `<a class="header__catalogo solo-movil" href="${raiz}autos/">Catálogo</a>`
    : `<a class="header__wa-icono solo-movil" href="${esc(wa)}" aria-label="Escribinos por WhatsApp">${icono('wa', 22)}</a>`;
  const volver = actual === 'ficha'
    ? `<a class="header__volver solo-movil" href="${raiz}autos/" aria-label="Volver al catálogo">${icono('atras', 22)}</a>` : '';
  const derecha = actual === 'ficha'
    ? `<button type="button" class="header__btn solo-movil js-only" data-compartir aria-label="Compartir este auto">${icono('compartir', 22)}</button>`
    : `${movil}<button type="button" class="header__btn menu-btn solo-movil" aria-label="Abrir menú" aria-expanded="false" aria-controls="menu">${icono('menu', 22)}</button>`;
  return `<header class="header${actual === 'ficha' ? ' header--ficha' : ''}"><div class="header__in">
${volver}${marca(raiz)}
<nav class="menu" id="menu" aria-label="Principal">
${link('autos/', 'Catálogo', 'catalogo')}
${link('vende-tu-auto/', 'Vendé o permutá', 'vende')}
${link('donde-estamos/', 'Dónde estamos', 'donde')}
<a class="menu__wa solo-movil" href="${esc(wa)}">${icono('wa', 20)} WhatsApp ${esc(C.whatsappLabel)}</a>
</nav>
<a class="btn-wa header__wa solo-esc" href="${esc(wa)}">${icono('wa', 20)} WhatsApp</a>
${derecha}
</div></header>`;
}

function pie(raiz) {
  const ig = C.instagram ? `<a href="${esc(instagramUrl())}" target="_blank" rel="noopener">Instagram @${esc(C.instagram)}</a>` : '';
  return `<footer class="pie"><div class="pie__in">
<div class="pie__marca"><img src="${raiz}img/logo.png" alt="${NOMBRE}" width="64" height="64" loading="lazy">
<div><div class="pie__nombre">${NOMBRE}</div>${ig}</div></div>
<nav class="pie__nav" aria-label="Pie">
<a href="${raiz}autos/">Catálogo</a>
<a href="${raiz}vende-tu-auto/">Vendé o permutá</a>
<a href="${raiz}donde-estamos/">Dónde estamos</a>
<a href="${raiz}admin/">Acceso dueños</a>
</nav>
</div></footer>`;
}

// Precio grande del diseño: "U$S" en blanco y el número en rojo.
function precioGrande(a, clase) {
  const dentro = a.precio ? `${AS.signo(a.moneda)} <span>${miles(a.precio)}</span>` : '<span>Consultar</span>';
  return `<div class="precio-g ${clase || ''}">${dentro}</div>`;
}

// Foto (o lugar vacío si el auto no tiene). o: { raiz, grande, eager, alt, sizes }
function foto(a, i, o) {
  const f = a.fotos[i];
  if (!f) return `<div class="sin-foto"><img src="${o.raiz}img/logo.png" alt="" width="96" height="96" loading="lazy"></div>`;
  const src = o.grande ? f.grande : f.chica;
  return `<img src="${esc(o.raiz + src)}" srcset="${esc(o.raiz + f.chica)} 640w, ${esc(o.raiz + f.grande)} 1600w" sizes="${o.sizes || '(max-width: 760px) 100vw, 400px'}"` +
    ` alt="${esc(o.alt === undefined ? a.titulo : o.alt)}" width="640" height="480"${o.eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

// Las tres formas de mostrar el pago; el CSS muestra la que corresponde según "¿Estás en el clearing?".
// Sin JavaScript no se muestra ninguna: queda el precio contado.
function pagoCard(a) {
  const cuota = cuotaFmt(a);
  const ambos = `<div class="pago pago--ambos v v-ambos">
<div class="pago__box"><div class="pago__l">Sin clearing</div><div class="pago__v">${cuota ? `${C.cuotas} × <strong>${cuota}</strong>` : 'Consultá la cuota'}</div></div>
<div class="pago__box"><div class="pago__l">En clearing</div><div class="pago__v">Entregás <strong>${pctFmt(a.pct)}</strong></div></div>
</div>`;
  const no = `<div class="pago pago--sel v v-no">${cuota ? `${C.cuotas} cuotas de <strong>${cuota}</strong> aprox.` : '<strong>Consultá la cuota</strong>'}</div>`;
  const si = `<div class="pago pago--sel v v-si">${a.entrega ? `Entregás <strong>${entregaFmt(a)}</strong> (${pctFmt(a.pct)}) y el resto te lo financiamos` : `Entregás el <strong>${pctFmt(a.pct)}</strong> y el resto te lo financiamos`}</div>`;
  return ambos + no + si;
}

const metaCard = (a) => [a.version, a.anio, a.sinKm ? '' : a.kmFmt].filter(Boolean).join(' · ');

// Tarjeta del catálogo y de los destacados. Los data-* los usa js/catalogo.js para filtrar y ordenar.
function card(a, i, raiz) {
  const reservado = a.reservado ? '<span class="card__velo"></span><span class="card__reservado">Reservado</span>' : '';
  const sede = a.sede ? `<span class="card__sede">${esc(sedeEtiqueta(a.sede))}</span>` : '';
  return `<a class="card" href="${raiz}${a.ruta}" data-auto data-sede="${esc(a.sede ? a.sede.nombre : '')}" data-tipo="${esc(a.carroceria)}"
 data-comb="${esc(a.combustible)}" data-caja="${esc(a.transmision)}" data-precio="${a.dolares ? Math.round(a.dolares) : ''}"
 data-cuota="${a.cuota || ''}" data-orden="${i}">
<div class="card__media">${foto(a, 0, { raiz, alt: a.titulo + (a.reservado ? ', reservado' : ''), eager: i < 2 })}${reservado}${sede}</div>
<div class="card__body">
<div class="card__cab"><div><div class="card__nombre">${esc(a.nombre)}</div><div class="card__meta">${esc(metaCard(a))}</div></div>
${precioGrande(a, 'card__precio')}</div>
${pagoCard(a)}
</div></a>`;
}

// Botones "No estoy / Estoy" (barra del catálogo y ficha).
function segmento(no, si) {
  return `<button type="button" class="seg__btn" data-clearing-btn="no" aria-pressed="false">${no}</button>` +
    `<button type="button" class="seg__btn" data-clearing-btn="si" aria-pressed="false">${si}</button>`;
}

// ---- Datos estructurados (schema.org) ----

const NEGOCIO_ID = SITIO + '#automotora';
function dealerLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    '@id': NEGOCIO_ID,
    name: NOMBRE,
    description: 'Automotora en Montevideo: autos usados con financiación propia, aunque estés en el clearing. Locales en Bv. Batlle y Ordóñez y Av. Eugenio Garzón.',
    url: SITIO,
    logo: SITIO + 'img/logo.png',
    image: SITIO + 'img/og.jpg',
    telephone: '+' + C.whatsapp,
    sameAs: [C.instagram && instagramUrl(), C.facebook && facebookUrl()].filter(Boolean),
    areaServed: { '@type': 'City', name: 'Montevideo' },
    currenciesAccepted: 'USD, UYU',
    address: { '@type': 'PostalAddress', addressLocality: 'Montevideo', addressCountry: 'UY' },
    department: C.sedes.map((s) => ({
      '@type': 'AutoDealer',
      name: `${NOMBRE} ${s.etiqueta}`,
      telephone: '+' + AS.waDe(s).numero,
      address: { '@type': 'PostalAddress', streetAddress: s.direccion || undefined, addressLocality: 'Montevideo', addressCountry: 'UY' },
      openingHours: s.horarioSchema ? s.horarioSchema.split(',').map((h) => h.trim()) : undefined
    }))
  };
}

function migas(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item }))
  };
}

function autoLd(a) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: [a.marca, a.modelo, a.version, a.anio].filter(Boolean).join(' '),
    url: a.url,
    image: a.fotos.length ? a.fotos.map((f) => SITIO + f.grande) : undefined,
    description: a.descripcion || undefined,
    brand: { '@type': 'Brand', name: a.marca },
    model: a.modelo,
    vehicleConfiguration: a.version || undefined,
    vehicleModelDate: a.anio ? String(a.anio) : undefined,
    bodyType: a.carroceria || undefined,
    fuelType: a.combustible || undefined,
    vehicleTransmission: a.transmision || undefined,
    vehicleEngine: a.motor ? { '@type': 'EngineSpecification', name: a.motor } : undefined,
    color: a.color || undefined,
    numberOfPreviousOwners: a.duenos || undefined,
    mileageFromOdometer: a.sinKm ? undefined : { '@type': 'QuantitativeValue', value: a.km, unitCode: 'KMT' },
    itemCondition: 'https://schema.org/UsedCondition',
    offers: a.precio ? {
      '@type': 'Offer',
      price: a.precio,
      priceCurrency: a.moneda,
      availability: a.reservado ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      url: a.url,
      availableAtOrFrom: a.sede && a.sede.direccion ? { '@type': 'Place', name: `${NOMBRE} ${a.sede.etiqueta}`, address: `${a.sede.direccion}, Montevideo, Uruguay` } : undefined,
      seller: { '@id': NEGOCIO_ID }
    } : undefined
  };
}

// ---- Páginas ----

function generarPaginas() {
  generarInicio();
  generarCatalogo();
  for (const a of AUTOS) generarAuto(a);

  pagina('vende.html', 'vende-tu-auto/', {
    titulo: 'Vendé o permutá tu auto en Montevideo | AutoShop Automotora',
    descripcion: 'Te compramos el auto o lo tomamos como parte de pago. Completá los datos y te llega la cotización por WhatsApp.',
    jsonld: jsonld(migas([['Inicio', SITIO], ['Vendé o permutá', SITIO + 'vende-tu-auto/']])),
    actual: 'vende',
    claseBody: 'con-barra-movil',
    js: ['config', 'common', 'vende']
  });

  generarContacto();

  // 404 (GitHub Pages lo sirve para cualquier URL que no exista, ej. un auto vendido)
  pagina('404.html', '404.html', {
    titulo: 'Página no encontrada | AutoShop Automotora',
    descripcion: 'La página que buscás no existe. Mirá los autos usados de AutoShop en Montevideo.',
    robots: '<meta name="robots" content="noindex">',
    actual: '404',
    pie: '',
    sedes: C.sedes.map((s) => `<span>${esc([AS.waDe(s).label, s.direccion].filter(Boolean).join(' · '))}</span>`).join('\n')
  });

  // Panel del dueño
  pagina('admin.html', 'admin/', {
    titulo: 'Panel · AutoShop Automotora',
    descripcion: 'Panel del dueño de AutoShop Automotora.',
    robots: '<meta name="robots" content="noindex, nofollow">',
    header: '',
    pie: '',
    ic: { camara: icono('camara', 22), galeria: icono('galeria', 22), mas: icono('mas', 18), atras: icono('atras', 22), buscar: icono('buscar', 20) }
  });

  // sitemap.xml y robots.txt
  const urls = [
    [SITIO, HOY, '1.0'],
    [SITIO + 'autos/', HOY, '0.9'],
    ...AUTOS.map((a) => [a.url, a.actualizado, '0.8']),
    [SITIO + 'vende-tu-auto/', HOY, '0.6'],
    [SITIO + 'donde-estamos/', HOY, '0.6']
  ];
  escribir('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([loc, lastmod, prio]) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${prio}</priority></url>`).join('\n') +
    '\n</urlset>\n');
  escribir('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${BASE}admin/\n\nSitemap: ${SITIO}sitemap.xml\n`);
}

function generarInicio() {
  const raiz = './';
  const conFoto = AUTOS.filter((a) => a.fotos.length);
  const hero = conFoto.find((a) => a.destacado) || conFoto[0] || AUTOS[0];
  const destacados = (AUTOS.filter((a) => a.destacado).length ? AUTOS.filter((a) => a.destacado) : AUTOS).slice(0, 4);

  let heroCard;
  if (hero) {
    const cuota = cuotaFmt(hero);
    const lineaNo = cuota ? `${C.cuotas} cuotas de ${cuota} aprox. · 100 % financiado` : `100 % financiado en ${C.cuotas} cuotas · Consultá la cuota`;
    const lineaSi = hero.entrega ? `Entregás ${entregaFmt(hero)} (${pctFmt(hero.pct)}) y el resto te lo financiamos` : `Entregás el ${pctFmt(hero.pct)} y el resto te lo financiamos`;
    const lineaAmbos = `Sin clearing: ${cuota ? `${C.cuotas} cuotas de ${cuota} aprox.` : 'consultá la cuota'} · En clearing: entregás el ${pctFmt(hero.pct)}`;
    heroCard = `<a class="hero-card card" href="${raiz}${hero.ruta}">
<div class="hero-card__media">${foto(hero, 0, { raiz, grande: true, eager: true, sizes: '(max-width: 760px) 100vw, 620px' })}
<div class="hero-card__txt"><div class="hero-card__nombre">${esc(hero.nombre)}</div>${precioGrande(hero, 'hero-card__precio')}</div></div>
<div class="hero-card__pago js-only"><span class="v v-ambos">${esc(lineaAmbos)}</span><span class="v v-no">${esc(lineaNo)}</span><span class="v v-si">${esc(lineaSi)}</span></div>
</a>`;
  } else {
    // Sin autos publicados: invita a consultar por WhatsApp.
    heroCard = `<a class="hero-card hero-card--vacia" href="${esc(AS.waUrl('Hola AutoShop, quiero saber qué autos tienen ahora.'))}">
<div class="hero-card__media"><div class="sin-foto"><img src="${raiz}img/logo.png" alt="" width="160" height="160"></div>
<div class="hero-card__txt"><div class="hero-card__nombre">Entran autos todas las semanas</div><div class="precio-g hero-card__precio">Consultá <span>hoy</span></div></div></div>
<div class="hero-card__pago">Preguntanos por WhatsApp qué autos hay y cómo los pagás.</div>
</a>`;
  }

  // "Financiamos nosotros": el ejemplo sale de un auto real con precio en dólares y cuota cargada.
  const ej = AUTOS.find((a) => a.precio && a.moneda === 'USD' && a.cuota && a.pct === C.entregaPct) || AUTOS.find((a) => a.precio && a.pct === C.entregaPct);
  const otroPct = AUTOS.find((a) => a.pct !== C.entregaPct);
  const finNo = ej && ej.cuota
    ? `Un ${esc(ej.nombre)} de ${esc(ej.precioFmt)} te queda en <strong>${C.cuotas} cuotas de ${cuotaFmt(ej)} aprox.</strong>`
    : `Elegís el auto y lo pagás en ${C.cuotas} cuotas, sin entrega. Consultanos la cuota de cada uno.`;
  const finSi = (ej
    ? `Por el ${ej.cuota ? 'mismo ' + esc(ej.modelo) : esc(ej.nombre) + ' de ' + esc(ej.precioFmt)} entregás <strong>${esc(entregaFmt(ej))}</strong> y financiamos el resto.`
    : `Entregás el ${pctFmt(C.entregaPct)} del precio del auto y financiamos el resto.`) +
    (otroPct ? ` En algunos autos la entrega es distinta: el ${esc(otroPct.nombre)} pide ${pctFmt(otroPct.pct)}.` : '');

  const sedes = C.sedes.map((s) => {
    const n = autosEn(s);
    const wa = AS.waDe(s);
    return `<div class="local">
${n ? `<div class="local__n">${nAutos(n)} en este local</div>` : ''}
<div class="local__dir">${esc(s.direccion || s.etiqueta)}</div>
${s.horario ? `<div class="local__horario">${esc(s.horario)}</div>` : ''}
<div class="local__btns">
<a class="btn btn--wa" href="${esc(AS.waUrl(MSG_GENERICO, wa.numero))}"><span class="solo-esc">WhatsApp&nbsp;</span>${esc(wa.label)}</a>
<a class="btn btn--borde" href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">Cómo llegar</a>
</div></div>`;
  }).join('\n');

  const etiquetas = C.sedes.map((s) => s.etiqueta);
  pagina('index.html', '', {
    titulo: 'Autos usados con financiación propia en Montevideo | AutoShop Automotora',
    descripcion: `Automotora en Montevideo: autos usados financiados en ${C.cuotas} cuotas sin entrega, o con el ${C.entregaPct} % de entrega si estás en el clearing. Locales en ${etiquetas.join(' y ')}.`,
    jsonld: jsonld(dealerLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: NOMBRE, url: SITIO, inLanguage: 'es-UY' }),
    actual: 'inicio',
    claseBody: 'con-barra-movil',
    intro: esc(`Automotora en Montevideo. Autos usados con financiación propia, en ${etiquetas.join(' y en ')}.`),
    pct: C.entregaPct,
    cuotas: C.cuotas,
    heroCard,
    destacados: destacados.length ? `<section class="destacados" aria-labelledby="destacados"><div class="wrap">
<div class="seccion-cab"><h2 id="destacados" class="h2">Destacados</h2><a class="link-fuerte" href="${raiz}autos/"><span class="solo-esc">Ver los ${nAutos(AUTOS.length)}</span><span class="solo-movil">Ver los ${AUTOS.length}</span></a></div>
<div class="grilla grilla--carrusel">${destacados.map((a, i) => card(a, i + 1, raiz)).join('\n')}</div>
</div></section>` : '',
    finNo,
    finSi,
    condiciones: esc(C.condiciones),
    tituloLocales: C.sedes.length === 2 ? 'Dos locales en Montevideo' : 'Dónde estamos',
    tituloLocalesMovil: C.sedes.length === 2 ? 'Dos locales' : 'Dónde estamos',
    sedes
  });
}

function generarCatalogo() {
  const raiz = '../';
  const unicos = (k, orden) => {
    const hay = new Set(AUTOS.map((a) => a[k]).filter(Boolean));
    return [...orden.filter((o) => hay.has(o)), ...[...hay].filter((o) => !orden.includes(o)).sort()];
  };
  const chip = (f, val, label, todos) => `<button type="button" class="chip" data-f="${f}" data-v="${esc(val)}" aria-pressed="${todos ? 'true' : 'false'}">${esc(label)}</button>`;
  const grupo = (f, label, todos, opciones, clase) => opciones.length < 2 && f !== 'sede' && f !== 'precio' ? '' :
    `<fieldset class="filtro ${clase || ''}"><legend>${label}</legend><div class="chips">${chip(f, '', todos, true)}${opciones.map(([v, l]) => chip(f, v, l)).join('')}</div></fieldset>`;
  const sedesOpc = C.sedes.map((s) => [s.nombre, s.etiqueta]);
  const grupos = [
    grupo('sede', 'Sucursal', 'Todas', sedesOpc, 'solo-esc-filtro'),
    grupo('tipo', 'Tipo', 'Todos', unicos('carroceria', AS.OPCIONES.carrocerias).map((x) => [x, x])),
    grupo('comb', 'Combustible', 'Todos', unicos('combustible', AS.OPCIONES.combustibles).map((x) => [x, x])),
    grupo('caja', 'Caja', 'Todas', unicos('transmision', AS.OPCIONES.cajas).map((x) => [x, x])),
    grupo('precio', 'Precio', 'Todos', AS.PRECIOS.map((p) => [p.id, p.label]))
  ].join('\n');
  const hay = AUTOS.length > 0;
  const busca = AS.waUrl('Hola AutoShop, estoy buscando un auto y no lo encontré en la web.');

  pagina('autos.html', 'autos/', {
    titulo: 'Catálogo de autos usados financiados | AutoShop Automotora',
    descripcion: `Autos usados en venta en Montevideo, con financiación propia: ${C.cuotas} cuotas sin entrega o el ${C.entregaPct} % de entrega si estás en el clearing. Filtrá por local, tipo, combustible, caja y precio.`,
    jsonld: jsonld(migas([['Inicio', SITIO], ['Catálogo', SITIO + 'autos/']])),
    actual: 'catalogo',
    js: ['config', 'common', 'catalogo'],
    segmentoEsc: segmento('No estoy', 'Estoy'),
    segmentoMovil: segmento('No', 'Sí'),
    conteo: nAutos(AUTOS.length),
    controles: hay ? '' : ' hidden',
    sedesMovil: `<div class="chips chips--scroll solo-movil">${chip('sede', '', 'Todas', true)}${sedesOpc.map(([v, l]) => chip('sede', v, l)).join('')}</div>`,
    grupos,
    grilla: AUTOS.map((a, i) => card(a, i, raiz)).join('\n'),
    nota: hay ? `<p class="nota js-only">Cuotas en dólares, aproximadas. ${esc(C.condiciones)}</p>` : '',
    // Sin resultados: con autos es "con estos filtros"; sin ningún auto publicado, invita a consultar.
    vacioOculto: hay ? ' hidden' : '',
    vacioTitulo: hay ? 'Con estos filtros no tenemos nada ahora.' : 'Ahora no hay autos publicados en la web.',
    vacioBorrar: hay ? '<button type="button" class="btn btn--blanco js-only" data-limpiar>Borrar filtros</button>' : '',
    busca: esc(busca),
    ic: { filtros: icono('filtros', 20), cerrar: icono('cerrar', 16) }
  });
}

function generarContacto() {
  const raiz = '../';
  const locales = C.sedes.map((s, i) => {
    const n = autosEn(s);
    const wa = AS.waDe(s);
    const filas = [
      s.horario && ['Horario', esc(s.horario).replace(/\n/g, '<br>')],
      ['WhatsApp', `<a href="${esc(AS.waUrl(MSG_GENERICO, wa.numero))}">${esc(wa.label)}</a>`],
      s.telefono && ['Teléfono', `<a href="tel:${esc(s.telefono.replace(/\D/g, ''))}">${esc(s.telefono)}</a>`],
      n && ['En el local', `${nAutos(n)} · <a href="${raiz}autos/?sucursal=${encodeURIComponent(s.nombre)}">ver cuáles</a>`]
    ].filter(Boolean).map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('');
    return `<article class="sucursal" aria-labelledby="suc-${i}">
<div class="sucursal__mapa"><iframe src="https://www.google.com/maps?q=${encodeURIComponent(s.mapa || s.direccion)}&amp;hl=es&amp;output=embed" title="Mapa: ${esc(s.direccion)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
<div class="sucursal__txt">
<h2 id="suc-${i}" class="sucursal__dir">${esc(s.direccion || s.etiqueta)}</h2>
<dl class="sucursal__datos">${filas}</dl>
<div class="local__btns">
<a class="btn btn--wa" href="${esc(AS.waUrl(MSG_GENERICO, wa.numero))}">WhatsApp a este local</a>
<a class="btn btn--borde" href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">Cómo llegar</a>
</div></div></article>`;
  }).join('\n');
  const redes = [
    C.instagram && `<a class="btn btn--blanco" href="${esc(instagramUrl())}" target="_blank" rel="noopener">${icono('instagram', 22)} @${esc(C.instagram)}</a>`,
    C.facebook && `<a class="btn btn--blanco" href="${esc(facebookUrl())}" target="_blank" rel="noopener">Facebook</a>`
  ].filter(Boolean).join('\n');

  pagina('contacto.html', 'donde-estamos/', {
    titulo: 'Dónde estamos: locales en Montevideo | AutoShop Automotora',
    descripcion: `Locales de AutoShop en Montevideo: ${C.sedes.map((s) => s.direccion).filter(Boolean).join(' y ')}. Escribinos por WhatsApp a cada local.`,
    jsonld: jsonld(dealerLd(), migas([['Inicio', SITIO], ['Dónde estamos', SITIO + 'donde-estamos/']])),
    actual: 'donde',
    subtitulo: C.sedes.length === 2 ? 'Dos locales en Montevideo. Cada auto del catálogo te dice en cuál está.' : 'Cada auto del catálogo te dice en qué local está.',
    locales,
    redes: redes ? `<section class="redes" aria-labelledby="redes"><h2 id="redes" class="redes__t">Seguinos</h2>${redes}</section>` : ''
  });
}

function generarAuto(a) {
  const raiz = '../../';
  const fotos = a.fotos;
  const n = fotos.length;
  const principal = n
    ? fotos.map((f, i) => `<img class="galeria__foto" data-i="${i}" src="${esc(raiz + f.grande)}" srcset="${esc(raiz + f.chica)} 640w, ${esc(raiz + f.grande)} 1600w" sizes="(max-width: 760px) 100vw, 860px" alt="${esc(`${a.titulo}, foto ${i + 1}`)}" width="1600" height="1200"${i ? ' hidden loading="lazy"' : ' fetchpriority="high"'} decoding="async">`).join('\n')
    : foto(a, 0, { raiz });
  const flechas = n > 1
    ? `<span class="galeria__contador" aria-live="polite"><span data-actual>1</span> / ${n}</span>
<button type="button" class="galeria__flecha galeria__flecha--izq js-only" data-paso="-1" aria-label="Foto anterior">${icono('atras', 24)}</button>
<button type="button" class="galeria__flecha galeria__flecha--der js-only" data-paso="1" aria-label="Foto siguiente">${icono('adelante', 24)}</button>` : '';
  const thumbs = n > 1
    ? `<div class="galeria__thumbs js-only">${fotos.map((f, i) => `<button type="button" class="galeria__thumb" data-i="${i}" aria-label="Ver foto ${i + 1} de ${n}" aria-current="${i === 0}"><img src="${esc(raiz + f.chica)}" alt="" loading="lazy" width="160" height="120"></button>`).join('')}</div>` : '';

  const datos = [
    ['Año', a.anio || 'A consultar'], ['Kilómetros', a.sinKm ? 'A consultar' : miles(a.km)],
    ['Combustible', a.combustible], ['Caja', a.transmision], ['Tipo', a.carroceria], ['Color', a.color],
    ['Motor', a.motor], ['Dueños', a.duenos]
  ].filter(([, val]) => val !== null && val !== '')
    .map(([l, val]) => `<div><dt>${l}</dt><dd>${esc(val)}</dd></div>`).join('');

  const equipamiento = a.equipamiento.length
    ? `<h2 class="h3">Equipamiento</h2>
<ul class="equipo${a.equipamiento.length > 6 ? ' equipo--corto' : ''}">${a.equipamiento.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
${a.equipamiento.length > 6 ? '<button type="button" class="link-fuerte equipo__mas solo-movil js-only" data-ver-equipo>Ver todo el equipamiento</button>' : ''}` : '';
  const vendedor = a.descripcion ? `<h2 class="h3">Lo que dice el vendedor</h2>\n<blockquote class="vendedor">${esc(a.descripcion).replace(/\n/g, '<br>')}</blockquote>` : '';

  // Mensaje de "Me interesa": texto plano, con el link a la ficha al final. Cambia según "¿Estás en el clearing?".
  const wa = AS.waDe(a.sede);
  const cuota = cuotaFmt(a);
  const base = `Hola AutoShop. Me interesa el ${a.titulo}${a.precio ? ' de ' + a.precioFmt : ''}${a.sede ? ' que está en ' + a.sede.etiqueta : ''}.`;
  const clausula = {
    ambos: '',
    no: cuota ? ` No estoy en el clearing: quiero financiarlo en ${C.cuotas} cuotas (aprox. ${cuota}).` : ` No estoy en el clearing: quiero financiarlo en ${C.cuotas} cuotas. ¿Cuánto me queda la cuota?`,
    si: a.entrega ? ` Estoy en el clearing: puedo entregar el ${pctFmt(a.pct)} (${entregaFmt(a)}).` : ` Estoy en el clearing: puedo entregar el ${pctFmt(a.pct)}.`
  };
  const msg = (k) => `${base}${clausula[k]} ¿Cuándo lo puedo ver?\n${a.url}`;
  const msgAttrs = ['ambos', 'no', 'si'].map((k) => `data-msg-${k}="${esc(msg(k))}"`).join(' ');
  const consulta = AS.waUrl(msg('ambos'), wa.numero);

  const pagoFicha = `<div class="v v-no"><div class="ficha-pago__l">Llevalo 100 % financiado</div>
${cuota ? `<div class="ficha-pago__txt">${C.cuotas} cuotas de</div><div class="ficha-pago__grande">${cuota} <span>aprox.</span></div>` : `<div class="ficha-pago__grande ficha-pago__grande--chica">Consultá la cuota</div><div class="ficha-pago__txt">en ${C.cuotas} cuotas, sin entrega.</div>`}</div>
<div class="v v-si"><div class="ficha-pago__l">Entregando el ${pctFmt(a.pct)}</div>
${a.entrega ? `<div class="ficha-pago__grande">${esc(entregaFmt(a))}</div>` : ''}<div class="ficha-pago__txt">y el resto te lo financiamos.</div></div>
<div class="v v-ambos ficha-pago__ambos">Sin clearing: <strong>${cuota ? `${C.cuotas} cuotas de ${cuota} aprox.` : 'consultá la cuota'}</strong><br>En clearing: <strong>${a.entrega ? `entregás ${esc(entregaFmt(a))}` : `entregás el ${pctFmt(a.pct)}`}</strong> y financiamos el resto.</div>`;
  const miniPago = `<span class="v v-ambos">Financiado</span><span class="v v-no">${cuota ? `${C.cuotas} × ${cuota} aprox.` : 'Consultá la cuota'}</span><span class="v v-si">${a.entrega ? `Entregás ${esc(entregaFmt(a))}` : `Entregás el ${pctFmt(a.pct)}`}</span>`;

  const lugar = a.sede
    ? `<div class="ficha-lugar">${icono('pin', 20)}<div>Está en <strong>${esc(a.sede.direccion || a.sede.etiqueta)}</strong>` +
      `<br>${[`<a href="${esc(AS.waUrl(msg('ambos'), wa.numero))}">${esc(wa.label)}</a>`, a.sede.horario && esc(a.sede.horario)].filter(Boolean).join(' · ')}</div></div>`
    : '';

  // Parecidos: primero la misma carrocería, después el precio más cercano.
  const parecidos = AUTOS.filter((o) => o.id !== a.id)
    .sort((x, y) => (y.carroceria === a.carroceria) - (x.carroceria === a.carroceria) || Math.abs((x.dolares || 0) - (a.dolares || 0)) - Math.abs((y.dolares || 0) - (a.dolares || 0)))
    .slice(0, 3);

  const desc = [a.version, a.anio ? String(a.anio) : '', a.sinKm ? '' : a.kmFmt, a.combustible, a.transmision].filter(Boolean).join(', ');
  pagina('auto.html', a.ruta, {
    titulo: esc(`${a.titulo} · ${a.precioFmt} | AutoShop Automotora`),
    descripcion: esc(`${a.titulo} en venta en Montevideo${desc ? ': ' + desc : ''}. ${a.precio ? a.precioFmt + '. ' : ''}` +
      `Financiado en ${C.cuotas} cuotas o con el ${a.pct} % de entrega si estás en el clearing.${a.sede && a.sede.direccion ? ' Está en ' + a.sede.direccion + '.' : ''}`),
    ogTipo: 'product',
    ogImagen: n ? SITIO + fotos[0].grande : SITIO + 'img/og.jpg',
    jsonld: jsonld(autoLd(a), migas([['Inicio', SITIO], ['Catálogo', SITIO + 'autos/'], [a.titulo, a.url]])),
    actual: 'ficha',
    claseBody: 'con-barra-movil',
    js: ['config', 'common', 'ficha'],
    a: {
      nombre: esc(a.nombre),
      sub: esc([a.version, a.anio, a.kmFmt, a.combustible].filter(Boolean).join(' · ')),
      precio: precioGrande(a, 'ficha-precio__num'),
      precioMini: precioGrande(a, 'barra-ficha__precio'),
      reservado: a.reservado ? '<span class="card__velo"></span><span class="card__reservado">Reservado</span>' : ''
    },
    galeria: { principal, flechas, thumbs },
    datos,
    equipamiento,
    vendedor,
    segmento: segmento('No estoy', 'Estoy'),
    pagoFicha,
    miniPago,
    condiciones: esc(C.condiciones),
    consulta: esc(consulta),
    msgAttrs,
    wa: { href: esc(consulta), label: esc(wa.label), icono: icono('wa', 22), icono30: icono('wa', 30) },
    mensaje: esc(msg('ambos')).replace(/\n/g, '<br>'),
    lugar,
    parecidos: parecidos.length ? `<section class="parecidos" aria-labelledby="parecidos"><h2 id="parecidos" class="h3">Autos parecidos</h2>
<div class="grilla grilla--carrusel">${parecidos.map((o, i) => card(o, i + 10, raiz)).join('\n')}</div></section>` : ''
  });
}

main().catch((e) => {
  console.error('Error: ' + e.message);
  process.exit(1);
});
