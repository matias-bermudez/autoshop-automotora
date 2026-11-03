// Datos del negocio. Los campos vacíos no se muestran en la web.
// Después de cambiar algo hay que publicar (push a main): el sitio se regenera solo.
//
// Lo que el dueño carga en el panel (Datos del negocio → tabla `negocios` de Supabase) pisa a estos valores
// al publicar: WhatsApp, Instagram, Facebook, condiciones, entrega en clearing y los datos de cada local.
//
// whatsapp: el número general de la web; se cambia desde el panel (Datos del negocio).
window.AS_CONFIG = {
  whatsapp: '59891969322',      // código de país + número, sin 0 ni espacios
  whatsappLabel: '091 969 322',
  instagram: 'autoshop.uy',     // usuario, sin @
  facebook: '',                 // link o usuario de la página
  dolar: 40,                    // pesos por dólar, aproximado: solo para ordenar y filtrar autos en distintas monedas

  // Financiación ("¿Estás en el clearing?"). La cuota de cada auto la carga el dueño en el panel (extra.cuota, en U$S).
  cuotas: 60,                   // cantidad de cuotas de la financiación sin clearing
  entregaPct: 50,               // entrega para quien está en el clearing, en % del precio (cada auto puede tener otro)
  condiciones: 'Sujetas a aprobación. Consultá requisitos y condiciones por WhatsApp.',

  // Locales. `nombre` es lo que se guarda en cada auto (extra.sede) y en negocios.extra.sedes.
  // whatsapp/whatsappLabel vacíos = se usa el WhatsApp general. `mapa`: lo que se busca en Google Maps.
  // horarioSchema: el mismo horario para Google, ej: 'Mo-Fr 09:00-19:00, Sa 09:00-13:00'.
  sedes: [
    { nombre: 'Batlle', etiqueta: 'Batlle y Ordóñez', direccion: 'Bv. Batlle y Ordóñez 4786', horario: '', horarioSchema: '', whatsapp: '', whatsappLabel: '', telefono: '', mapa: 'Bulevar Batlle y Ordoñez 4786, Montevideo, Uruguay' },
    { nombre: 'Garzón', etiqueta: 'Eugenio Garzón', direccion: 'Av. Eugenio Garzón 187', horario: '', horarioSchema: '', whatsapp: '', whatsappLabel: '', telefono: '', mapa: 'Avenida Eugenio Garzón 187, Montevideo, Uruguay' }
  ],

  // Supabase: base compartida de la Plataforma Automotoras. `concesionaria` = id de esta automotora en la base.
  // La clave es la pública (publishable): puede ir en el código, los permisos los pone el esquema.
  supabaseUrl: 'https://dfunhdfvtmsmjdzpnhas.supabase.co',
  supabaseKey: 'sb_publishable_4Q-GxNAtPB894PRurMLwkQ_2NRVIjWg',
  concesionaria: 'autoshop',

  // URL pública del sitio, con / al final. Si se compra dominio, cambiarla acá.
  sitio: 'https://matias-bermudez.github.io/autoshop-automotora/',

  // false = Google no indexa la web (meta noindex). Pasar a true recién al lanzar.
  indexar: false
};
