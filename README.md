# 🏛️ Portal Ciudadano & Chatbot Web 360° | Municipalidad de La Plata

Plataforma integral de **Atención Ciudadana Multimodal (Texto & Voz)** y **Centro de Monitoreo & Dashboard en Tiempo Real**, potenciada con Inteligencia Artificial (**OpenAI Whisper + GPT-4o + TTS**) y orquestación en **n8n**.

---

## 🌟 Características Principales

### 1. 🌐 Portal Ciudadano & Landing Page (`landing.html`)
- **Diseño Oficial & Adaptativo**: Estética corporativa municipal con paleta institucional en Verde Petróleo (`#008d9b`) y Gris Carbón (`#1e293b`).
- **Servicios Integrados**:
  - 🚗 **Licencias de Conducir**: Información y turnos para renovación, duplicados y sedes comunales.
  - 💳 **Tasas Municipales (APR)**: Consulta y liquidación de Tasas SUM e Impuesto Automotor con 15% de descuento.
  - ⚖️ **Juzgado de Faltas**: Consulta de infracciones por Patente o DNI con 50% de pago voluntario.
  - 🛠️ **Atención Vecinal (Línea 147)**: Reportes urbanos para alumbrado, baches, sumideros y poda.
  - 🌲 **Guía Turística & Secretos**: Paseos por la Catedral, Museo de Ciencias y traza histórica de las diagonales.

### 2. 🤖 Chatbot Web Multimodal (`widget.js` & `widget.css`)
- **Entrada y Salida de Voz en Tiempo Real**:
  - **Grabación de audio**: Micrófono en el navegador con transcripción mediante OpenAI Whisper.
  - **Respuestas de voz naturales**: Audio generado con OpenAI TTS (MP3 Base64) con reproductor integrado.
  - **Compatibilidad 100% con iOS y Safari / Chrome en iPhone**: Desbloqueo automático de audio (`playsinline`, `webkit-playsinline`, `volume: 1.0`).
- **Opciones Rápidas Estructuradas**:
  - Preferencia de respuesta (*Seguir con Mensaje 📝* / *Seguir con Voz 🎙️*).
  - Accesos directos organizados en cuadrícula para trámites frecuentes.

### 3. 📊 Centro de Control & Monitoreo en Tiempo Real (`index.html`)
- **Fondo Institucional & Gráficos Monocromáticos**: Alto contraste tecnológico en escala de blancos y grises sobre verde petróleo.
- **KPIs Ejecutivos en Vivo**: Total de interacciones, reclamos 147 resueltos, turnos otorgados, deuda APR gestionada y porcentaje de uso del canal de voz.
- **Gráficos Dinámicos (Chart.js)**:
  - Distribución de consultas por Área de Gestión (*Doughnut*).
  - Reclamos por Tipología (*Bar Chart*).
  - Tráfico Horario de Consultas (*Line Area Chart*).
  - Vecinos vs Visitantes (*Pie Chart*).
  - Consultas por Zonas y Delegaciones (*Horizontal Bar*).
- **Feed y Auditoría en Vivo**: Tabla interactiva con filtros por canal, área y buscador en tiempo real de tickets o DNI.

---

## 🏗️ Arquitectura del Sistema

```
[ Usuario Web / iPhone ]
        │  (Texto o Voz)
        ▼
[ Servidor Web Express (Node.js) ] ── (Proxy Seguro / CORS)
        │
        ├──▶ [ Portal Landing / Dashboard Público ]
        │
        ▼
[ Workflow Oficial n8n VPS ] (POST /webhook/municipal-web-chat)
        │
        ├──▶ [ OpenAI Whisper ] (Transcripción de Voz)
        ├──▶ [ OpenAI GPT-4o ] (Razonamiento & Herramientas Municipales)
        └──▶ [ OpenAI TTS ] (Generación de Audio MP3 Base64)
```

---

## 🚀 Despliegue en Producción (Cloud)

### Opción A: Despliegue en Render (1 Clic)
1. Crea una cuenta gratuita en [Render.com](https://render.com).
2. Haz clic en **New +** > **Web Service**.
3. Conecta este repositorio de GitHub: `chatbot-web-municipal-laplata`.
4. Configura los siguientes parámetros:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. En la sección **Environment Variables**, añade:
   - `PORT`: `10000`
   - `N8N_URL`: `https://vps-5872382-x.dattaweb.com`
   - `N8N_API_KEY`: *(Tu clave de API de n8n, obtenida en n8n Settings > API)*
   - `WORKFLOW_ID`: `03HiGPMmFsxuOmt1`
6. Haz clic en **Create Web Service**. ¡En 2 minutos tendrás una URL pública HTTPS gratuita y activa 24/7!

---

### Opción B: Despliegue en Railway
1. Abre [Railway.app](https://railway.app) y selecciona **New Project** > **Deploy from GitHub repo**.
2. Selecciona este repositorio.
3. En la pestaña **Variables**, añade `N8N_URL`, `N8N_API_KEY` y `WORKFLOW_ID`.
4. Railway detectará automáticamente el archivo `package.json` y desplegará el servicio con dominio público HTTPS.

---

### Opción C: Despliegue en VPS (Ubuntu / Debian / Docker)
```bash
# Clonar el repositorio
git clone https://github.com/acarobusiness-developments/chatbot-web-municipal-laplata.git
cd chatbot-web-municipal-laplata

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
nano .env

# Ejecutar con PM2 para alta disponibilidad
npm install -g pm2
pm2 start server.js --name "chatbot-laplata"
pm2 save
```

---

## 💻 Ejecución Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/acarobusiness-developments/chatbot-web-municipal-laplata.git
   cd chatbot-web-municipal-laplata
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configurar el archivo de entorno**:
   ```bash
   cp .env.example .env
   # Edita .env con tus credenciales si deseas habilitar sincronización con n8n
   ```

4. **Iniciar el servidor**:
   ```bash
   npm start
   # o usando el script ejecutable:
   ./iniciar.sh
   ```

5. **Abrir en tu navegador**:
   - **Landing Page con Chatbot**: [http://localhost:3000/landing.html](http://localhost:3000/landing.html)
   - **Dashboard de Monitoreo**: [http://localhost:3000/index.html](http://localhost:3000/index.html)

---

## 🔒 Variables de Entorno

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto en el que escucha el servidor Node.js | `3000` (o `10000` en Render) |
| `N8N_URL` | URL pública de la instancia de n8n | `https://vps-5872382-x.dattaweb.com` |
| `N8N_API_KEY` | Clave API para telemetría en tiempo real | `""` *(Opcional)* |
| `WORKFLOW_ID` | Identificador del workflow activo en n8n | `03HiGPMmFsxuOmt1` |

> ⚠️ **Nota de Seguridad**: Nunca subas el archivo `.env` a repositorios públicos. Este proyecto ya incluye `.env` en el `.gitignore`.

---

## 📄 Licencia y Créditos
Desarrollado para la **Municipalidad de La Plata** como plataforma abierta de atención ciudadana 360°.
Licencia MIT.
