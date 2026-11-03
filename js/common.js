// Helpers compartidos. Se usan en el navegador (páginas y panel) y también en scripts/generar.js,
// que arma las páginas con estas mismas funciones. Todo se expone en window.AS.
(function () {
  var C = window.AS_CONFIG;
  var EN_NAVEGADOR = typeof document !== 'undefined';
  var CLAVE_CLEARING = 'autoshop-clearing';

  // Opciones del panel y de los filtros del catálogo.
  var OPCIONES = {
    carrocerias: ['Sedán', 'Hatchback', 'SUV', 'Pick-up', 'Utilitario'],
    combustibles: ['Nafta', 'Diésel', 'Híbrido', 'Eléctrico'],
    cajas: ['Manual', 'Automática'],
    equipamiento: ['Aire acondicionado', 'Dirección asistida', 'Airbags', 'ABS', 'Pantalla multimedia',
      'Cámara de retroceso', 'Vidrios eléctricos', 'Llantas de aleación', 'Sensor de estacionamiento', 'Control crucero']
  };
  // Rangos de precio del catálogo, en dólares.
  var PRECIOS = [
    { id: 'hasta-8000', label: 'Hasta U$S 8.000', min: 0, max: 8000 },
    { id: '8000-12000', label: 'U$S 8.000 a 12.000', min: 8000, max: 12000 },
    { id: 'mas-12000', label: 'Más de U$S 12.000', min: 12000, max: Infinity }
  ];

  // Íconos del diseño (trazo con el color del texto).
  var ICONOS = {
    wa: ['2', '<path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 1c-1.2-.5-2.4-1.7-2.9-2.9l1-1-1-2z"/>'],
    menu: ['2.4', '<path d="M4 7h16M4 12h16M4 17h16"/>'],
    filtros: ['2.4', '<path d="M4 6h16M7 12h10M10 18h4"/>'],
    cerrar: ['3', '<path d="M6 6l12 12M18 6L6 18"/>'],
    instagram: ['2', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>'],
    pin: ['2.2', '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'],
    atras: ['2.6', '<path d="M15 5l-7 7 7 7"/>'],
    adelante: ['2.6', '<path d="M9 5l7 7-7 7"/>'],
    compartir: ['2.2', '<path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7"/>'],
    mas: ['2.4', '<path d="M12 5v14M5 12h14"/>'],
    camara: ['2', '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'],
    galeria: ['2', '<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/>'],
    subir: ['2.6', '<path d="M6 15l6-6 6 6"/>'],
    bajar: ['2.6', '<path d="M6 9l6 6 6-6"/>'],
    borrar: ['2.2', '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'],
    ojo: ['2', '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    buscar: ['2.4', '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'],
    editar: ['2.2', '<path d="M4 20h4L19 9l-4-4L4 16z"/>']
  };
  function icono(nombre, tam) {
    var i = ICONOS[nombre];
    return '<svg aria-hidden="true" width="' + (tam || 20) + '" height="' + (tam || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      i[0] + '" stroke-linecap="round" stroke-linejoin="round">' + i[1] + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // moneda: 'USD' (por defecto) o 'UYU'.
  function signo(moneda) { return moneda === 'UYU' ? '$' : 'U$S'; }
  function precio(monto, moneda) { return monto ? signo(moneda) + ' ' + miles(monto) : 'Consultar'; }
  // Para ordenar y filtrar autos con precios en distintas monedas.
  function enDolares(monto, moneda) { return monto ? (moneda === 'UYU' ? monto / ((C && C.dolar) || 40) : monto) : null; }

  function slug(texto) {
    return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // En la base, `modelo` es modelo + versión ("Aqua S"); la versión sola está en extra.version.
  function partirModelo(r) {
    var version = ((r.extra && r.extra.version) || '').trim();
    var modelo = r.modelo || '';
    if (version && modelo.slice(-version.length - 1).toLowerCase() === (' ' + version).toLowerCase()) {
      modelo = modelo.slice(0, -version.length - 1).trim();
    }
    return { modelo: modelo, version: version };
  }

  function tipoDe(carroceria) {
    return carroceria === 'Pick-up' ? 'camioneta' : carroceria === 'Utilitario' ? 'utilitario' : 'auto';
  }

  function sede(nombre) {
    return (C.sedes || []).filter(function (s) { return s.nombre === nombre; })[0] || null;
  }
  // WhatsApp de un local (si no tiene uno propio, el general).
  function waDe(s) {
    return s && s.whatsapp ? { numero: s.whatsapp, label: s.whatsappLabel || s.whatsapp } : { numero: C.whatsapp, label: C.whatsappLabel };
  }
  function waUrl(texto, numero) {
    return 'https://wa.me/' + (numero || C.whatsapp) + (texto ? '?text=' + encodeURIComponent(texto) : '');
  }

  // "095 407 252", "+598 95 407 252" o "2303 6119" → { whatsapp: '59895407252', telefono: '095 407 252' }.
  function telefonoUY(texto) {
    var d = String(texto || '').replace(/\D/g, '');
    if (d.indexOf('598') === 0) d = d.slice(3);
    if (d.charAt(0) === '0') d = d.slice(1);
    if (!/^[0-9]{8}$/.test(d)) return null;
    var telefono = d.charAt(0) === '9' ? '0' + d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5) : d.slice(0, 4) + ' ' + d.slice(4);
    return { whatsapp: '598' + d, telefono: telefono };
  }

  // ---- Navegador ----

  // "¿Estás en el clearing?": 'no', 'si' o null (sin elegir). Se recuerda en el navegador.
  // El CSS muestra la variante que corresponde según <html data-clearing>.
  function leerClearing() {
    try {
      var c = localStorage.getItem(CLAVE_CLEARING);
      return c === 'no' || c === 'si' ? c : null;
    } catch (e) { return null; }
  }
  function ponerClearing(c) {
    try {
      if (c) localStorage.setItem(CLAVE_CLEARING, c);
      else localStorage.removeItem(CLAVE_CLEARING);
    } catch (e) { /* sin almacenamiento: vale solo para esta página */ }
    pintarClearing(c);
  }
  function pintarClearing(c) {
    var html = document.documentElement;
    if (c) html.setAttribute('data-clearing', c);
    else html.removeAttribute('data-clearing');
    document.querySelectorAll('[data-clearing-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-clearing-btn') === c));
    });
    document.dispatchEvent(new CustomEvent('clearing', { detail: c }));
  }

  if (EN_NAVEGADOR) {
    document.addEventListener('DOMContentLoaded', function () {
      pintarClearing(leerClearing());
    });
    document.addEventListener('click', function (e) {
      // Tocar la opción ya elegida la desmarca (vuelve a mostrar las dos formas de pago).
      var b = e.target.closest('[data-clearing-btn]');
      if (b) {
        var c = b.getAttribute('data-clearing-btn');
        ponerClearing(leerClearingActual() === c ? null : c);
        return;
      }
      var t = e.target.closest('.menu-btn');
      if (t) {
        var abierto = document.body.classList.toggle('menu-abierto');
        t.setAttribute('aria-expanded', String(abierto));
      } else if (e.target.closest('.menu a')) {
        document.body.classList.remove('menu-abierto');
      }
    });
  }
  function leerClearingActual() { return document.documentElement.getAttribute('data-clearing'); }

  window.AS = {
    config: C, OPCIONES: OPCIONES, PRECIOS: PRECIOS,
    icono: icono, esc: esc, miles: miles, signo: signo, precio: precio, enDolares: enDolares, slug: slug,
    partirModelo: partirModelo, tipoDe: tipoDe, sede: sede, waDe: waDe, waUrl: waUrl, telefonoUY: telefonoUY,
    clearing: leerClearingActual
  };
})();
