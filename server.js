require('dotenv').config();
const path = require('path');
const fs = require('fs');
if (!process.env.N8N_API_KEY && fs.existsSync(path.join(__dirname, '.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'metrics_db.json');

const N8N_URL = process.env.N8N_URL || 'https://vps-5872382-x.dattaweb.com';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const WHATSAPP_WORKFLOW_ID = process.env.WHATSAPP_WORKFLOW_ID || 'oV2qAm1FxkwBs6PY';
const WEB_WORKFLOW_ID = process.env.WEB_WORKFLOW_ID || '03HiGPMmFsxuOmt1';
const WORKFLOW_IDS = (process.env.WORKFLOW_IDS
  ? process.env.WORKFLOW_IDS.split(',')
  : [WHATSAPP_WORKFLOW_ID, WEB_WORKFLOW_ID]
).map(s => s.trim()).filter(Boolean);

// Keep track of synced execution IDs to avoid duplicates
const processedExecutionIds = new Set();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read DB safely
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { total: 0, last_updated: new Date().toISOString(), events: [] };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB:', err);
    return { total: 0, last_updated: new Date().toISOString(), events: [] };
  }
}

// Helper to write DB safely
function writeDB(data) {
  try {
    data.last_updated = new Date().toISOString();
    data.total = data.events.length;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing DB:', err);
    return false;
  }
}

// Helper to categorize text and extract metadata
function parseInteractionData(fullText, parserData, timestamp) {
  let area = 'Consultas Generales';
  let ticket = null;
  let tipoUsuario = 'Vecino / Residente';
  let localidad = 'Casco Urbano (Plaza Moreno)';
  let monto = null;
  let detalles = {};

  const text = fullText || '';

  const recMatch = text.match(/REC-147-[A-Z0-9]+/i);
  const turMatch = text.match(/TUR-LP-[A-Z0-9]+/i);
  const aprMatch = text.match(/APR-[A-Z0-9]+/i);
  const faltasMatch = text.match(/FALTAS-[A-Z0-9]+/i);

  if (recMatch) {
    area = 'Reclamos 147';
    ticket = recMatch[0];
    detalles.tipo_reclamo = 'Reclamo Vecinal 147';
    if (/luz|luminaria|farola|alumbrado/i.test(text)) detalles.tipo_reclamo = 'Luminarias y Alumbrado Público';
    else if (/bache|asfalto|calle rota/i.test(text)) detalles.tipo_reclamo = 'Bacheo y Asfalto';
    else if (/poda|rama|árbol/i.test(text)) detalles.tipo_reclamo = 'Poda y Despeje de Ramas';
    else if (/basura|residuo|no habitual/i.test(text)) detalles.tipo_reclamo = 'Recolección de Residuos no Habituales';
    else if (/sem[aá]foro|se[nñ]al/i.test(text)) detalles.tipo_reclamo = 'Semáforos y Señalética Vial';
    else if (/sumidero|inunda|pluvial|boca de tormenta/i.test(text)) detalles.tipo_reclamo = 'Limpieza de Sumideros y Pluviales';
  } else if (turMatch) {
    area = 'Turnos Licencias';
    ticket = turMatch[0];
    detalles.tramite = 'Turno Licencia de Conducir';
    detalles.sede = 'Sede Central (Torre 2)';
  } else if (aprMatch || /partida inmobiliaria|tasa sum|seguridad e higiene|rentas apr/i.test(text)) {
    area = 'APR - Tasas y Deuda';
    if (aprMatch) ticket = aprMatch[0];
    const amountMatch = text.match(/\$\s?([0-9]{1,3}(?:\.[0-9]{3})*)/);
    if (amountMatch) {
      monto = parseInt(amountMatch[1].replace(/\./g, ''), 10);
    }
    detalles.tasa = 'Tasa SUM / Tasas Municipales';
    detalles.deuda_registrada = monto || 0;
  } else if (faltasMatch || /infracci[oó]n|multa|acta de faltas|juzgado|radar/i.test(text)) {
    area = 'Juzgado de Faltas - Multas';
    if (faltasMatch) ticket = faltasMatch[0];
    const amountMatch = text.match(/\$\s?([0-9]{1,3}(?:\.[0-9]{3})*)/);
    if (amountMatch) {
      monto = parseInt(amountMatch[1].replace(/\./g, ''), 10);
    }
    detalles.infraccion = 'Consulta de Infracciones de Tránsito';
    detalles.monto = monto || 0;
  } else if (/catedral|museo de ciencias|rep[uú]blica de los ni[ñn]os|diagonal 74|turismo|atractivo|palacio municipal/i.test(text)) {
    area = 'Turismo y Cultura';
    tipoUsuario = 'Turista / Visitante';
    detalles.atractivo_consultado = 'Patrimonio y Turismo La Plata';
  } else {
    detalles.consulta = text.slice(0, 160);
  }

  const locMatch = text.match(/(City Bell|Gonnet|Villa Elisa|Los Hornos|Tolosa|San Carlos|Villa Elvira|Ringuelet|Gorina|Melchor Romero)/i);
  if (locMatch) {
    localidad = locMatch[0];
  }

  return {
    timestamp: timestamp || new Date().toISOString(),
    area,
    canal: (parserData && (parserData.messageType === 'audio' || parserData.userPreference === 'voice')) ? 'audio' : 'texto',
    tipo_usuario: tipoUsuario,
    nombre: (parserData && parserData.senderName) || 'Vecino de La Plata',
    telefono: (parserData && parserData.senderPhone) || '5492210000000',
    localidad,
    ticket,
    monto,
    estado: 'Resuelto',
    detalles,
    satisfaccion: 5
  };
}

// GET /api/metrics - Aggregated statistics
app.get('/api/metrics', (req, res) => {
  const db = readDB();
  const events = db.events || [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const totalInteractions = events.length;
  const recent24hEvents = events.filter(e => new Date(e.timestamp) >= oneDayAgo);
  const interactions24h = recent24hEvents.length;

  const areaCounts = {};
  let textCount = 0;
  let voiceCount = 0;
  let residentCount = 0;
  let touristCount = 0;
  const reclamoTipologia = {};
  let totalReclamos147 = 0;
  let reclamosResueltos = 0;
  let totalTurnos = 0;
  const turnosTramites = {};
  const turnosSedes = {};
  let totalAprConsultas = 0;
  let totalAprDeuda = 0;
  let totalFaltasConsultas = 0;
  let totalMultasMonto = 0;
  let conInfraccionCount = 0;
  const localidadCounts = {};

  const hourlyTraffic = Array(24).fill(0);
  const hourlyLabels = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourStr = d.getHours().toString().padStart(2, '0') + ':00';
    hourlyLabels.push(hourStr);
  }

  events.forEach(e => {
    const area = e.area || 'Consultas Generales';
    areaCounts[area] = (areaCounts[area] || 0) + 1;

    if (e.canal === 'audio' || e.canal === 'voice') voiceCount++;
    else textCount++;

    if (e.tipo_usuario && e.tipo_usuario.toLowerCase().includes('turista')) {
      touristCount++;
    } else {
      residentCount++;
    }

    const loc = e.localidad || 'Casco Urbano';
    localidadCounts[loc] = (localidadCounts[loc] || 0) + 1;

    if (area === 'Reclamos 147') {
      totalReclamos147++;
      if (e.estado === 'Resuelto') reclamosResueltos++;
      const tipo = (e.detalles && e.detalles.tipo_reclamo) || 'Otros Reclamos';
      reclamoTipologia[tipo] = (reclamoTipologia[tipo] || 0) + 1;
    } else if (area === 'Turnos Licencias') {
      totalTurnos++;
      const tramite = (e.detalles && e.detalles.tramite) || 'Renovación Licencia';
      const sede = (e.detalles && e.detalles.sede) || 'Sede Central';
      turnosTramites[tramite] = (turnosTramites[tramite] || 0) + 1;
      turnosSedes[sede] = (turnosSedes[sede] || 0) + 1;
    } else if (area.includes('APR')) {
      totalAprConsultas++;
      const deuda = (e.monto || (e.detalles && e.detalles.deuda_registrada) || 0);
      totalAprDeuda += deuda;
    } else if (area.includes('Faltas') || area.includes('Multas')) {
      totalFaltasConsultas++;
      const multa = (e.monto || (e.detalles && e.detalles.monto) || 0);
      if (multa > 0) conInfraccionCount++;
      totalMultasMonto += multa;
    }

    const eventDate = new Date(e.timestamp);
    const diffHours = Math.floor((now.getTime() - eventDate.getTime()) / (60 * 60 * 1000));
    if (diffHours >= 0 && diffHours < 24) {
      const slotIndex = 23 - diffHours;
      if (slotIndex >= 0 && slotIndex < 24) {
        hourlyTraffic[slotIndex]++;
      }
    }
  });

  res.json({
    timestamp: now.toISOString(),
    kpis: {
      totalInteractions,
      interactions24h,
      totalReclamos147,
      reclamosResueltosPct: totalReclamos147 ? Math.round((reclamosResueltos / totalReclamos147) * 100) : 100,
      totalTurnos,
      totalAprConsultas,
      totalAprDeuda,
      totalFaltasConsultas,
      totalMultasMonto,
      conInfraccionPct: totalFaltasConsultas ? Math.round((conInfraccionCount / totalFaltasConsultas) * 100) : 0,
      voicePct: totalInteractions ? Math.round((voiceCount / totalInteractions) * 100) : 0,
      residentCount,
      touristCount
    },
    charts: {
      areaDistribution: areaCounts,
      reclamosTipologia: reclamoTipologia,
      hourlyTraffic: {
        labels: hourlyLabels,
        data: hourlyTraffic
      },
      userTypeDistribution: {
        "Vecinos / Residentes": residentCount,
        "Turistas / Visitantes": touristCount
      },
      channelDistribution: {
        "Texto WhatsApp (Mensajes)": textCount,
        "Notas de Voz / Audio": voiceCount
      },
      localidades: localidadCounts,
      turnosTramites,
      turnosSedes
    }
  });
});

// GET /api/events - Paginated / Filtered latest interactions
app.get('/api/events', (req, res) => {
  const db = readDB();
  let events = [...(db.events || [])];
  
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const { area, canal, search, limit = 50 } = req.query;

  if (area && area !== 'all') {
    events = events.filter(e => e.area === area);
  }
  if (canal && canal !== 'all') {
    events = events.filter(e => e.canal === canal);
  }
  if (search) {
    const q = search.toLowerCase();
    events = events.filter(e => 
      (e.nombre && e.nombre.toLowerCase().includes(q)) ||
      (e.telefono && e.telefono.includes(q)) ||
      (e.ticket && e.ticket.toLowerCase().includes(q)) ||
      (e.localidad && e.localidad.toLowerCase().includes(q)) ||
      (e.area && e.area.toLowerCase().includes(q))
    );
  }

  const result = events.slice(0, parseInt(limit, 10));
  res.json({
    totalMatching: events.length,
    events: result
  });
});

// POST /api/telemetry - Ingest live chatbot interaction directly
app.post('/api/telemetry', (req, res) => {
  const payload = req.body || {};
  const db = readDB();

  const now = new Date();
  const newEvent = {
    id: `evt_${(db.events.length + 1).toString().padStart(5, '0')}`,
    timestamp: payload.timestamp || now.toISOString(),
    area: payload.area || 'Consultas Generales',
    canal: payload.canal || 'texto',
    tipo_usuario: payload.tipo_usuario || 'Vecino / Residente',
    nombre: payload.nombre || 'Vecino de La Plata',
    telefono: payload.telefono || 'N/D',
    localidad: payload.localidad || 'Casco Urbano (Plaza Moreno)',
    ticket: payload.ticket || null,
    monto: typeof payload.monto === 'number' ? payload.monto : null,
    estado: payload.estado || 'Resuelto',
    detalles: payload.detalles || { consulta: payload.mensaje || 'Interacción vía WhatsApp' },
    satisfaccion: payload.satisfaccion || 5
  };

  db.events.push(newEvent);
  writeDB(db);

  console.log(`[TELEMETRY WEBHOOK] New event: ${newEvent.area} | Ticket: ${newEvent.ticket || 'N/A'}`);
  res.status(201).json({ success: true, event: newEvent });
});

// POST /api/chat/webhook - Bridge Web Widget -> n8n Workflow / Webhook
app.post('/api/chat/webhook', (req, res) => {
  const payload = req.body || {};
  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || `${N8N_URL}/webhook/municipal-web-chat`;

  const payloadString = JSON.stringify(payload);
  const parsedUrl = new URL(N8N_WEBHOOK_URL);
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 443,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payloadString)
    },
    timeout: 60000
  };

  const forwardReq = https.request(options, (forwardRes) => {
    let raw = '';
    forwardRes.on('data', chunk => raw += chunk);
    forwardRes.on('end', () => {
      try {
        if (forwardRes.statusCode >= 400) {
          throw new Error(`n8n returned status ${forwardRes.statusCode}: ${raw}`);
        }
        const json = JSON.parse(raw);
        // Also record interaction in local metrics DB
        if (json.text || json.output) {
          const db = readDB();
          const parsedEvent = parseInteractionData(
            json.text || json.output,
            { senderName: payload.userName || 'Vecino Web', channel: 'Web Chat', messageType: payload.messageType || 'text' },
            new Date().toISOString()
          );
          parsedEvent.id = `evt_${(db.events.length + 1).toString().padStart(5, '0')}`;
          parsedEvent.canal = 'Web Widget 🌐';
          parsedEvent.tipo_mensaje = payload.messageType === 'audio' ? 'Voz 🎙️' : 'Texto 📝';
          db.events.push(parsedEvent);
          writeDB(db);
        }
        res.status(forwardRes.statusCode).json(json);
      } catch (e) {
        console.log('[CHAT BRIDGE] Using municipal AI responder:', e.message);
        generateFallbackResponse(payload, res);
      }
    });
  });

  forwardReq.on('error', (err) => {
    console.log('[CHAT BRIDGE] Forward to n8n failed, using municipal AI responder:', err.message);
    generateFallbackResponse(payload, res);
  });

  forwardReq.write(payloadString);
  forwardReq.end();
});

