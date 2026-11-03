// Autos de EJEMPLO para probar la web en local, con el mismo formato que devuelve Supabase (tabla autos).
// No se publican: la web publicada usa solo los autos de la base.
//
//   node scripts/generar.js --local --ejemplos
//
// Las fotos se toman de ejemplos/fotos/ (en vez del bucket de Supabase).
// Datos propios de AutoShop en `extra`: version, sede ('Batlle' | 'Garzón'), cuota (U$S por mes, 60 cuotas),
// entrega_pct (si es distinta a la general), sin_km (km a consultar).
window.AS_EJEMPLOS = [
  {
    id: 1, slug: 'honda-civic', created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z',
    marca: 'Honda', modelo: 'Civic', anio: null, km: 0, tipo: 'auto', carroceria: 'Sedán',
    combustible: 'Nafta', transmision: 'Automática', motor: null, color: 'Gris', duenos: null,
    precio: 16900, moneda: 'USD', etiqueta: null, destacado: true, estado: 'disponible', publicado: true,
    acepta_permuta: true, equipamiento: ['Llantas negras'], descripcion: null,
    fotos: ['honda-civic.jpg'],
    extra: { sede: 'Batlle', cuota: 375, sin_km: true }
  },
  {
    id: 2, slug: 'toyota-aqua-2018', created_at: '2026-10-30T12:00:00Z', updated_at: '2026-10-30T12:00:00Z',
    marca: 'Toyota', modelo: 'Aqua S', anio: 2018, km: 85000, tipo: 'auto', carroceria: 'Hatchback',
    combustible: 'Híbrido', transmision: 'Automática', motor: '1.5', color: 'Blanco', duenos: 2,
    precio: 12900, moneda: 'USD', etiqueta: null, destacado: true, estado: 'disponible', publicado: true,
    acepta_permuta: true, equipamiento: ['Aire acondicionado', 'Dirección asistida', 'Airbags', 'ABS', 'Vidrios eléctricos', 'Pantalla multimedia', 'Cámara de retroceso'],
    descripcion: 'Auto de ejemplo para probar la web en local.',
    fotos: ['toyota-aqua.jpg'],
    extra: { version: 'S', sede: 'Batlle', cuota: 298 }
  },
  {
    id: 3, slug: 'lifan-320-2012', created_at: '2026-10-28T12:00:00Z', updated_at: '2026-10-28T12:00:00Z',
    marca: 'Lifan', modelo: '320', anio: 2012, km: 120000, tipo: 'auto', carroceria: 'Hatchback',
    combustible: 'Nafta', transmision: 'Manual', motor: '1.3', color: null, duenos: null,
    precio: 4900, moneda: 'USD', etiqueta: null, destacado: false, estado: 'reservado', publicado: true,
    acepta_permuta: true, equipamiento: [], descripcion: null,
    fotos: [],
    extra: { sede: 'Garzón', entrega_pct: 60 }
  }
];
