// Panel del dueño (/admin/): login, lista de autos, alta/edición/baja, fotos y datos del negocio.
// Los permisos los pone el esquema de la Plataforma Automotoras: solo los emails de la tabla admins
// de esta automotora pueden escribir. La web pública no lee de acá en vivo: scripts/generar.js la
// regenera cuando se guarda algo (y cada 15 minutos si hubo cambios).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const C = window.AS_CONFIG;
const AS = window.AS;
const BUCKET = 'fotos';
// Base compartida: esta web solo ve y edita los autos de su automotora.
const CONCESIONARIA = C.concesionaria;
const $ = (s) => document.querySelector(s);
const esc = AS.esc;

const form = $('#f-auto');
const fNegocio = $('#f-negocio');
const sb = createClient(C.supabaseUrl, C.supabaseKey);
let autos = [];
let filtro = 'todos';
// Editor: auto que se edita (null = nuevo), fotos actuales (rutas en el bucket),
// las subidas en esta edición (se borran si se cancela) y las quitadas (se borran al guardar).
let actual = null;
let fotos = [];
let nuevas = [];
let quitadas = [];
let subiendo = 0;
let negocio = null;

const ESTADOS = [['disponible', 'Disponible'], ['reservado', 'Reservado'], ['vendido', 'Vendido']];
const sedeEtiqueta = (nombre) => (AS.sede(nombre) || {}).etiqueta || '';
const titulo = (a) => [a.marca, AS.partirModelo(a).modelo, a.anio].filter(Boolean).join(' ');

iniciar();

async function iniciar() {
  llenarOpciones();
  const { data } = await sb.auth.getSession();
  $('#cargando').hidden = true;
  if (data.session) await entrar();
  else vista('login');
}

// GitHub Pages deja que el navegador guarde cada página 10 minutos: desde el panel,
// los links a la web agregan ?v=<hora> para abrir siempre lo recién publicado.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-fresco]');
  if (!a) return;
  const url = new URL(a.href, location.href);
  url.searchParams.set('v', Date.now());
  a.href = url.toString();
});