function generateFallbackResponse(payload, res) {
  const q = (payload.message || '').toLowerCase();
  let qr = [
    { id: 'btn_mode_text', title: 'Seguir con Mensaje', payload: 'btn_mode_text' },
    { id: 'btn_mode_voice', title: 'Seguir con Voz', payload: 'btn_mode_voice' }
  ];

  if (payload.action === 'send_welcome' || q === 'hola' || q === 'inicio') {
    text = `🏛️ **¡Hola, ${payload.userName || 'Vecino/a'}! Te damos la bienvenida al Asistente Virtual Oficial de la Municipalidad de La Plata.**\n*Ciudad Capital - Gestión Abierta y Cercana 24/7*\n\nEstoy aquí para resolver tus dudas las 24 horas sobre trámites, servicios y turismo:\n\n• 🚗 **Trámites & Licencias de Conducir (Turnos)**\n• 💳 **Tasas Municipales, Deudas y Pagos en APR**\n• ⚖️ **Multas de Tránsito y Descargos**\n• 🛠️ **Reclamos y Cuadrillas Urbanas 147**\n• 🌲 **Turismo, Cultura y Secretos de la Ciudad**\n• 📂 **Normativas y Base Documental**\n\n¿Cómo prefieres que nos comuniquemos hoy?`;
    qr = [
      { id: 'btn_mode_text', title: 'Seguir con Mensaje', payload: 'btn_mode_text' },
      { id: 'btn_mode_voice', title: 'Seguir con Voz', payload: 'btn_mode_voice' },
      { id: 'btn_licencias', title: '🚗 Licencias de Conducir', payload: '¿Cómo renuevo mi licencia de conducir?' },
      { id: 'btn_tasas', title: '💳 Consultar Tasas APR', payload: '¿Dónde pago mis tasas municipales de APR?' },
      { id: 'btn_multas', title: '⚖️ Juzgado de Faltas', payload: 'Quiero consultar multas de tránsito' },
      { id: 'btn_reclamos', title: '🛠️ Reclamos Línea 147', payload: 'Quiero registrar un reclamo de alumbrado o bacheo' },
      { id: 'btn_turismo', title: '🌲 Guía Turística & Paseos', payload: '¿Qué lugares históricos y secretos tiene la ciudad?' }
    ];
  } else if (payload.action === 'set_pref_text') {
    text = `✅ **Perfecto. He configurado tus respuestas en modo TEXTO 📝.**\n\nA partir de este momento recibirás todas las explicaciones y enlaces oficiales por escrito.\n\n¿En qué te puedo ayudar hoy?`;
  } else if (payload.action === 'set_pref_voice') {
    text = `🎙️ **¡Excelente! He configurado tus respuestas en modo AUDIO / VOZ 🔊.**\n\nA partir de ahora escucharás respuestas habladas claras, acompañadas de los enlaces oficiales debajo.\n\n¿Qué consulta deseas realizar?`;
  } else if (q.includes('licencia') || q.includes('turno')) {
    text = `🚗 **Turnos para Licencias de Conducir - La Plata:**\nPara renovar u obtener tu licencia de conducir en la Sede Central (Calle 20 y 50) o en los Centros Comunales de City Bell, Los Hornos y Villa Elvira:\n\n1. **Requisitos:** DNI original con domicilio en La Plata, CENAT abonado y libre deuda de multas.\n2. **Reserva Online:** [tramites.laplata.gob.ar/turnos](https://tramites.laplata.gob.ar)\n\nIndícame tu **número de DNI** para confirmar la disponibilidad de turno.`;
  } else if (q.includes('deuda') || q.includes('tasa') || q.includes('apr') || q.includes('sum')) {
    text = `💳 **Agencia Platense de Recaudación (APR):**\nPuedes consultar y liquidar la **Tasa por Servicios Urbanos Municipales (SUM)** o el **Impuesto Automotor** con un **15% de descuento por pago al contado**.\n\n• **Medios habilitados:** Tarjeta de Débito/Crédito, QR (Mercado Pago, Cuenta DNI, BNA+), RapiPago y PagoFácil.\n• **Portal de Pago:** [apr.laplata.gob.ar](https://apr.laplata.gob.ar)\n\nFacilítame tu **DNI, CUIT, Partida Inmobiliaria o Patente** para consultar tu estado de cuenta.`;
  } else if (q.includes('infraccion') || q.includes('multa') || q.includes('faltas')) {
    text = `⚖️ **Juzgado de Faltas de La Plata (Calle 48 e/ 10 y 11):**\nPuedes regularizar tus actas de tránsito con un **50% de descuento por pago voluntario** dentro de los primeros 30 días o presentar tu descargo online.\n\n• **Portal Oficial:** [faltas.laplata.gob.ar](https://faltas.laplata.gob.ar)\n\nPor favor, indícame la **Patente/Dominio del vehículo** (ej: AF123GH) o tu **DNI**.`;
  } else if (q.includes('turismo') || q.includes('secreto') || q.includes('historia') || q.includes('catedral') || q.includes('museo')) {
    text = `🌲 **Guía Turística, Patrimonio y Secretos de La Plata:**\n\n• 🏛️ **Catedral Inmaculada Concepción:** Templo neogótico con mirador panorámico en la torre a 112 metros.\n• 🦖 **Museo de Ciencias Naturales:** En el Paseo del Bosque, referente mundial con más de 3 millones de piezas.\n• 📐 **Secretos de las Diagonales:** Traza perfecta del arquitecto Pedro Benoit formando un rombo masónico con plazas cada 6 cuadras exactas.\n• 🍽️ **Gastronomía y Salidas:** Circuito gourmet de City Bell y el polo cultural de Barrio Meridiano V en la histórica estación de trenes.\n\n• **Portal de Turismo:** [turismo.laplata.gob.ar](https://turismo.laplata.gob.ar)`;
  } else if (q.includes('reclamo') || q.includes('luz') || q.includes('bache') || q.includes('147')) {
    text = `🛠️ **Línea 147 - Atención Vecinal y Reclamos:**\nPara derivar la cuadrilla comunal de alumbrado público, bacheo, sumideros o poda correctiva:\n\nPor favor, indícame la **dirección exacta o intersección** (ejemplo: *Calle 7 e/ 50 y 51* o *Diag. 74 y 10*) y el motivo del reporte para generarte el número de ticket oficial.`;
  }

  // Record in local DB
  const db = readDB();
  const parsedEvent = parseInteractionData(
    text,
    { senderName: payload.userName || 'Vecino Web', channel: 'Web Chat', messageType: payload.messageType || 'text' },
    new Date().toISOString()
  );
  parsedEvent.id = `evt_${(db.events.length + 1).toString().padStart(5, '0')}`;
  parsedEvent.canal = 'Web Widget 🌐';
  parsedEvent.tipo_mensaje = payload.messageType === 'audio' ? 'Voz 🎙️' : 'Texto 📝';
  db.events.push(parsedEvent);
  writeDB(db);

  res.json({
    status: 'success',
    sessionId: payload.sessionId,
    text: text,
    outputMode: payload.userPreference || 'text',
    quickReplies: qr,
    municipio: 'Municipalidad de La Plata',
    timestamp: new Date().toISOString()
  });
}

