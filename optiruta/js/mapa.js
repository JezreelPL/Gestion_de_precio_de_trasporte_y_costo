/**
 * MÓDULO: Interacción con el mapa (Leaflet) para OptiRuta
 * --------------------------------------------------------
 * Responsabilidad de este archivo: todo lo relacionado con Leaflet,
 * el buscador de lugares, el modal de captura de datos, el cálculo
 * de distancias reales, y mostrar el resultado sobre el mapa.
 *
 * Este archivo SÍ depende de vogel.js (lo importa para resolver),
 * pero vogel.js nunca depende de este archivo — así, el algoritmo
 * puro se mantiene reutilizable e independiente de la interfaz.
 */

import { solveVogel } from './vogel.js';

// ---------- ESTADO DEL MÓDULO ----------
let map = null;
let bodegas = [];        // { nombre, lat, lng, oferta, marker }
let destinos = [];       // { nombre, lat, lng, demanda, marker }
let rutasDibujadas = []; // líneas del resultado anterior, para poder borrarlas
let puntoPendiente = null; // coordenada + tipo mientras el modal está abierto

// ---------- INICIALIZACIÓN DEL MAPA ----------
export function inicializarMapa() {
  // Centrado en Quetzaltenango, Guatemala, como punto de partida razonable
  map = L.map('map').setView([14.8347, -91.5181], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  // Clic directo en el mapa: usa la coordenada exacta donde se hizo clic
  map.on('click', function (e) {
    agregarPunto(e.latlng.lat, e.latlng.lng);
  });

  // Buscador de lugares (usa el mismo servicio gratuito de OpenStreetMap, sin API key).
  // defaultMarkGeocode:false para que NO ponga su propio marcador genérico;
  // en vez de eso, usamos nuestra misma función agregarPunto para mantener
  // consistencia (mismo ícono, mismo popup, mismo registro en bodegas/destinos).
  L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: 'Buscar un lugar (ej. Quetzaltenango)...',
    collapsed: false,
  })
    .on('markgeocode', function (e) {
      const centro = e.geocode.center;
      map.setView(centro, 14);
      agregarPunto(centro.lat, centro.lng, e.geocode.name);
    })
    .addTo(map);
}

/** Leaflet necesita "despertar" cuando su contenedor pasa de hidden a visible */
export function refrescarMapa() {
  if (map) setTimeout(() => map.invalidateSize(), 100);
}

// ---------- MODAL: agregar bodega o destino ----------

/**
 * Abre el formulario propio (modal) para pedir nombre y cantidad,
 * ya sea que la coordenada venga de un clic directo en el mapa
 * o de un resultado del buscador.
 * nombreSugerido (opcional): nombre que propone el buscador, editable por el usuario.
 */
function agregarPunto(lat, lng, nombreSugerido) {
  const tipo = document.querySelector('input[name="tipoMarcador"]:checked').value;
  puntoPendiente = { lat, lng, tipo };

  document.getElementById('modalTitulo').textContent =
    tipo === 'bodega' ? '📦 Agregar bodega (origen)' : '🏬 Agregar destino';
  document.getElementById('modalLabelCantidad').textContent =
    tipo === 'bodega' ? 'Oferta disponible (unidades)' : 'Demanda requerida (unidades)';
  document.getElementById('modalNombre').value = nombreSugerido || '';
  document.getElementById('modalCantidad').value = '';
  document.getElementById('modalError').classList.add('hidden');

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('modalNombre').focus();
}

export function cancelarModal() {
  puntoPendiente = null;
  document.getElementById('modalOverlay').classList.add('hidden');
}

export function confirmarModal() {
  const nombre = document.getElementById('modalNombre').value.trim();
  const cantidad = Number(document.getElementById('modalCantidad').value);
  const errorEl = document.getElementById('modalError');

  if (!nombre) {
    errorEl.textContent = 'Escribe un nombre.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (isNaN(cantidad) || cantidad <= 0) {
    errorEl.textContent = 'Ingresa una cantidad válida, mayor a 0.';
    errorEl.classList.remove('hidden');
    return;
  }

  const { lat, lng, tipo } = puntoPendiente;
  const icono = tipo === 'bodega' ? '📦' : '🏬';
  const marker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup(`${icono} <b>${nombre}</b><br>${tipo === 'bodega' ? 'Oferta' : 'Demanda'}: ${cantidad}`);

  const registro = { nombre, lat, lng, marker };
  if (tipo === 'bodega') {
    registro.oferta = cantidad;
    bodegas.push(registro);
  } else {
    registro.demanda = cantidad;
    destinos.push(registro);
  }

  actualizarListaMarcadores();
  document.getElementById('modalOverlay').classList.add('hidden');
  puntoPendiente = null;
}

