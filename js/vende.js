// "Vendé o permutá tu auto": arma el mensaje de WhatsApp con lo que se completa y lo muestra como vista previa.
// No guarda nada: todo va por WhatsApp.
(function () {
  var AS = window.AS;
  var form = document.getElementById('f-vende');
  if (!form) return;
  var previa = document.querySelector('[data-previa]');
  var cual = document.querySelector('[data-cual]');
  var elegido = { deuda: 'No tiene', busca: 'Otro auto del catálogo' };

  function t(nombre, vacio) {
    var v = form.elements[nombre].value.trim();
    return v || vacio;
  }
  function armar() {
    var busca = elegido.busca === 'Otro auto del catálogo' ? 'Otro auto' + (t('cual', '') ? ': ' + t('cual', '') : '') : elegido.busca;
    var km = t('km', '');
    if (/^\d+$/.test(km)) km = AS.miles(Number(km));
    return 'Hola AutoShop, quiero ' + (elegido.busca === 'Plata' ? 'vender' : 'permutar') + ' mi auto.\n' +
      '• Auto: ' + [t('marca', '[marca]'), t('modelo', '[modelo]'), t('anio', '[año]')].join(' ') + '\n' +
      '• Km: ' + (km || '[km]') + '\n' +
      '• Deuda: ' + elegido.deuda + '\n' +
      '• Busco a cambio: ' + busca + '\n' +
      '• Nombre: ' + t('nombre', '[tu nombre]') + '\n' +
      '• Celular: ' + t('celular', '[tu celular]') + '\n' +
      '¿Me pasan una cotización?';
  }
  function pintar() {
    var m = armar();
    previa.textContent = m;
    cual.hidden = elegido.busca !== 'Otro auto del catálogo';
    // Los [corchetes] de lo que falta completar no van en el mensaje.
    var limpio = m.split('\n').filter(function (l) { return !/\[(marca|modelo|año|km|tu nombre|tu celular)\]$/.test(l) || /^• Auto: /.test(l); })
      .join('\n').replace(/ ?\[(marca|modelo|año)\]/g, '');
    document.querySelectorAll('[data-enviar]').forEach(function (a) { a.href = AS.waUrl(limpio); });
  }

  form.addEventListener('input', pintar);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  document.querySelectorAll('[data-grupo]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      elegido[g.dataset.grupo] = b.textContent;
      g.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      pintar();
    });
  });
  pintar();
})();