function vista(nombre) {
  document.body.dataset.vista = nombre;
  $('#v-login').hidden = nombre !== 'login';
  $('#app').hidden = nombre === 'login';
  const tab = nombre === 'negocio' ? 'negocio' : 'lista';
  document.querySelectorAll('.p-tab').forEach((t) => {
    if (t.dataset.ir === tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  $('#titulo-movil').textContent = nombre === 'negocio' ? 'Datos del negocio' : 'Mis autos';
  window.scrollTo(0, 0);
}

function aviso(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { t.hidden = true; }, 5000);
}

function error(el, texto) {
  el.textContent = texto || '';
  el.hidden = !texto;
  if (texto) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Chips (radios y checkboxes con forma de botón) de las opciones del editor.
function chips(nombre, opciones, tipo = 'radio') {
  return opciones.map(([valor, label]) =>
    `<label><input type="${tipo}" name="${nombre}" value="${esc(valor)}"><span>${esc(label)}</span></label>`).join('');
}
function llenarOpciones() {
  const pares = (lista) => lista.map((x) => [x, x]);
  const lugar = (k, html) => { document.querySelector(`[data-chips="${k}"]`).innerHTML = html; };
  lugar('combustible', chips('combustible', pares(AS.OPCIONES.combustibles)));
  lugar('transmision', chips('transmision', pares(AS.OPCIONES.cajas)));
  lugar('carroceria', chips('carroceria', pares(AS.OPCIONES.carrocerias)));
  lugar('sede', chips('sede', [...C.sedes.map((s) => [s.nombre, s.etiqueta]), ['', 'Sin indicar']]));
  lugar('moneda', chips('moneda', [['USD', 'U$S'], ['UYU', '$']]));
  lugar('estado', chips('estado', ESTADOS));
  $('#marcas').innerHTML = ['Chevrolet', 'Citroën', 'Fiat', 'Ford', 'Honda', 'Hyundai', 'Kia', 'Lifan', 'Nissan', 'Peugeot', 'Renault', 'Suzuki', 'Toyota', 'Volkswagen']
    .map((m) => `<option value="${m}">`).join('');
  document.querySelector('[data-cuotas]').textContent = C.cuotas;
  $('#neg-sedes').innerHTML = C.sedes.map((s, i) => `
    <section class="p-caja p-caja--sede">
      <h2 class="p-h3">Local ${esc(s.etiqueta)}</h2>
      <label class="p-campo">Dirección<input name="direccion-${i}" placeholder="Ej.: Av. Italia 1234" autocomplete="off"></label>
      <div class="p-grid">
        <label class="p-campo">WhatsApp<input name="whatsapp-${i}" type="tel" inputmode="tel" placeholder="Vacío = el principal" autocomplete="off"></label>
        <label class="p-campo">Teléfono fijo<input name="telefono-${i}" type="tel" inputmode="tel" placeholder="Opcional" autocomplete="off"></label>
      </div>
      <label class="p-campo">Horarios<textarea name="horario-${i}" rows="2" placeholder="Ej.: Lunes a viernes de 9 a 19 h&#10;Sábados de 9 a 13 h"></textarea></label>
    </section>`).join('');
}

// ---- Login ----

$('#f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  error($('#login-error'));
  const { error: err } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  if (err) return error($('#login-error'), 'Email o contraseña incorrectos.');
  await entrar();
});

$('#olvide').addEventListener('click', () => { $('#olvide-txt').hidden = false; });

async function entrar() {
  const { data: puede } = await sb.rpc('puede_editar', { c: CONCESIONARIA });
  if (!puede) {
    await sb.auth.signOut();
    vista('login');
    return error($('#login-error'), 'Este usuario no tiene permiso para editar AutoShop. Hay que agregarlo en la tabla admins de Supabase.');
  }
  await cargarLista();
  vista('lista');
}

$('#salir').addEventListener('click', async () => {
  await sb.auth.signOut();
  vista('login');
});

document.addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir]');
  if (ir) {
    if (ir.dataset.ir === 'negocio') abrirNegocio();
    else cerrarEditor();
  }
  if (e.target.closest('[data-nuevo]')) abrir(null);
});

// ---- Lista ----

async function cargarLista() {
  const [{ data, error: err }] = await Promise.all([
    sb.from('autos').select('*').eq('concesionaria', CONCESIONARIA).order('created_at', { ascending: false }),
    leerPublicacion()
  ]);
  if (err) return aviso('No se pudo cargar la lista: ' + err.message);
  autos = data;
  pintarLista();
}

// Cuándo se generó la web publicada (estado.json lo escribe scripts/generar.js).
// Un auto modificado después de eso todavía no se ve en la web.
let publicadoEn = null;
async function leerPublicacion() {
  try {
    const r = await fetch(C.sitio + 'estado.json?t=' + Date.now(), { cache: 'no-store' });
    publicadoEn = r.ok ? new Date((await r.json()).generado) : null;
  } catch {
    publicadoEn = null;
  }
}
const pendiente = (a) => publicadoEn && new Date(a.updated_at) > publicadoEn;

// Mientras haya cambios sin publicar, se vuelve a mirar cada 20 segundos.
let revision;
function revisarPublicacion() {
  clearTimeout(revision);
  if (!autos.some(pendiente)) return;
  revision = setTimeout(async () => {
    await leerPublicacion();
    pintarLista();
  }, 20000);
}

function urlFoto(ruta, chica) {
  return sb.storage.from(BUCKET).getPublicUrl(chica ? ruta.replace(/\.jpg$/, '_m.jpg') : ruta).data.publicUrl;
}