// ---------- REINICIAR / LISTAR MARCADORES ----------

export function reiniciarMapa() {
  bodegas.forEach(b => map.removeLayer(b.marker));
  destinos.forEach(d => map.removeLayer(d.marker));
  limpiarRutas();
  bodegas = [];
  destinos = [];
  actualizarListaMarcadores();
  document.getElementById('resultArea').classList.add('hidden');
}

function limpiarRutas() {
  rutasDibujadas.forEach(r => map.removeLayer(r));
  rutasDibujadas = [];
}

function actualizarListaMarcadores() {
  const contenedor = document.getElementById('listaMarcadores');
  if (bodegas.length === 0 && destinos.length === 0) {
    contenedor.innerHTML = 'Aún no has agregado ninguna bodega ni destino.';
    return;
  }
  let html = '<div class="grid grid-cols-2 gap-4">';
  html += '<div><p class="font-medium mb-1">📦 Bodegas</p><ul class="list-disc pl-5">';
  bodegas.forEach(b => html += `<li>${b.nombre} — oferta: ${b.oferta}</li>`);
  html += '</ul></div>';
  html += '<div><p class="font-medium mb-1">🏬 Destinos</p><ul class="list-disc pl-5">';
  destinos.forEach(d => html += `<li>${d.nombre} — demanda: ${d.demanda}</li>`);
  html += '</ul></div></div>';
  contenedor.innerHTML = html;
}

// ---------- CÁLCULO DE DISTANCIA REAL ----------

/** Distancia entre dos coordenadas (fórmula de Haversine), en kilómetros */
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------- RESOLVER (calcular costos + correr Vogel) ----------

export function resolverMapa() {
  if (bodegas.length === 0 || destinos.length === 0) {
    alert('Agrega al menos una bodega y un destino antes de resolver.');
    return;
  }

  const tarifa = Number(document.getElementById('tarifaKm').value) || 1;

  const supply = bodegas.map(b => b.oferta);
  const demand = destinos.map(d => d.demanda);
  const costs = bodegas.map(b =>
    destinos.map(d => Math.round(distanciaKm(b.lat, b.lng, d.lat, d.lng) * tarifa * 100) / 100)
  );

  const resultado = solveVogel(supply, demand, costs);
  const nombresOrigen = bodegas.map(b => b.nombre);
  const nombresDestino = destinos.map(d => d.nombre);

  mostrarMatrizCostos(costs, nombresOrigen, nombresDestino, tarifa);
  mostrarResultadoMapa(resultado, nombresOrigen, nombresDestino);
  dibujarRutas(resultado.allocation);
}

function mostrarMatrizCostos(costs, nombresOrigen, nombresDestino, tarifa) {
  let html = `<p class="text-sm text-slate-500 mb-2">
    Costos calculados (distancia en línea recta × Q${tarifa}/km):
  </p>`;
  html += '<table class="border-collapse w-full text-sm mb-4">';
  html += '<tr><th class="border p-2 bg-slate-100"></th>';
  nombresDestino.forEach(n => html += `<th class="border p-2 bg-slate-100">${n}</th>`);
  html += '</tr>';
  costs.forEach((fila, i) => {
    html += `<tr><td class="border p-2 bg-slate-100 font-medium">${nombresOrigen[i]}</td>`;
    fila.forEach(costo => html += `<td class="border p-2 text-center">${costo}</td>`);
    html += '</tr>';
  });
  html += '</table>';
  document.getElementById('costMatrixContent').innerHTML = html;
  document.getElementById('resultArea').classList.remove('hidden');
}

function dibujarRutas(allocation) {
  limpiarRutas();
  for (let i = 0; i < allocation.length; i++) {
    for (let j = 0; j < allocation[i].length; j++) {
      if (allocation[i][j] > 0 && bodegas[i] && destinos[j]) {
        const linea = L.polyline(
          [[bodegas[i].lat, bodegas[i].lng], [destinos[j].lat, destinos[j].lng]],
          { color: '#059669', weight: 3 }
        ).addTo(map).bindPopup(`${bodegas[i].nombre} → ${destinos[j].nombre}: ${allocation[i][j]} unidades`);
        rutasDibujadas.push(linea);
      }
    }
  }
}

