#!/bin/bash
# ------------------------------------------------------------------
# SashimiLix - 1-Click Server Launcher untuk macOS
# Klik ganda (double-click) file ini di Finder untuk langsung jalan!
# ------------------------------------------------------------------

# Pindah ke direktori proyek (lokasi file ini berada)
cd "$(dirname "$0")"

clear
echo "========================================================"
echo "🌸  SASHIMILIX SERVER LAUNCHER (1-CLICK RUN)"
echo "========================================================"
echo "📍 Lokasi Proyek: $(pwd)"
echo ""

# 1. Cek apakah node_modules sudah ada
if [ ! -d "node_modules" ]; then
  echo "📦 Menyiapkan dependencies (npm install)..."
  npm install
  if [ $? -ne 0 ]; then
    echo "❌ Gagal menginstall dependencies. Tekan tombol apa saja untuk keluar."
    read -n 1
    exit 1
  fi
fi

# 2. Compile TypeScript
echo "🔨 Mengompilasi kode server (TypeScript)..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Kompilasi TypeScript gagal. Silakan periksa error di atas."
  read -n 1
  exit 1
fi

echo ""
echo "✨ Build berhasil!"
echo "🚀 Menjalankan server..."
echo "🌐 Browser akan otomatis terbuka di http://localhost:3000"
echo "🛑 Tekan CTRL + C di jendela ini untuk mematikan server."
echo "========================================================"
echo ""

# 3. Buka browser otomatis setelah 1.5 detik
(sleep 1.5 && open "http://localhost:3000") &

# 4. Jalankan server Node
node dist/server.js