const FILTROS = [['todos', 'Todos'], ['disponible', 'Disponibles'], ['reservado', 'Reservados'], ['vendido', 'Vendidos'], ['oculto', 'Ocultos']];
const enFiltro = (a, f) => f === 'todos' || (f === 'oculto' ? !a.publicado : a.estado === f);

function pintarLista() {
  const cuantos = (f) => autos.filter((a) => enFiltro(a, f)).length;
  $('#resumen').textContent = `${cuantos('disponible')} disponibles · ${cuantos('reservado')} reservados · ${cuantos('vendido')} vendidos`;
  $('#filtro').innerHTML = FILTROS.filter(([f]) => f === 'todos' || f === 'disponible' || cuantos(f))
    .map(([f, l]) => `<button type="button" data-f="${f}" aria-pressed="${f === filtro}">${l} <small>${cuantos(f)}</small></button>`).join('');
  const q = AS.slug($('#buscar').value);
  const lista = autos.filter((a) => enFiltro(a, filtro) && (!q || AS.slug(a.marca + ' ' + a.modelo).includes(q)));
  $('#lista').innerHTML = lista.map((a) => {
    const x = a.extra || {};
    const media = a.fotos.length ? `<img src="${esc(urlFoto(a.fotos[0], true))}" alt="" loading="lazy">` : '';
    const chipsItem = [
      pendiente(a) && '<span class="p-chip p-chip--warn">Publicándose en la web…</span>',
      !a.publicado && '<span class="p-chip">Oculto</span>',
      !a.fotos.length && '<span class="p-chip p-chip--warn">Sin fotos</span>'
    ].filter(Boolean).join('');
    const sub = [sedeEtiqueta(x.sede), x.version, x.cuota ? `${C.cuotas} × $ ${AS.miles(x.cuota)}` : ''].filter(Boolean).join(' · ');
    return `<article class="p-item${actual && actual.id === a.id ? ' p-item--activo' : ''}" data-id="${a.id}">
      <div class="p-item__cab">
        <div class="p-item__foto">${media}${a.destacado ? '<span class="p-item__dest">Destacado</span>' : ''}</div>
        <div>
          <div class="p-item__nombre">${esc(titulo(a))}</div>
          <div class="p-item__precio">${esc(AS.precio(a.precio, a.moneda))}</div>
          ${sub ? `<div class="p-item__sub">${esc(sub)}</div>` : ''}
          ${chipsItem ? `<div class="p-item__chips">${chipsItem}</div>` : ''}
        </div>
      </div>
      <div class="p-estados" role="group" aria-label="Estado de ${esc(titulo(a))}">
        ${ESTADOS.map(([v, l]) => `<button type="button" data-estado="${v}" aria-pressed="${a.estado === v}">${l}</button>`).join('')}
      </div>
      <div class="p-item__acciones">
        <button type="button" data-editar>${AS.icono('editar', 18)} Editar</button>
        <button type="button" data-destacar>${a.destacado ? 'Quitar de destacados' : 'Destacar en inicio'}</button>
      </div>
    </article>`;
  }).join('') || `<p class="p-nota">${autos.length ? 'No hay autos con ese filtro.' : 'Todavía no cargaste ningún auto. Tocá "Agregar auto" para empezar.'}</p>`;
  revisarPublicacion();
}

$('#filtro').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  filtro = b.dataset.f;
  pintarLista();
});
$('#buscar').addEventListener('input', pintarLista);

