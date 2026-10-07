// ========================================================
// MUNICIPALIDAD DE LA PLATA - REAL-TIME DASHBOARD LOGIC
// Design Theme: Monochrome Greys & White on Canvas
// ========================================================

const API_BASE = '';
let charts = {};
let previousLatestEventId = null;

// Currency Formatter
function formatARS(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$ 0';
  return '$ ' + Number(amount).toLocaleString('es-AR');
}

// Date Formatter
function formatDate(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${hours}:${mins} hs (${day}/${month})`;
}

// Area Badge CSS Class Helper
function getAreaTagClass(area) {
  if (!area) return 'tag-general';
  if (area.includes('147')) return 'tag-reclamos';
  if (area.includes('APR')) return 'tag-apr';
  if (area.includes('Faltas') || area.includes('Multas')) return 'tag-faltas';
  if (area.includes('Turnos')) return 'tag-turnos';
  if (area.includes('Turismo')) return 'tag-turismo';
  return 'tag-general';
}

// Clock logic
function initClock() {
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-AR', { hour12: false });
    const dateStr = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    const el = document.getElementById('timeString');
    if (el) el.textContent = `${dateStr}, ${timeStr}`;
  }
  update();
  setInterval(update, 1000);
}

// Chart.js Configuration matching clean monochrome grey & white palette
Chart.defaults.color = '#475569';
Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
Chart.defaults.font.size = 11;

function initCharts() {
  // 1. Area Distribution (Doughnut - Escala de Grises y Blanco)
  const ctxArea = document.getElementById('areaChart').getContext('2d');
  charts.area = new Chart(ctxArea, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
        borderWidth: 3,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, font: { size: 11, weight: '600' }, color: '#334155', padding: 14 }
        }
      },
      cutout: '68%'
    }
  });

  // 2. Reclamos 147 por Tipología (Bar - Gris Carbón Tecnológico)
  const ctxReclamos = document.getElementById('reclamosChart').getContext('2d');
  charts.reclamos = new Chart(ctxReclamos, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Cantidad de Reclamos',
        data: [],
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        hoverBackgroundColor: '#0f172a',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { font: { weight: '600' }, color: '#475569' }
        },
        y: { 
          grid: { color: '#f1f5f9' }, 
          beginAtZero: true,
          ticks: { font: { weight: '600' }, color: '#475569' }
        }
      }
    }
  });

  // 3. Hourly Traffic (Line / Area - Blanco & Gris Oscuro)
  const ctxHourly = document.getElementById('hourlyChart').getContext('2d');
  const gradientHourly = ctxHourly.createLinearGradient(0, 0, 0, 260);
  gradientHourly.addColorStop(0, 'rgba(15, 23, 42, 0.18)');
  gradientHourly.addColorStop(1, 'rgba(15, 23, 42, 0.01)');

  charts.hourly = new Chart(ctxHourly, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Mensajes Procesados / Hora',
        data: [],
        borderColor: '#0f172a',
        backgroundColor: gradientHourly,
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#0f172a',
        pointBorderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { font: { weight: '600' }, color: '#475569' }
        },
        y: { 
          grid: { color: '#f1f5f9' }, 
          beginAtZero: true,
          ticks: { font: { weight: '600' }, color: '#475569' }
        }
      }
    }
  });

  // 4. Vecinos vs Turistas (Pie - Gris Carbón vs Gris Plata)
  const ctxUserType = document.getElementById('userTypeChart').getContext('2d');
  charts.userType = new Chart(ctxUserType, {
    type: 'pie',
    data: {
      labels: ['Vecinos / Residentes', 'Turistas / Visitantes'],
      datasets: [{
        data: [0, 0],
        backgroundColor: ['#0f172a', '#94a3b8'],
        borderWidth: 3,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, padding: 14, font: { weight: '600' }, color: '#334155' } }
      }
    }
  });

  // 5. Localidades / Delegaciones (Horizontal Bar - Escala de Grises)
  const ctxLocalidades = document.getElementById('localidadesChart').getContext('2d');
  charts.localidades = new Chart(ctxLocalidades, {
    type: 'bar',
    indexAxis: 'y',
    data: {
      labels: [],
      datasets: [{
        label: 'Interacciones por Zona',
        data: [],
        backgroundColor: 'rgba(71, 85, 105, 0.85)',
        hoverBackgroundColor: '#334155',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { 
          grid: { color: '#f1f5f9' }, 
          beginAtZero: true,
          ticks: { font: { weight: '600' }, color: '#475569' }
        },
        y: { 
          grid: { display: false },
          ticks: { font: { weight: '600' }, color: '#475569' }
        }
      }
    }
  });
}

// Fetch and update metrics & KPIs
async function fetchMetrics() {
  try {
    const res = await fetch(`${API_BASE}/api/metrics`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    // Update KPIs
    const k = data.kpis;
    document.getElementById('kpiTotalInteractions').textContent = Number(k.totalInteractions).toLocaleString('es-AR');
    document.getElementById('kpi24hInteractions').innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> +${k.interactions24h} hoy`;
    
    document.getElementById('kpiTotal147').textContent = Number(k.totalReclamos147).toLocaleString('es-AR');
    document.getElementById('kpi147Resueltos').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${k.reclamosResueltosPct}% resueltos`;

    document.getElementById('kpiTotalTurnos').textContent = Number(k.totalTurnos).toLocaleString('es-AR');
    
    document.getElementById('kpiTotalApr').textContent = Number(k.totalAprConsultas).toLocaleString('es-AR');
    document.getElementById('kpiAprMonto').textContent = `${formatARS(k.totalAprDeuda)} gestionados`;

    document.getElementById('kpiTotalFaltas').textContent = Number(k.totalFaltasConsultas).toLocaleString('es-AR');
    document.getElementById('kpiFaltasPct').textContent = `${k.conInfraccionPct}% c/ infracción`;

    document.getElementById('kpiVoicePct').textContent = `${k.voicePct}%`;

    // Update Charts
    // 1. Area Doughnut
    const areaLabels = Object.keys(data.charts.areaDistribution);
    const areaValues = Object.values(data.charts.areaDistribution);
    charts.area.data.labels = areaLabels;
    charts.area.data.datasets[0].data = areaValues;
    charts.area.update('none');

    // 2. Reclamos Bar
    const recLabels = Object.keys(data.charts.reclamosTipologia);
    const recValues = Object.values(data.charts.reclamosTipologia);
    charts.reclamos.data.labels = recLabels;
    charts.reclamos.data.datasets[0].data = recValues;
    charts.reclamos.update('none');

    // 3. Hourly Line
    charts.hourly.data.labels = data.charts.hourlyTraffic.labels;
    charts.hourly.data.datasets[0].data = data.charts.hourlyTraffic.data;
    charts.hourly.update('none');

    // 4. User Types Pie
    charts.userType.data.datasets[0].data = [k.residentCount, k.touristCount];
    charts.userType.update('none');

    // 5. Localidades Horizontal Bar
    // Sort localities top 7
    const sortedLocs = Object.entries(data.charts.localidades)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
    charts.localidades.data.labels = sortedLocs.map(i => i[0]);
    charts.localidades.data.datasets[0].data = sortedLocs.map(i => i[1]);
    charts.localidades.update('none');

  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

// Fetch and render events table (Flujo de Interacciones en Blanco & Escala de Grises)
async function fetchEvents() {
  try {
    const area = document.getElementById('filterArea').value;
    const canal = document.getElementById('filterCanal').value;
    const search = document.getElementById('searchInput').value;

    const params = new URLSearchParams({ limit: 40 });
    if (area !== 'all') params.append('area', area);
    if (canal !== 'all') params.append('canal', canal);
    if (search.trim()) params.append('search', search.trim());

    const res = await fetch(`${API_BASE}/api/events?${params.toString()}`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    const tbody = document.getElementById('eventsTableBody');
    const events = data.events || [];

    const latestId = events.length > 0 ? events[0].id : null;
    const isNew = previousLatestEventId && latestId && previousLatestEventId !== latestId;
    previousLatestEventId = latestId;

    tbody.innerHTML = events.map((e, index) => {
      const isVoice = e.canal === 'audio' || e.canal === 'voice';
      const canalIcon = isVoice 
        ? '<span style="font-weight:700; color:#0f172a;" title="Nota de Voz"><i class="fa-solid fa-microphone"></i> Audio</span>'
        : '<span style="font-weight:700; color:#475569;" title="Mensaje de Texto"><i class="fa-regular fa-comment-dots"></i> Texto</span>';
      
      const areaClass = getAreaTagClass(e.area);
      const ticketHtml = e.ticket 
        ? `<span class="tag-ticket">${e.ticket}</span>`
        : '<span class="text-dim">--</span>';

      const statusClass = e.estado === 'Resuelto' ? 'status-resuelto' : 'status-proceso';

      // Build summary detail text
      let detailSummary = '';
      if (e.detalles) {
        if (e.detalles.tipo_reclamo) detailSummary = `<strong>${e.detalles.tipo_reclamo}</strong> (${e.detalles.prioridad || 'Normal'})`;
        else if (e.detalles.tramite) detailSummary = `<strong>${e.detalles.tramite}</strong> - ${e.detalles.sede || ''}`;
        else if (e.detalles.partida) detailSummary = `Partida: <strong>${e.detalles.partida}</strong> (${formatARS(e.detalles.deuda_registrada)})`;
        else if (e.detalles.dominio) detailSummary = `Dominio: <strong>${e.detalles.dominio}</strong> (${e.detalles.infraccion || 'Sin Multas'})`;
        else if (e.detalles.atractivo_consultado) detailSummary = `Turismo: <strong>${e.detalles.atractivo_consultado}</strong>`;
        else if (e.detalles.consulta) detailSummary = e.detalles.consulta;
      }
      if (!detailSummary) detailSummary = 'Consulta informativa atendida';

      const rowClass = (index === 0 && isNew) ? 'class="row-new"' : '';

      return `
        <tr ${rowClass}>
          <td><strong>${formatDate(e.timestamp)}</strong></td>
          <td>${canalIcon}</td>
          <td><span class="tag-area ${areaClass}">${e.area}</span></td>
          <td>${ticketHtml}</td>
          <td>
            <div><strong>${e.nombre || 'Vecino'}</strong></div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${e.telefono || ''}</div>
          </td>
          <td><i class="fa-solid fa-location-dot" style="font-size:0.75rem; color:var(--text-muted);"></i> ${e.localidad || 'Casco Urbano'}</td>
          <td>${detailSummary}</td>
          <td><span class="tag-status ${statusClass}">${e.estado || 'Resuelto'}</span></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error fetching events:', err);
  }
}

// Periodic auto-refresh
async function refreshAll() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('spin-animation');
  await Promise.all([fetchMetrics(), fetchEvents()]);
  if (icon) setTimeout(() => icon.classList.remove('spin-animation'), 600);
}

// Event Listeners & Boot
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initCharts();
  refreshAll();

  // Filters listeners
  document.getElementById('filterArea').addEventListener('change', fetchEvents);
  document.getElementById('filterCanal').addEventListener('change', fetchEvents);
  document.getElementById('searchInput').addEventListener('input', () => {
    fetchEvents();
  });

  document.getElementById('btnRefresh').addEventListener('click', refreshAll);

  // Poll every 3 seconds
  setInterval(refreshAll, 3000);
});
