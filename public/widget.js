/**
 * 🏛️ MUNICIPAL CHATBOT 360° - WEB WIDGET CONTROLLER (TEXTO & VOZ)
 * Permite la interacción multimodal con el asistente virtual oficial de la Municipalidad.
 */

(function (window) {
  'use strict';

  const DEFAULT_CONFIG = {
    municipioNombre: 'Municipalidad de La Plata',
    eslogan: 'Gestión Abierta y Cercana 24/7',
    avatarUrl: 'https://files.catbox.moe/351dpp.jpg',
    webhookUrl: '/api/chat/webhook', // Endpoint local proxy o directo de n8n
    n8nDirectUrl: 'https://vps-5872382-x.dattaweb.com/webhook/municipal-web-chat',
    useDirectN8n: false,
    defaultMode: 'auto', // 'auto', 'text', 'voice'
    primaryColor: '#0284c7',
    greetingText: '¡Hola! ¿Cómo prefieres comunicarte hoy? Puedes escribir o usar mensajes de voz.'
  };

  class MunicipalChatWidget {
    constructor(userOptions = {}) {
      this.options = Object.assign({}, DEFAULT_CONFIG, userOptions);
      this.sessionId = this.getOrCreateSessionId();
      this.currentMode = localStorage.getItem('mun_chat_mode') || this.options.defaultMode;
      this.isOpen = false;
      this.isRecording = false;
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.recordingTimer = null;
      this.recordingSeconds = 0;
      this.audioContext = null;
      this.currentPlayingAudio = null;

      this.initDOM();
      this.bindEvents();
      this.sendInitialGreeting();
    }

    getOrCreateSessionId() {
      let id = localStorage.getItem('mun_chat_session_id');
      if (!id) {
        id = 'web-session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('mun_chat_session_id', id);
      }
      return id;
    }

    initDOM() {
      // Create Widget Root Container
      const container = document.createElement('div');
      container.id = 'mun-chat-widget-root';
      container.innerHTML = `
        <!-- Floating Launcher Bubble -->
        <div class="mun-widget-launcher" id="munLauncher" title="Abrir Asistente Municipal 24/7">
          <div class="mun-launcher-tooltip">
            <span class="pulse-dot"></span>
            <span>¿Dudas sobre Trámites o Turismo?</span>
          </div>
          <div class="mun-launcher-btn">
            <i class="fa-solid fa-comments"></i>
            <span class="mun-launcher-badge">1</span>
          </div>
        </div>

        <!-- Chat Window Modal / Flyout -->
        <div class="mun-chat-window" id="munChatWindow">
          <!-- Header -->
          <div class="mun-chat-header">
            <div class="mun-header-left">
              <div class="mun-bot-avatar">
                <i class="fa-solid fa-landmark-dome"></i>
                <span class="mun-online-dot"></span>
              </div>
              <div class="mun-header-info">
                <span class="mun-header-title">${this.options.municipioNombre}</span>
                <span class="mun-header-subtitle">
                  <i class="fa-solid fa-circle-check"></i> Asistente Virtual 360°
                </span>
              </div>
            </div>
            <div class="mun-header-actions">
              <button class="mun-header-btn" id="munBtnReset" title="Reiniciar conversación">
                <i class="fa-solid fa-rotate-right"></i>
              </button>
              <button class="mun-header-btn" id="munBtnClose" title="Minimizar">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <!-- Mode Toggle Bar -->
          <div class="mun-mode-bar">
            <span>Preferencia de respuesta:</span>
            <div class="mun-mode-toggle">
              <button class="mun-mode-btn ${this.currentMode === 'text' ? 'active' : ''}" id="munModeText" data-mode="text">
                <i class="fa-solid fa-message"></i> Texto
              </button>
              <button class="mun-mode-btn ${this.currentMode === 'voice' ? 'active' : ''}" id="munModeVoice" data-mode="voice">
                <i class="fa-solid fa-microphone"></i> Voz
              </button>
            </div>
          </div>

          <!-- Messages Body -->
          <div class="mun-chat-messages" id="munMessages"></div>

          <!-- Input Area -->
          <div class="mun-chat-input-area">
            <div class="mun-input-row">
              <input type="text" class="mun-text-input" id="munTextInput" placeholder="Escribe tu consulta aquí..." autocomplete="off" />
              <button class="mun-action-btn mun-btn-mic" id="munBtnMic" title="Grabar nota de voz">
                <i class="fa-solid fa-microphone"></i>
              </button>
              <button class="mun-action-btn mun-btn-send" id="munBtnSend" title="Enviar mensaje">
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </div>

            <!-- Recording Live Overlay -->
            <div class="mun-recording-overlay" id="munRecOverlay">
              <div class="mun-rec-info">
                <span class="mun-rec-pulse"></span>
                <span id="munRecTimer">Grabando: 00:00</span>
              </div>
              <div class="mun-rec-actions">
                <button class="mun-btn-rec-cancel" id="munBtnRecCancel">Cancelar</button>
                <button class="mun-btn-rec-send" id="munBtnRecSend">
                  <i class="fa-solid fa-paper-plane"></i> Enviar Voz
                </button>
              </div>
            </div>

            <div class="mun-chat-footer-brand">
              Atención Ciudadana Oficial • Sistema Automatizado con IA
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      // Cache DOM Elements
      this.dom = {
        launcher: document.getElementById('munLauncher'),
        window: document.getElementById('munChatWindow'),
        messages: document.getElementById('munMessages'),
        textInput: document.getElementById('munTextInput'),
        btnSend: document.getElementById('munBtnSend'),
        btnMic: document.getElementById('munBtnMic'),
        btnClose: document.getElementById('munBtnClose'),
        btnReset: document.getElementById('munBtnReset'),
        recOverlay: document.getElementById('munRecOverlay'),
        recTimer: document.getElementById('munRecTimer'),
        btnRecCancel: document.getElementById('munBtnRecCancel'),
        btnRecSend: document.getElementById('munBtnRecSend'),
        modeText: document.getElementById('munModeText'),
        modeVoice: document.getElementById('munModeVoice')
      };
    }

    bindEvents() {
      // iOS Audio Unlock on first touch/click
      const triggerUnlock = () => {
        this.unlockAudio();
        document.removeEventListener('touchstart', triggerUnlock);
        document.removeEventListener('click', triggerUnlock);
      };
      document.addEventListener('touchstart', triggerUnlock, { passive: true });
      document.addEventListener('click', triggerUnlock, { passive: true });

      // Toggle Chat Window
      this.dom.launcher.addEventListener('click', () => {
        this.unlockAudio();
        this.toggleChat();
      });
      this.dom.btnClose.addEventListener('click', () => this.toggleChat(false));

      // Reset Session
      this.dom.btnReset.addEventListener('click', () => {
        if (confirm('¿Deseas reiniciar la conversación?')) {
          localStorage.removeItem('mun_chat_session_id');
          this.sessionId = this.getOrCreateSessionId();
          this.dom.messages.innerHTML = '';
          this.sendInitialGreeting();
        }
      });

      // Send on Enter
      this.dom.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendText();
        }
      });

      // Send on Button Click
      this.dom.btnSend.addEventListener('click', () => this.handleSendText());

      // Microphone Recording
      this.dom.btnMic.addEventListener('click', () => this.startRecording());
      this.dom.btnRecCancel.addEventListener('click', () => this.cancelRecording());
      this.dom.btnRecSend.addEventListener('click', () => this.stopAndSendRecording());

      // Mode Toggles
      this.dom.modeText.addEventListener('click', () => this.setMode('text'));
      this.dom.modeVoice.addEventListener('click', () => this.setMode('voice'));
    }

    toggleChat(forceState) {
      this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
      if (this.isOpen) {
        this.dom.window.classList.add('mun-open');
        this.dom.textInput.focus();
        const badge = this.dom.launcher.querySelector('.mun-launcher-badge');
        if (badge) badge.style.display = 'none';
      } else {
        this.dom.window.classList.remove('mun-open');
        if (this.isRecording) this.cancelRecording();
      }
    }

    setMode(mode) {
      this.currentMode = mode;
      localStorage.setItem('mun_chat_mode', mode);
      this.dom.modeText.classList.toggle('active', mode === 'text');
      this.dom.modeVoice.classList.toggle('active', mode === 'voice');

      // Send notice to backend to update persona preference
      this.sendMessagePayload({
        action: mode === 'text' ? 'set_pref_text' : 'set_pref_voice',
        userPreference: mode,
        message: mode === 'text' ? 'Modo Texto 📝' : 'Modo Voz 🎙️'
      }, true);
    }

    sendInitialGreeting() {
      // Trigger welcome action from backend
      this.sendMessagePayload({
        action: 'send_welcome',
        userPreference: this.currentMode,
        message: 'Hola'
      }, true);
    }

    handleSendText() {
      const text = this.dom.textInput.value.trim();
      if (!text) return;

      this.appendUserMessage(text, 'text');
      this.dom.textInput.value = '';

      this.sendMessagePayload({
        message: text,
        messageType: 'text',
        userPreference: this.currentMode
      });
    }

    async startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.isRecording = true;
        this.audioChunks = [];
        this.recordingSeconds = 0;
        this.dom.recOverlay.classList.add('active');

        this.mediaRecorder = new MediaRecorder(stream);
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.start(200);

        this.recordingTimer = setInterval(() => {
          this.recordingSeconds++;
          const mins = String(Math.floor(this.recordingSeconds / 60)).padStart(2, '0');
          const secs = String(this.recordingSeconds % 60).padStart(2, '0');
          this.dom.recTimer.textContent = `Grabando: ${mins}:${secs}`;
        }, 1000);
      } catch (err) {
        console.error('Error accediendo al micrófono:', err);
        alert('No se pudo acceder al micrófono. Por favor verifica los permisos en tu navegador.');
      }
    }

    cancelRecording() {
      if (this.mediaRecorder && this.isRecording) {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      this.isRecording = false;
      clearInterval(this.recordingTimer);
      this.dom.recOverlay.classList.remove('active');
    }

    stopAndSendRecording() {
      if (!this.mediaRecorder || !this.isRecording) return;

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          this.appendUserMessage(`🎙️ *Nota de voz (${this.recordingSeconds} seg)*`, 'voice');

          this.sendMessagePayload({
            messageType: 'audio',
            audioBase64: base64Audio,
            userPreference: this.currentMode === 'auto' ? 'voice' : this.currentMode
          });
        };
      };

      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.isRecording = false;
      clearInterval(this.recordingTimer);
      this.dom.recOverlay.classList.remove('active');
    }

    async sendMessagePayload(payload, isSilentUser = false) {
      const fullPayload = {
        sessionId: this.sessionId,
        userName: 'Vecino/a Web',
        userPreference: this.currentMode,
        ...payload
      };

      const typingEl = this.showTypingIndicator();

      try {
        const endpoint = this.options.useDirectN8n 
          ? this.options.n8nDirectUrl 
          : this.options.webhookUrl;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullPayload)
        });

        const data = await response.json();
        this.removeTypingIndicator(typingEl);

        if (data.status === 'success' || data.text || data.output) {
          this.appendBotMessage(data);
        } else {
          this.appendBotMessage({
            text: 'He recibido tu mensaje. ¿En qué otro trámite o consulta te puedo ayudar?'
          });
        }
      } catch (error) {
        console.error('Error al conectar con el servidor:', error);
        this.removeTypingIndicator(typingEl);
        
        // Fallback realista si el webhook está desconectado temporalmente
        this.handleLocalFallback(fullPayload);
      }
    }

    handleLocalFallback(payload) {
      let text = 'He recibido tu mensaje. Para una respuesta completa, verifica la conexión activa con el Asistente Virtual.';
      const q = (payload.message || '').toLowerCase();

      if (payload.action === 'send_welcome' || q === 'hola') {
        text = `🏛️ **¡Hola! Te damos la bienvenida al Asistente Virtual Oficial de la Municipalidad de La Plata.**\n*Gestión Abierta y Cercana 24/7*\n\nPuedes consultarme sobre:\n• 🚗 **Licencias de Conducir & Turnos**\n• 💳 **Tasas Municipales en APR (Tasa SUM)**\n• ⚖️ **Infracciones de Tránsito y Descargos**\n• 🛠️ **Reclamos y Servicios Urbanos 147**\n• 🌲 **Turismo, Historia y Paseos**\n\n¿Cómo prefieres que nos comuniquemos hoy?`;
      } else if (q.includes('licencia') || q.includes('turno')) {
        text = `🚗 **Turnos para Licencias de Conducir:**\nPuedes renovar u obtener tu licencia en la Sede Central (Calle 20 y 50) o en los Centros Comunales.\n\nPara confirmar tu turno en el sistema oficial, indícame tu **DNI** y el tipo de trámite (Renovación, Original o Duplicado).`;
      } else if (q.includes('deuda') || q.includes('tasa') || q.includes('apr')) {
        text = `💳 **Agencia Platense de Recaudación (APR):**\nPuedes abonar la Tasa por Servicios Urbanos Municipales (SUM) con un **15% de descuento** por pago al contado.\n\nIndícame tu **DNI, CUIT, Partida Inmobiliaria o Patente** para consultar el estado en el padrón oficial.`;
      } else if (q.includes('multa') || q.includes('infraccion')) {
        text = `⚖️ **Juzgado de Faltas de La Plata:**\nDispones del beneficio de **50% de descuento por pago voluntario** en los primeros 30 días.\n\nPor favor, facilítame el **Dominio/Patente de tu vehículo** o tu **DNI** para verificar actas pendientes.`;
      } else if (q.includes('turismo') || q.includes('secreto') || q.includes('historia')) {
        text = `🌲 **Guía Turística & Secretos de La Plata:**\n• **La Catedral Neogótica:** Uno de los templos más imponentes de América, con ascensor a sus torres.\n• **Paseo del Bosque & Museo de Ciencias:** Referente mundial paleontológico.\n• **Secretos de las Diagonales:** Traza perfecta con rombos masónicos y una plaza pública cada 6 cuadras.\n• **Gastronomía:** Polo de City Bell y Meridiano V en la estación histórica de trenes.`;
      }

      this.appendBotMessage({
        text: text,
        outputMode: this.currentMode,
        quickReplies: [
          { id: 'qr_lic', title: '🚗 Licencias', payload: 'Quiero turno para licencia' },
          { id: 'qr_tasas', title: '💳 Tasas APR', payload: 'Consultar deuda de tasas APR' },
          { id: 'qr_multas', title: '⚖️ Multas', payload: 'Consultar infracciones de tránsito' },
          { id: 'qr_tur', title: '🌲 Turismo', payload: 'Lugares históricos y paseos' }
        ]
      });
    }

    appendUserMessage(text, type = 'text') {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'mun-msg mun-user';
      msgDiv.innerHTML = `
        <div class="mun-msg-avatar"><i class="fa-solid fa-user"></i></div>
        <div class="mun-msg-bubble">
          <div>${this.formatMarkdown(text)}</div>
          <span class="mun-msg-time">${this.getTimeString()}</span>
        </div>
      `;
      this.dom.messages.appendChild(msgDiv);
      this.scrollToBottom();
    }

    appendBotMessage(data) {
      const rawText = data.text || data.output || '';
      const hasAudio = !!(data.audioUrl || data.audioBase64);
      const audioSrc = data.audioUrl || data.audioBase64;

      const msgDiv = document.createElement('div');
      msgDiv.className = 'mun-msg mun-bot';

      let audioPlayerHtml = '';
      if (hasAudio) {
        audioPlayerHtml = `
          <div class="mun-audio-player" data-audio-src="${audioSrc}">
            <button class="mun-audio-play-btn" title="Reproducir respuesta de voz">
              <i class="fa-solid fa-play"></i>
            </button>
            <div class="mun-audio-waveform">
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
              <span class="mun-waveform-bar"></span>
            </div>
            <span class="mun-audio-timer">00:00</span>
          </div>
        `;
      }

      let quickRepliesHtml = '';
      if (data.quickReplies && data.quickReplies.length > 0) {
        const modeButtons = data.quickReplies.filter(qr => 
          (qr.id && qr.id.includes('mode')) || 
          (qr.payload && qr.payload.includes('mode')) ||
          (qr.title && (qr.title.toLowerCase().includes('seguir') || qr.title.toLowerCase().includes('modo')))
        );
        const topicButtons = data.quickReplies.filter(qr => !modeButtons.includes(qr));

        quickRepliesHtml = '<div class="mun-quick-replies-wrapper">';
        
        // 1. Sección de Preferencia de Modo (Voz / Mensaje)
        if (modeButtons.length > 0) {
          quickRepliesHtml += `
            <div class="mun-qr-section">
              <div class="mun-qr-label"><i class="fa-solid fa-sliders"></i> Elige tu modo de respuesta:</div>
              <div class="mun-qr-grid-modes">
                ${modeButtons.map(qr => {
                  const isVoice = qr.id === 'btn_mode_voice' || (qr.title && qr.title.toLowerCase().includes('voz'));
                  const btnClass = isVoice ? 'mun-qr-btn mun-qr-btn-voice' : 'mun-qr-btn mun-qr-btn-text';
                  const icon = isVoice ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-regular fa-comment-dots"></i>';
                  return `<button class="${btnClass}" data-payload="${qr.payload || qr.id}">${icon} <span>${qr.title}</span></button>`;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 2. Sección de Trámites y Consultas Frecuentes
        if (topicButtons.length > 0) {
          quickRepliesHtml += `
            <div class="mun-qr-section">
              <div class="mun-qr-label"><i class="fa-solid fa-compass"></i> Opciones rápidas de consulta:</div>
              <div class="mun-qr-grid-topics">
                ${topicButtons.map(qr => {
                  return `<button class="mun-qr-btn mun-qr-btn-topic" data-payload="${qr.payload || qr.id}"><span>${qr.title}</span> <i class="fa-solid fa-chevron-right mun-qr-arrow"></i></button>`;
                }).join('')}
              </div>
            </div>
          `;
        }

        quickRepliesHtml += '</div>';
      }

      msgDiv.innerHTML = `
        <div class="mun-msg-avatar"><i class="fa-solid fa-landmark-dome"></i></div>
        <div class="mun-msg-bubble">
          <div>${this.formatMarkdown(rawText)}</div>
          ${audioPlayerHtml}
          ${quickRepliesHtml}
          <span class="mun-msg-time">${this.getTimeString()}</span>
        </div>
      `;

      this.dom.messages.appendChild(msgDiv);
      this.scrollToBottom();

      // Bind Audio Player
      if (hasAudio) {
        const player = msgDiv.querySelector('.mun-audio-player');
        this.setupAudioPlayer(player, audioSrc, data.spokenText || rawText);
      }

      // Bind Quick Replies
      const qrBtns = msgDiv.querySelectorAll('.mun-qr-btn');
      qrBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const payload = btn.getAttribute('data-payload');
          if (payload === 'btn_mode_text') {
            this.setMode('text');
          } else if (payload === 'btn_mode_voice') {
            this.setMode('voice');
          } else {
            this.appendUserMessage(btn.textContent.trim(), 'text');
            this.sendMessagePayload({ message: payload });
          }
        });
      });
    }

    unlockAudio() {
      if (this.audioUnlocked) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!this.audioContext) this.audioContext = new AudioCtx();
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
          }
        }
      } catch (e) {}

      try {
        if (!this.dummyAudio) {
          this.dummyAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        }
        this.dummyAudio.play().then(() => {
          this.dummyAudio.pause();
        }).catch(() => {});
      } catch (e) {}

      try {
        if (window.speechSynthesis) {
          window.speechSynthesis.resume();
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
      } catch (e) {}

      this.audioUnlocked = true;
    }

    setupAudioPlayer(playerEl, src, spokenTextFallback = '') {
      const playBtn = playerEl.querySelector('.mun-audio-play-btn');
      const timerEl = playerEl.querySelector('.mun-audio-timer');
      const icon = playBtn.querySelector('i');
      let audio = null;
      let isPlaying = false;

      // Normalizar formato MIME para compatibilidad 100% con iOS Safari
      let cleanSrc = src ? src.trim() : '';
      if (cleanSrc.startsWith('data:audio/mp3')) {
        cleanSrc = cleanSrc.replace('data:audio/mp3', 'data:audio/mpeg');
      }

      const stopAllAudio = () => {
        if (this.currentPlayingAudio) {
          try {
            if (this.currentPlayingAudio.pause) this.currentPlayingAudio.pause();
          } catch (e) {}
          this.currentPlayingAudio = null;
        }
        if (window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        document.querySelectorAll('.mun-audio-player.playing').forEach(p => {
          p.classList.remove('playing');
          const pIcon = p.querySelector('.mun-audio-play-btn i');
          if (pIcon) pIcon.className = 'fa-solid fa-play';
        });
      };

      const startPlayback = () => {
        this.unlockAudio();
        stopAllAudio();
        isPlaying = true;
        playerEl.classList.add('playing');
        icon.className = 'fa-solid fa-pause';

        if (cleanSrc && (cleanSrc.startsWith('data:audio') || cleanSrc.startsWith('http'))) {
          try {
            audio = new Audio();
            audio.preload = 'auto';
            audio.volume = 1.0;
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            audio.src = cleanSrc;
            this.currentPlayingAudio = audio;

            audio.addEventListener('timeupdate', () => {
              const cur = Math.floor(audio.currentTime);
              const mins = String(Math.floor(cur / 60)).padStart(2, '0');
              const secs = String(cur % 60).padStart(2, '0');
              timerEl.textContent = `${mins}:${secs}`;
            });

            audio.addEventListener('ended', () => {
              isPlaying = false;
              playerEl.classList.remove('playing');
              icon.className = 'fa-solid fa-play';
              timerEl.textContent = '00:00';
            });

            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                console.warn('HTML5 Audio playback prevented, using SpeechSynthesis fallback:', err);
                this.playSpeechSynthesis(spokenTextFallback, playerEl, timerEl, icon);
              });
            }
          } catch (e) {
            this.playSpeechSynthesis(spokenTextFallback, playerEl, timerEl, icon);
          }
        } else if (spokenTextFallback) {
          this.playSpeechSynthesis(spokenTextFallback, playerEl, timerEl, icon);
        }
      };

      const pausePlayback = () => {
        isPlaying = false;
        playerEl.classList.remove('playing');
        icon.className = 'fa-solid fa-play';
        if (audio) {
          try { audio.pause(); } catch (e) {}
        }
        if (window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (e) {}
        }
      };

      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.unlockAudio();
        if (isPlaying) {
          pausePlayback();
        } else {
          startPlayback();
        }
      });

      playerEl.addEventListener('click', () => {
        this.unlockAudio();
        if (!isPlaying) startPlayback();
      });

      // Si el modo voz está activo, intentar reproducción automática
      if (this.currentMode === 'voice') {
        setTimeout(() => {
          startPlayback();
        }, 300);
      }
    }

    playSpeechSynthesis(text, playerEl, timerEl, icon) {
      if (!window.speechSynthesis || !text) {
        if (playerEl) playerEl.classList.remove('playing');
        if (icon) icon.className = 'fa-solid fa-play';
        return;
      }
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch (e) {}

      const cleanText = text.replace(/[*_#`~]/g, '').replace(/https?:\/\/[^\s)]+/g, 'el enlace oficial adjunto').slice(0, 500);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find(v => v.lang && (v.lang.startsWith('es') || v.lang.includes('Spanish')));
      if (esVoice) utterance.voice = esVoice;

      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed++;
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      }, 1000);

      utterance.onend = () => {
        clearInterval(interval);
        if (playerEl) playerEl.classList.remove('playing');
        if (icon) icon.className = 'fa-solid fa-play';
        if (timerEl) timerEl.textContent = '00:00';
      };

      utterance.onerror = () => {
        clearInterval(interval);
        if (playerEl) playerEl.classList.remove('playing');
        if (icon) icon.className = 'fa-solid fa-play';
      };

      window.speechSynthesis.speak(utterance);
    }

    showTypingIndicator() {
      const ind = document.createElement('div');
      ind.className = 'mun-msg mun-bot mun-typing-wrapper';
      ind.innerHTML = `
        <div class="mun-msg-avatar"><i class="fa-solid fa-landmark-dome"></i></div>
        <div class="mun-typing-indicator">
          <span></span><span></span><span></span>
        </div>
      `;
      this.dom.messages.appendChild(ind);
      this.scrollToBottom();
      return ind;
    }

    removeTypingIndicator(el) {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }

    formatMarkdown(text) {
      if (!text) return '';
      let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Bold: **text** or *text*
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

      // URLs: [text](url) or raw http
      formatted = formatted.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
        if (match.includes('</a>')) return match;
        return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
      });

      // Bullets
      formatted = formatted.replace(/^[•\-\*]\s+(.*)$/gm, '<li>$1</li>');
      formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

      // Newlines
      formatted = formatted.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
      return `<p>${formatted}</p>`;
    }

    getTimeString() {
      const now = new Date();
      return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    scrollToBottom() {
      this.dom.messages.scrollTop = this.dom.messages.scrollHeight;
    }
  }

  window.MunicipalChatWidget = MunicipalChatWidget;

  // Auto-init si la página tiene el atributo data-auto-init
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-municipal-chat-auto-init]')) {
      window.municipalChatInstance = new MunicipalChatWidget();
    }
  });

})(window);