// Cambios rápidos desde la lista: estado y destacado.
$('#lista').addEventListener('click', async (e) => {
  const item = e.target.closest('.p-item');
  if (!item) return;
  const a = autos.find((x) => String(x.id) === item.dataset.id);
  const est = e.target.closest('[data-estado]');
  if (est && est.dataset.estado !== a.estado) {
    const cambio = { estado: est.dataset.estado, extra: conFechaDeVenta(a.extra, est.dataset.estado) };
    if (cambio.estado === 'vendido' && !confirm(`¿Marcar ${titulo(a)} como vendido? Sale de la web.`)) return;
    await actualizar(a, cambio, cambio.estado === 'vendido' ? 'Marcado como vendido: sale de la web en un par de minutos.' : 'Listo. En un par de minutos se ve en la web.');
  } else if (e.target.closest('[data-destacar]')) {
    await actualizar(a, { destacado: !a.destacado }, a.destacado ? 'Ya no aparece en el inicio.' : 'Va a aparecer en el inicio.');
  } else if (e.target.closest('[data-editar]')) {
    abrir(a);
  }
});

async function actualizar(a, cambio, texto) {
  const { error: err } = await sb.from('autos').update(cambio).eq('id', a.id);
  if (err) return aviso('No se pudo guardar: ' + err.message);
  aviso(texto);
  await cargarLista();
}

// La fecha de venta (extra.vendido_el) la pone el panel al marcarlo vendido.
function conFechaDeVenta(extra, estado) {
  const x = Object.assign({}, extra);
  if (estado === 'vendido') x.vendido_el = x.vendido_el || new Date().toISOString().slice(0, 10);
  else delete x.vendido_el;
  return x;
}

// ---- Datos del negocio ----
// Se guardan en la tabla `negocios`; al publicar pisan a config.js en toda la web (scripts/generar.js).
// Cada local va en extra.sedes; las columnas direccion y horario llevan un resumen de los locales.

async function abrirNegocio() {
  error($('#neg-error'));
  const { data, error: err } = await sb.from('negocios').select('*').eq('concesionaria', CONCESIONARIA).maybeSingle();
  if (err) return aviso('No se pudieron leer los datos del negocio: ' + err.message);
  negocio = data;
  // Sin fila todavía: se muestra lo que hoy publica la web (config.js).
  const el = fNegocio.elements;
  const x = (data && data.extra) || {};
  el.whatsapp.value = (data && data.telefono) || C.whatsappLabel || '';
  el.instagram.value = (data ? data.instagram : C.instagram) || '';
  el.facebook.value = (data ? data.facebook : C.facebook) || '';
  el.entrega_pct.value = x.entrega_pct || C.entregaPct || '';
  el.condiciones.value = typeof x.condiciones === 'string' ? x.condiciones : C.condiciones || '';
  const sedes = x.sedes || {};
  C.sedes.forEach((s, i) => {
    const d = sedes[s.nombre] || {};
    const val = (k) => (typeof d[k] === 'string' ? d[k] : s[k] || '');
    el[`direccion-${i}`].value = val('direccion');
    el[`whatsapp-${i}`].value = val('whatsappLabel');
    el[`telefono-${i}`].value = val('telefono');
    el[`horario-${i}`].value = val('horario');
  });
  vista('negocio');
}

