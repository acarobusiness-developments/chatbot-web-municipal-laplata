#!/bin/bash
# ========================================================
# 🏛️ INICIADOR LOCAL - CHATBOT WEB & DASHBOARD
# Municipalidad de La Plata
# ========================================================

echo "🚀 Iniciando Portal Web, Chatbot y Dashboard..."

# Obtener directorio del script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Liberar puerto 3000 si estuviera ocupado
kill $(lsof -t -i :3000) 2>/dev/null || true

# Iniciar servidor Node.js
node server.js