// DELETE /api/events/purge - Purge specific events on demand (e.g. for demos)
app.delete('/api/events/purge', (req, res) => {
  const { name, phone } = req.query;
  const db = readDB();
  const initialCount = db.events.length;

  db.events = db.events.filter(e => {
    let match = false;
    if (name && e.nombre && e.nombre.toLowerCase().includes(name.toLowerCase())) match = true;
    if (phone && e.telefono && e.telefono.includes(phone)) match = true;
    return !match;
  });

  const removed = initialCount - db.events.length;
  writeDB(db);
  console.log(`[PURGE] Removed ${removed} event(s) matching name="${name || ''}" phone="${phone || ''}"`);
  res.json({ success: true, removed, totalRemaining: db.events.length });
});

// Initialize processed IDs on startup so past executions aren't duplicated
function initProcessedIds() {
  if (!N8N_API_KEY) return;
  const options = { headers: { 'X-N8N-API-KEY': N8N_API_KEY } };
  const now = Date.now();

  WORKFLOW_IDS.forEach(wfId => {
    https.get(`${N8N_URL}/api/v1/executions?workflowId=${wfId}&limit=50`, options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const list = json.data || [];
          list.forEach(item => {
            const ageMs = now - new Date(item.startedAt).getTime();
            // Cache executions older than 30 minutes, allowing recent test executions to be ingested
            if (ageMs > 30 * 60 * 1000) {
              processedExecutionIds.add(item.id);
            }
          });
          console.log(`[INIT] Cached older executions for workflow ${wfId}. Total cached: ${processedExecutionIds.size}`);
        } catch (e) {}
      });
    }).on('error', () => {});
  });
}
initProcessedIds();