fNegocio.addEventListener('submit', async (e) => {
  e.preventDefault();
  error($('#neg-error'));
  const el = fNegocio.elements;
  const tel = AS.telefonoUY(el.whatsapp.value);
  if (!tel) return error($('#neg-error'), 'El WhatsApp principal tiene que ser un número de Uruguay, por ejemplo 099 123 456.');
  const pct = el.entrega_pct.value.replace(/\D/g, '');
  if (pct && (Number(pct) < 1 || Number(pct) > 100)) return error($('#neg-error'), 'La entrega en clearing tiene que ser un porcentaje entre 1 y 100.');
  const sedes = {};
  for (const [i, s] of C.sedes.entries()) {
    const texto = el[`whatsapp-${i}`].value.trim();
    const wa = texto ? AS.telefonoUY(texto) : { whatsapp: '', telefono: '' };
    if (!wa) return error($('#neg-error'), `El WhatsApp del local ${s.etiqueta} tiene que ser un número de Uruguay, por ejemplo 099 123 456.`);
    sedes[s.nombre] = {
      direccion: el[`direccion-${i}`].value.trim(),
      horario: el[`horario-${i}`].value.trim(),
      whatsapp: wa.whatsapp,
      whatsappLabel: wa.telefono,
      telefono: el[`telefono-${i}`].value.trim()
    };
  }
  const resumen = (k) => C.sedes.filter((s) => sedes[s.nombre][k]).map((s) => `${s.etiqueta}: ${sedes[s.nombre][k]}`).join(' · ').replace(/\n/g, ' ').slice(0, 200) || null;
  const extra = Object.assign({}, negocio && negocio.extra, { sedes, condiciones: el.condiciones.value.trim() });
  if (pct) extra.entrega_pct = Number(pct);
  else delete extra.entrega_pct;
  const fila = {
    concesionaria: CONCESIONARIA,
    ...tel,
    // Usuario de Instagram: sirve también si pegan el link del perfil.
    instagram: el.instagram.value.trim().replace(/^.*instagram\.com\//, '').replace(/[/?#].*$/, '').replace(/^@/, '') || null,
    facebook: el.facebook.value.trim() || null,
    direccion: resumen('direccion'),
    horario: resumen('horario'),
    extra
  };
  document.querySelectorAll('[data-guardar-negocio]').forEach((b) => { b.disabled = true; });
  const { error: err } = await sb.from('negocios').upsert(fila, { onConflict: 'concesionaria' });
  document.querySelectorAll('[data-guardar-negocio]').forEach((b) => { b.disabled = false; });
  if (err) return error($('#neg-error'), 'No se pudo guardar: ' + err.message);
  negocio = fila;
  Object.assign(C, { whatsapp: tel.whatsapp, whatsappLabel: tel.telefono, instagram: fila.instagram || '', facebook: fila.facebook || '', entregaPct: extra.entrega_pct || C.entregaPct });
  C.sedes = C.sedes.map((s) => Object.assign({}, s, sedes[s.nombre]));
  aviso('Guardado. En un par de minutos se actualiza en toda la web.');
  vista('lista');
});

// ---- Editor ----

const TEXTOS = ['marca', 'color', 'motor', 'descripcion'];
const RADIOS = ['combustible', 'transmision', 'carroceria', 'sede', 'moneda', 'estado'];

function marcar(nombre, valor) {
  for (const r of form.querySelectorAll(`[name="${nombre}"]`)) r.checked = r.value === (valor == null ? '' : String(valor));
}
function elegido(nombre) {
  const r = form.querySelector(`[name="${nombre}"]:checked`);
  return r ? r.value : '';
}

function pintarEquipo(lista) {
  const todos = [...AS.OPCIONES.equipamiento, ...lista.filter((x) => !AS.OPCIONES.equipamiento.includes(x))];
  $('#equipo').innerHTML = chips('equipo', todos.map((x) => [x, x]), 'checkbox');
  for (const c of form.querySelectorAll('[name="equipo"]')) c.checked = lista.includes(c.value);
}

function abrir(a) {
  actual = a;
  form.reset();
  error($('#ed-error'));
  fotos = a ? a.fotos.slice() : [];
  nuevas = [];
  quitadas = [];
  const el = form.elements;
  const x = (a && a.extra) || {};
  if (a) {
    for (const k of TEXTOS) el[k].value = a[k] == null ? '' : a[k];
    const { modelo, version } = AS.partirModelo(a);
    el.modelo.value = modelo;
    el.version.value = version;
    el.anio.value = a.anio || '';
    // Km vacío = "a consultar" (extra.sin_km); si no, se muestra aunque sea 0.
    el.km.value = x.sin_km ? '' : AS.miles(a.km || 0);
    el.duenos.value = a.duenos || '';
    el.precio.value = a.precio ? AS.miles(a.precio) : '';
    el.cuota.value = x.cuota ? AS.miles(x.cuota) : '';
    el.entrega_pct.value = x.entrega_pct || '';
    el.destacado.checked = !!a.destacado;
    el.publicado.checked = a.publicado !== false;
  }
  marcar('combustible', a ? a.combustible : 'Nafta');
  marcar('transmision', a ? a.transmision : 'Manual');
  marcar('carroceria', a ? a.carroceria || '' : 'Sedán');
  marcar('sede', a ? x.sede || '' : C.sedes[0].nombre);
  marcar('moneda', a ? a.moneda : 'USD');
  marcar('estado', a ? a.estado : 'disponible');
  el.entrega_pct.placeholder = `Vacío = ${C.entregaPct} (el general)`;
  pintarEquipo(a ? a.equipamiento || [] : []);
  $('#ed-titulo').textContent = a ? 'Editar: ' + titulo(a) : 'Agregar auto';
  const enWeb = a && a.publicado && a.estado !== 'vendido';
  $('#ed-ver').hidden = !enWeb;
  if (enWeb) $('#ed-ver').href = C.sitio + 'autos/' + a.slug + '/';
  $('#borrar').hidden = !a;
  $('#guardar').textContent = a ? 'Guardar cambios' : 'Publicar auto';
  $('#ed-vacio').hidden = true;
  form.hidden = false;
  pintarFotos();
  ayudaPrecio();
  pintarLista();
  vista('editor');
}

async function cerrarEditor() {
  // Las fotos subidas en esta edición no quedaron en ningún auto: se borran.
  await borrarArchivos(nuevas);
  nuevas = [];
  actual = null;
  form.hidden = true;
  $('#ed-vacio').hidden = false;
  pintarLista();
  vista('lista');
}
document.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', cerrarEditor));

// Cómo se va a ver en la web lo que se carga en "Precio y financiación".
function ayudaPrecio() {
  const el = form.elements;
  const cuota = Number(el.cuota.value.replace(/\D/g, ''));
  const pct = Number(el.entrega_pct.value.replace(/\D/g, '')) || C.entregaPct;
  const precio = Number(el.precio.value.replace(/\D/g, ''));
  const entrega = precio ? ` (${AS.precio(Math.round((precio * pct) / 100), elegido('moneda'))})` : '';
  $('#ayuda-precio').textContent = `En la web se ve: "${cuota ? `${C.cuotas} cuotas de $ ${AS.miles(cuota)} aprox.` : 'Consultá la cuota'}" o "entregando el ${pct} %${entrega}".`;
}
form.addEventListener('input', (e) => {
  if (['precio', 'cuota', 'entrega_pct', 'moneda'].includes(e.target.name)) ayudaPrecio();
});

$('#equipo-agregar').addEventListener('click', () => {
  const nuevo = $('#equipo-otro').value.trim();
  if (!nuevo) return;
  const lista = [...form.querySelectorAll('[name="equipo"]:checked')].map((c) => c.value);
  if (!lista.includes(nuevo)) lista.push(nuevo);
  pintarEquipo(lista);
  $('#equipo-otro').value = '';
});
$('#equipo-otro').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('#equipo-agregar').click();
  }
});

