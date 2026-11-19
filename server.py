#!/usr/bin/env python3
"""
SashimiLix Local Development & Neon PostgreSQL Bridge Server
Menjalankan server statis lokal sekaligus opsi API proxy jika diperlukan.
Penggunaan:
    python3 server.py [PORT] (default: 8080)
"""

import os
import sys
import json
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

class SashimiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # Health check endpoint
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'ok',
                'service': 'SashimiLix Dev Server',
                'neon_compatible': True
            }).encode('utf-8'))
            return

        return super().do_GET()

def run():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, SashimiHandler)
    print(f"==================================================")
    print(f"🌸 SashimiLix Server Berjalan di: http://localhost:{PORT}")
    print(f"📁 Root Direktori: {DIRECTORY}")
    print(f"⚡ Neon PostgreSQL Web Client: Aktif")
    print(f"Tekan Ctrl+C untuk menghentikan server.")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server dihentikan.")
        httpd.server_close()

if __name__ == '__main__':
    run()
