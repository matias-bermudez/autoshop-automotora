// Ficha del auto: galería, compartir, "Ver todo el equipamiento" y el mensaje de "Me interesa",
// que cambia según "¿Estás en el clearing?" (los tres textos vienen armados en data-msg-*).
(function () {
  var AS = window.AS;

  // ---- Galería ----
  var fotos = Array.prototype.slice.call(document.querySelectorAll('.galeria__foto'));
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.galeria__thumb'));
  var actual = document.querySelector('[data-actual]');
  var i = 0;
  function ver(n) {
    if (!fotos.length) return;
    i = (n + fotos.length) % fotos.length;
    fotos.forEach(function (f, k) {
      f.hidden = k !== i;
      if (k === i) f.removeAttribute('loading');
    });
    thumbs.forEach(function (t, k) { t.setAttribute('aria-current', String(k === i)); });
    if (actual) actual.textContent = i + 1;
    if (thumbs[i]) thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-paso]');
    if (p) return ver(i + Number(p.dataset.paso));
    var t = e.target.closest('.galeria__thumb');
    if (t) return ver(Number(t.dataset.i));
    if (e.target.closest('[data-ver-equipo]')) {
      document.querySelector('.equipo').classList.remove('equipo--corto');
      e.target.closest('[data-ver-equipo]').remove();
    }
  });
  var marco = document.querySelector('.galeria__marco');
  if (marco && fotos.length > 1) {
    marco.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') ver(i - 1);
      if (e.key === 'ArrowRight') ver(i + 1);
    });
    // Deslizar con el dedo.
    var x0 = null;
    marco.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    marco.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) ver(i + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  }

  // ---- Compartir (celular) ----
  var compartir = document.querySelector('[data-compartir]');
  if (compartir) {
    compartir.addEventListener('click', function () {
      var datos = { title: document.title, url: location.href.split('?')[0] };
      if (navigator.share) navigator.share(datos).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(datos.url).then(function () { compartir.setAttribute('aria-label', 'Link copiado'); });
    });
  }

  // ---- Mensaje de "Me interesa" ----
  function mensaje(c) {
    var k = c === 'no' || c === 'si' ? c : 'ambos';
    document.querySelectorAll('[data-me-interesa]').forEach(function (a) {
      a.href = a.href.split('?')[0] + '?text=' + encodeURIComponent(a.getAttribute('data-msg-' + k));
    });
    var burbuja = document.querySelector('[data-mensaje]');
    if (burbuja) burbuja.innerHTML = AS.esc(burbuja.getAttribute('data-msg-' + k)).replace(/\n/g, '<br>');
  }
  document.addEventListener('clearing', function (e) { mensaje(e.detail); });
  mensaje(AS.clearing());
})();