const digitos = (v) => (String(v).replace(/\D/g, '') ? Number(String(v).replace(/\D/g, '')) : null);

function datosDelForm() {
  const el = form.elements;
  const t = (k) => el[k].value.trim();
  const fila = {};
  for (const k of TEXTOS) fila[k] = t(k) || null;
  // `modelo` en la base es modelo + versión; la versión sola queda en extra.version.
  fila.modelo = [t('modelo'), t('version')].filter(Boolean).join(' ');
  fila.anio = digitos(t('anio'));
  fila.km = digitos(t('km'));
  fila.duenos = digitos(t('duenos'));
  fila.precio = digitos(t('precio'));
  fila.combustible = elegido('combustible') || 'Nafta';
  fila.transmision = elegido('transmision') || 'Manual';
  fila.carroceria = elegido('carroceria') || null;
  fila.tipo = AS.tipoDe(fila.carroceria);
  fila.moneda = elegido('moneda') || 'USD';
  fila.estado = elegido('estado') || 'disponible';
  fila.destacado = el.destacado.checked;
  fila.publicado = el.publicado.checked;
  fila.equipamiento = [...form.querySelectorAll('[name="equipo"]:checked')].map((c) => c.value);
  // Se conservan los datos de extra que este panel no maneja.
  const extra = conFechaDeVenta(actual && actual.extra, fila.estado);
  const poner = (k, v) => { if (v === null || v === '') delete extra[k]; else extra[k] = v; };
  poner('version', t('version'));
  poner('sede', elegido('sede'));
  poner('cuota', digitos(t('cuota')));
  poner('entrega_pct', digitos(t('entrega_pct')));
  if (fila.km === null) {
    fila.km = 0;
    extra.sin_km = true;
  } else delete extra.sin_km;
  fila.extra = extra;
  fila.fotos = fotos;
  return fila;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error($('#ed-error'));
  if (subiendo) return error($('#ed-error'), 'Esperá a que terminen de subir las fotos.');
  const fila = datosDelForm();
  const falta = ['marca', 'modelo'].filter((k) => !fila[k]);
  if (falta.length) return error($('#ed-error'), 'Completá: ' + falta.join(' y ') + '.');
  const max = new Date().getFullYear() + 1;
  if (fila.anio !== null && (fila.anio < 1950 || fila.anio > max)) return error($('#ed-error'), `El año tiene que estar entre 1950 y ${max}.`);
  if (fila.extra.entrega_pct && (fila.extra.entrega_pct < 1 || fila.extra.entrega_pct > 100)) return error($('#ed-error'), 'La entrega en clearing tiene que ser un porcentaje entre 1 y 100.');

  $('#guardar').disabled = true;
  // El slug es la URL del auto (/autos/<slug>/): marca-modelo-año. Se mantiene mientras no cambien
  // esos datos; si cambian, se actualiza. Si ya existe otro igual, se le agrega -2, -3...
  const base = AS.slug([fila.marca, fila.modelo, fila.anio].filter(Boolean).join(' '));
  const mismo = actual && (actual.slug === base || (actual.slug.startsWith(base + '-') && /^-\d+$/.test(actual.slug.slice(base.length))));
  let err;
  for (let n = 1; n < 20; n++) {
    const slug = mismo ? actual.slug : n === 1 ? base : `${base}-${n}`;
    ({ error: err } = actual
      ? await sb.from('autos').update({ ...fila, slug }).eq('id', actual.id)
      : await sb.from('autos').insert({ ...fila, slug, concesionaria: CONCESIONARIA }));
    if (!err || err.code !== '23505' || mismo) break;
  }
  $('#guardar').disabled = false;
  if (err) return error($('#ed-error'), 'No se pudo guardar: ' + err.message);

  await borrarArchivos(quitadas);
  nuevas = [];
  aviso('Guardado. En un par de minutos se ve en la web.');
  await cargarLista();
  await cerrarEditor();
});