/**
 * Muestra la tabla de asignación óptima.
 * Se exporta también, para que transporte.html pueda reutilizarla
 * si en algún momento se necesita desde fuera de este módulo.
 */
export function mostrarResultadoMapa(resultado, nombresOrigen, nombresDestino) {
  const { allocation, totalCost, balanced } = resultado;

  let html = '';
  if (balanced) {
    html += `<p class="text-amber-600 text-sm mb-3">
      ⚠ La oferta y demanda no coincidían, se agregó una fila/columna ficticia con costo 0 para balancear.
    </p>`;
  }

  html += '<table class="border-collapse w-full text-sm mb-4">';
  html += '<tr><th class="border p-2 bg-slate-100"></th>';
  for (let j = 0; j < allocation[0].length; j++) {
    const nombre = nombresDestino[j] || `Destino ${j + 1}`;
    html += `<th class="border p-2 bg-slate-100">${nombre}</th>`;
  }
  html += '</tr>';

  for (let i = 0; i < allocation.length; i++) {
    const nombreFila = nombresOrigen[i] || `Bodega ${i + 1}`;
    html += `<tr><td class="border p-2 bg-slate-100 font-medium">${nombreFila}</td>`;
    for (let j = 0; j < allocation[i].length; j++) {
      const val = allocation[i][j];
      html += `<td class="border p-2 text-center ${val > 0 ? 'bg-emerald-50 font-semibold' : ''}">
        ${val > 0 ? val : '-'}
      </td>`;
    }
    html += '</tr>';
  }
  html += '</table>';

  html += `<p class="text-lg font-bold text-slate-800">Costo total mínimo: ${totalCost}</p>`;

  // Si el usuario vino desde Simplex, cerramos la narrativa mostrando
  // la ganancia neta (lo que se ganó al producir, menos lo que costó distribuir).
  // Solo LEE sessionStorage; si no hay nada guardado, este bloque no hace nada.
  const conclusionSimplex = construirConclusionSimplex(totalCost);
  if (conclusionSimplex) html += conclusionSimplex;

  document.getElementById('resultContent').innerHTML = html;
  document.getElementById('resultArea').classList.remove('hidden');
}

// Copia en memoria del resumen de Simplex, para que la conclusión final
// (al resolver) lo siga teniendo disponible aunque ya se haya borrado
// de sessionStorage al mostrarse el banner una sola vez.
let resumenSimplexCache = null;

/**
 * Lee el resumen de Simplex guardado en sessionStorage UNA SOLA VEZ:
 * lo borra inmediatamente de sessionStorage (para que no reaparezca
 * en una recarga o una visita posterior) y lo guarda en memoria
 * (resumenSimplexCache) para que construirConclusionSimplex() lo
 * pueda seguir usando más adelante, dentro de esta misma visita.
 * Devuelve el objeto de datos, o null si no había nada guardado.
 */
export function consumirResumenSimplex() {
  const guardado = sessionStorage.getItem('simplexResumen');
  if (!guardado) return null;

  sessionStorage.removeItem('simplexResumen'); // se borra de inmediato, se muestra solo una vez

  try {
    resumenSimplexCache = JSON.parse(guardado);
  } catch (e) {
    resumenSimplexCache = null;
  }
  return resumenSimplexCache;
}

/**
 * Si hay un resumen de Simplex en memoria (cargado antes por
 * consumirResumenSimplex), arma un párrafo de conclusión conectando
 * producción + transporte. Devuelve null si no hay nada (comportamiento normal).
 */
function construirConclusionSimplex(costoTransporte) {
  if (!resumenSimplexCache) return null;
  const datos = resumenSimplexCache;

  const gananciaNeta = Math.round((datos.ganancia - costoTransporte) * 100) / 100;

  return `
    <div class="mt-4 pt-4 border-t border-slate-200">
      <p class="text-sm font-semibold text-slate-700 mb-1">🧩 Conclusión del proceso completo</p>
      <p class="text-sm text-slate-600">
        Produjiste ${datos.textoProduccion}, generando una ganancia de ${datos.ganancia}.
        Distribuirlo entre tus destinos costó ${costoTransporte}.
        <b>Ganancia neta estimada: ${gananciaNeta}.</b>
      </p>
    </div>
  `;
}