#!/bin/bash
# ------------------------------------------------------------------
# SashimiLix - Terminal Run Script
# Jalankan di terminal: ./run.sh
# ------------------------------------------------------------------

cd "$(dirname "$0")"

clear
echo "========================================================"
echo "🌸  SASHIMILIX SERVER (Terminal Launcher)"
echo "========================================================"

if [ ! -d "node_modules" ]; then
  echo "📦 Menyiapkan dependencies (npm install)..."
  npm install
fi

echo "🔨 Mengompilasi TypeScript..."
npm run build

echo ""
echo "🚀 Menjalankan server di http://localhost:3000 ..."
(sleep 1.5 && open "http://localhost:3000") &

node dist/server.js