$('#borrar').addEventListener('click', async () => {
  if (!confirm(`¿Borrar ${titulo(actual)} y sus fotos para siempre?\n\nSi se vendió, mejor cambiá el estado a "Vendido".`)) return;
  const { error: err } = await sb.from('autos').delete().eq('id', actual.id);
  if (err) return error($('#ed-error'), 'No se pudo borrar: ' + err.message);
  await borrarArchivos([...actual.fotos, ...nuevas]);
  nuevas = [];
  aviso('Auto borrado.');
  await cargarLista();
  await cerrarEditor();
});

// ---- Fotos ----

function pintarFotos() {
  $('#fotos').innerHTML = fotos.map((ruta, i) => `
    <li class="p-foto">
      <img src="${esc(urlFoto(ruta, true))}" alt="Foto ${i + 1}">
      <div class="p-foto__medio">${i === 0 ? '<span class="p-foto__portada">Portada</span>' : `<button type="button" class="p-foto__hacer" data-accion="portada" data-i="${i}">Hacer portada</button>`}</div>
      <div class="p-foto__flechas">
        <button type="button" data-accion="subir" data-i="${i}" aria-label="Subir la foto ${i + 1}"${i === 0 ? ' disabled' : ''}>${AS.icono('subir', 22)}</button>
        <button type="button" data-accion="bajar" data-i="${i}" aria-label="Bajar la foto ${i + 1}"${i === fotos.length - 1 ? ' disabled' : ''}>${AS.icono('bajar', 22)}</button>
      </div>
      <button type="button" class="p-foto__borrar" data-accion="quitar" data-i="${i}" aria-label="Quitar la foto ${i + 1}">${AS.icono('borrar', 22)}</button>
    </li>`).join('');
}