// Sync n8n executions in background every 4 seconds
function pollN8nExecutions() {
  if (!N8N_API_KEY) return;

  const options = {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY }
  };

  WORKFLOW_IDS.forEach(wfId => {
    https.get(`${N8N_URL}/api/v1/executions?workflowId=${wfId}&limit=10`, options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const list = json.data || [];

          list.forEach(item => {
            if (item.status === 'success' && !processedExecutionIds.has(item.id)) {
              processedExecutionIds.add(item.id);

              // Fetch execution details
              https.get(`${N8N_URL}/api/v1/executions/${item.id}?includeData=true`, options, (detailRes) => {
                let detailRaw = '';
                detailRes.on('data', c => detailRaw += c);
                detailRes.on('end', () => {
                  try {
                    const detailJson = JSON.parse(detailRaw);
                    const runData = detailJson.data?.resultData?.runData || {};

                    // Check if this execution ran through the chatbot agent / prep node
                    const prepNode = runData['Preparar Salida del Agente'] || runData['Empaquetar Respuesta Final JSON'];
                    const parserNode = runData['⚙️ Configuración & Parser WhatsApp'] || runData['⚙️ Configuración & Parser Web'];

                    if (prepNode && prepNode[0]?.data?.main?.[0]?.[0]?.json) {
                      const prepData = prepNode[0].data.main[0][0].json;
                      const parserData = parserNode ? parserNode[0]?.data?.main?.[0]?.[0]?.json : null;

                      const responseContent = prepData.responseText || prepData.spokenText || prepData.text || prepData.output;
                      if (!responseContent) return;

                      const parsedEvent = parseInteractionData(
                        responseContent,
                        parserData || prepData,
                        item.startedAt || new Date().toISOString()
                      );

                      const isWhatsApp = Boolean(runData['⚙️ Configuración & Parser WhatsApp'] || runData['Webhook POST (Mensajes WhatsApp)']);
                      parsedEvent.canal = (parserData && (parserData.messageType === 'audio' || parserData.userPreference === 'voice')) ? 'audio' : 'texto';

                      const db = readDB();
                      // Avoid duplicating by timestamp & phone or ticket
                      const exists = db.events.some(e => 
                        (e.telefono === parsedEvent.telefono || (e.ticket && parsedEvent.ticket && e.ticket === parsedEvent.ticket)) && 
                        Math.abs(new Date(e.timestamp) - new Date(parsedEvent.timestamp)) < 5000
                      );
                      if (!exists) {
                        parsedEvent.id = `evt_${(db.events.length + 1).toString().padStart(5, '0')}`;
                        db.events.push(parsedEvent);
                        writeDB(db);
                        console.log(`[N8N SYNC] Ingested Live ${isWhatsApp ? 'WhatsApp' : 'Web'} Execution ${item.id} -> ${parsedEvent.area} (${parsedEvent.nombre || parsedEvent.telefono})`);
                      }
                    }
                  } catch (e) {
                    // Silent catch for incomplete payloads
                  }
                });
              });
            }
          });
        } catch (err) {
          // Silent catch for network hiccups
        }
      });
    }).on('error', () => {});
  });
}

// Start polling n8n executions every 4 seconds
setInterval(pollN8nExecutions, 4000);
// Trigger initial run
setTimeout(pollN8nExecutions, 1000);

app.listen(PORT, () => {
  console.log(`🚀 Municipalidad de La Plata Dashboard Server running on http://localhost:${PORT}`);
});
