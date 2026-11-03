// Catálogo (/autos/): filtros y orden sobre las tarjetas que ya vienen en el HTML.
// Los filtros quedan en la URL (?sucursal=Batlle&tipo=Sedán&combustible=Nafta&caja=Manual&precio=hasta-8000&orden=menor).
(function () {
  var AS = window.AS;
  var grilla = document.querySelector('[data-grilla]');
  if (!grilla) return;
  var cards = Array.prototype.slice.call(grilla.querySelectorAll('[data-auto]'));
  var orden = document.querySelector('[data-orden]');
  // Clave interna → parámetro de la URL.
  var PARAMS = { sede: 'sucursal', tipo: 'tipo', comb: 'combustible', caja: 'caja', precio: 'precio' };
  var f = { sede: '', tipo: '', comb: '', caja: '', precio: '' };

  var url = new URLSearchParams(location.search);
  Object.keys(PARAMS).forEach(function (k) {
    var v = url.get(PARAMS[k]) || '';
    if (document.querySelector('[data-f="' + k + '"][data-v="' + CSS.escape(v) + '"]')) f[k] = v;
  });
  if (orden && url.get('orden') && orden.querySelector('option[value="' + CSS.escape(url.get('orden')) + '"]')) orden.value = url.get('orden');

  function rango(id) { return AS.PRECIOS.filter(function (p) { return p.id === id; })[0]; }
  function etiqueta(k, v) {
    var b = document.querySelector('[data-f="' + k + '"][data-v="' + CSS.escape(v) + '"]');
    return b ? b.textContent : v;
  }
  // ¿El auto cumple el filtro k?
  function cumple(c, k) {
    var d = c.dataset;
    if (!f[k]) return true;
    if (k === 'precio') {
      var r = rango(f.precio);
      return d.precio !== '' && Number(d.precio) > r.min && Number(d.precio) <= r.max;
    }
    return d[k] === f[k];
  }
  function pasa(c) { return Object.keys(f).every(function (k) { return cumple(c, k); }); }
  // Sin precio o sin cuota: al final.
  function num(c, k) { return c.dataset[k] === '' ? Infinity : Number(c.dataset[k]); }
  function ordenar(lista) {
    var o = orden ? orden.value : 'recientes';
    return lista.slice().sort(function (a, b) {
      if (o === 'menor') return num(a, 'precio') - num(b, 'precio');
      if (o === 'mayor') return (a.dataset.precio === '') - (b.dataset.precio === '') || Number(b.dataset.precio) - Number(a.dataset.precio);
      if (o === 'cuota') return num(a, 'cuota') - num(b, 'cuota');
      return Number(a.dataset.orden) - Number(b.dataset.orden);
    });
  }

  function aplicar() {
    var visibles = 0;
    ordenar(cards).forEach(function (c) {
      var ok = pasa(c);
      c.hidden = !ok;
      if (ok) visibles++;
      grilla.appendChild(c);
    });
    document.querySelectorAll('[data-f]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(f[b.dataset.f] === b.dataset.v));
    });
    var conteo = visibles === 1 ? '1 auto' : visibles + ' autos';
    document.querySelectorAll('[data-conteo]').forEach(function (el) { el.textContent = conteo; });
    var activos = Object.keys(f).filter(function (k) { return f[k]; });
    var nOtros = activos.filter(function (k) { return k !== 'sede'; }).length;
    var n = document.querySelector('[data-n-filtros]');
    if (n) n.textContent = nOtros ? ' (' + nOtros + ')' : '';
    pintarActivos(activos);

    var vacio = document.querySelector('[data-vacio]');
    if (cards.length) vacio.hidden = visibles > 0;
    var nota = document.querySelector('.nota');
    if (nota) nota.hidden = visibles === 0;
    pintarParecido(visibles === 0 && cards.length);
    avisame(activos);

    var q = new URLSearchParams();
    activos.forEach(function (k) { q.set(PARAMS[k], f[k]); });
    if (orden && orden.value !== 'recientes') q.set('orden', orden.value);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  }

  // Celular: los filtros elegidos, con una cruz para sacarlos.
  function pintarActivos(activos) {
    var cont = document.querySelector('[data-activos]');
    if (!cont) return;
    var otros = activos.filter(function (k) { return k !== 'sede'; });
    cont.hidden = !otros.length;
    cont.innerHTML = otros.map(function (k) {
      var l = AS.esc(etiqueta(k, f[k]));
      return '<span class="chip-activo">' + l + '<button type="button" data-quitar="' + k + '" aria-label="Quitar filtro ' + l + '">' + AS.icono('cerrar', 16) + '</button></span>';
    }).join('');
  }

  // Sin resultados: el auto que coincide en más filtros.
  function pintarParecido(mostrar) {
    var cont = document.querySelector('[data-parecido]');
    if (!cont) return;
    var viejo = cont.querySelector('.mini');
    if (viejo) viejo.remove();
    cont.hidden = !mostrar;
    if (!mostrar) return;
    var mejor = cards.map(function (c) {
      return { c: c, puntos: Object.keys(f).filter(function (k) { return cumple(c, k); }).length };
    }).sort(function (a, b) { return b.puntos - a.puntos || Number(a.c.dataset.orden) - Number(b.c.dataset.orden); })[0].c;
    var img = mejor.querySelector('.card__media img');
    var sede = mejor.querySelector('.card__sede');
    var meta = [mejor.dataset.caja, sede && sede.textContent].filter(Boolean).join(' · ');
    var a = document.createElement('a');
    a.className = 'mini';
    a.href = mejor.getAttribute('href');
    a.innerHTML = (img ? '<img src="' + AS.esc(img.getAttribute('src')) + '" alt="' + AS.esc(img.alt) + '">' : '<span class="mini__sin"></span>') +
      '<div class="mini__txt"><div class="mini__nombre">' + mejor.querySelector('.card__nombre').innerHTML + '</div>' +
      '<div class="mini__meta">' + AS.esc(meta) + '</div>' + mejor.querySelector('.precio-g').outerHTML + '</div>';
    cont.appendChild(a);
  }
  // "Avisame por WhatsApp" con lo que se está buscando.
  function avisame(activos) {
    var a = document.querySelector('[data-avisame]');
    if (!a) return;
    var que = activos.map(function (k) { return k === 'sede' ? 'en ' + etiqueta(k, f[k]) : etiqueta(k, f[k]); });
    a.href = AS.waUrl('Hola AutoShop, estoy buscando un auto' + (que.length ? ' (' + que.join(', ') + ')' : '') +
      ' y no lo encontré en la web. ¿Me avisan cuando entre uno?');
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]');
    if (b) {
      var k = b.dataset.f;
      f[k] = f[k] === b.dataset.v ? '' : b.dataset.v;
      return aplicar();
    }
    var q = e.target.closest('[data-quitar]');
    if (q) {
      f[q.dataset.quitar] = '';
      return aplicar();
    }
    if (e.target.closest('[data-limpiar]')) {
      Object.keys(f).forEach(function (k) { f[k] = ''; });
      return aplicar();
    }
    var abrir = e.target.closest('[data-abrir-filtros]');
    if (abrir || e.target.closest('[data-cerrar-filtros]')) {
      var abierto = abrir ? document.body.classList.toggle('filtros-abiertos') : document.body.classList.remove('filtros-abiertos');
      document.querySelectorAll('[data-abrir-filtros]').forEach(function (x) { x.setAttribute('aria-expanded', String(!!abierto)); });
    }
  });
  if (orden) orden.addEventListener('change', aplicar);

  if (cards.length) aplicar();
})();