$('#fotos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const i = Number(b.dataset.i);
  const accion = b.dataset.accion;
  if (accion === 'quitar') quitadas.push(...fotos.splice(i, 1));
  else if (accion === 'portada') fotos.unshift(...fotos.splice(i, 1));
  else {
    const j = accion === 'subir' ? i - 1 : i + 1;
    [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
  }
  pintarFotos();
});

// Dos entradas: la galería (varias a la vez) y la cámara del celular (una por vez, se sube al sacarla).
for (const id of ['#f-fotos', '#f-camara']) {
  $(id).addEventListener('change', (e) => {
    const archivos = [...e.target.files];
    e.target.value = '';
    subirFotos(archivos);
  });
}

async function subirFotos(archivos) {
  const estado = $('#subiendo');
  subiendo += archivos.length;
  $('#guardar').disabled = true;
  let hechas = 0;
  for (const archivo of archivos) {
    estado.hidden = false;
    estado.textContent = `Subiendo foto ${++hechas} de ${archivos.length}…`;
    try {
      const ruta = `${CONCESIONARIA}/${crypto.randomUUID()}.jpg`;
      const img = await decodificar(archivo);
      const [grande, chica] = await Promise.all([achicar(img, 1600, 0.82), achicar(img, 640, 0.78)]);
      for (const [r, blob] of [[ruta, grande], [ruta.replace(/\.jpg$/, '_m.jpg'), chica]]) {
        const { error: err } = await sb.storage.from(BUCKET).upload(r, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (err) throw err;
      }
      fotos.push(ruta);
      nuevas.push(ruta);
      pintarFotos();
    } catch (err) {
      aviso(`No se pudo subir ${archivo.name}: ${err.message || err}`);
    }
    subiendo--;
  }
  estado.hidden = true;
  if (!subiendo) $('#guardar').disabled = false;
}

// Recorta la foto a 4:3 (al centro) y la achica a JPG de ~200 KB: la web muestra todas las fotos en 4:3.
async function achicar(img, max, calidad) {
  const ancho = img.width;
  const alto = img.height;
  let sw = ancho;
  let sh = alto;
  if (ancho / alto > 4 / 3) sw = Math.round((alto * 4) / 3);
  else sh = Math.round((ancho * 3) / 4);
  const k = Math.min(1, max / sw);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k);
  c.height = Math.round(sh * k);
  c.getContext('2d').drawImage(img, (ancho - sw) / 2, (alto - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', calidad));
  if (!blob) throw new Error('formato de imagen no soportado');
  return blob;
}

// createImageBitmap con orientación no anda en todos los Safari: si falla, se usa un <img>
// (los navegadores ya lo giran según la foto).
async function decodificar(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(archivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function borrarArchivos(rutas) {
  if (!rutas.length) return;
  await sb.storage.from(BUCKET).remove(rutas.flatMap((r) => [r, r.replace(/\.jpg$/, '_m.jpg')]));
}
