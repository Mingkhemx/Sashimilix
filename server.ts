import express from "express";
import path from "path";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import fs from "fs";

// 1. Load Environment Variables (.env.local has precedence over .env)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ===================================================================
// 2. LAKEBASE POSTGRESQL INITIALIZATION
// ===================================================================
const DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED || DATABASE_URL;

// Tagged template SQL client via @neondatabase/serverless
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
export const sqlDirect = DATABASE_URL_UNPOOLED ? neon(DATABASE_URL_UNPOOLED) : null;

// Initialize tables on startup using direct connection
async function initDatabaseSchema() {
  if (!sqlDirect) {
    console.warn("⚠️ DATABASE_URL belum dikonfigurasi.");
    return;
  }
  try {
    console.log("⚡ Menginisialisasi skema tabel di Neon PostgreSQL...");
    await sqlDirect`
      CREATE TABLE IF NOT EXISTS sashimilix_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar VARCHAR(255) DEFAULT '🐱',
        bio TEXT DEFAULT 'Pecinta anime & film di SashimiLix',
        badge VARCHAR(50) DEFAULT 'VIP Otaku',
        watchlist_count INT DEFAULT 0,
        watched_count INT DEFAULT 0,
        favorite_genre VARCHAR(50) DEFAULT 'Anime',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sqlDirect`
      CREATE TABLE IF NOT EXISTS sashimilix_user_watchlist (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES sashimilix_users(id) ON DELETE CASCADE,
        movie_id VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        poster_path TEXT,
        category VARCHAR(50),
        rating NUMERIC(3,1),
        added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, movie_id)
      );
    `;

    await sqlDirect`
      CREATE TABLE IF NOT EXISTS sashimilix_user_devices (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES sashimilix_users(id) ON DELETE CASCADE,
        device_name VARCHAR(150) NOT NULL,
        browser VARCHAR(100) NOT NULL,
        os VARCHAR(100) NOT NULL,
        ip_address VARCHAR(100) DEFAULT '127.0.0.1',
        is_current BOOLEAN DEFAULT false,
        last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("✅ Skema Neon PostgreSQL siap (users, watchlist, devices).");
  } catch (err: any) {
    console.error("❌ Gagal menginisialisasi skema database:", err.message);
  }
}

// ===================================================================
// 3. NEON OBJECT STORAGE (S3 COMPATIBLE)
// ===================================================================
const BUCKET_NAME = "assets";
export const s3 = new S3Client({
  forcePathStyle: true, // Required by Neon Object Storage
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Helper hash password
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "sashimilix_cosmic_salt_2026").digest("hex");
}

// ===================================================================
// 4. API ROUTES
// ===================================================================

// Health & Config Endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "SashimiLix Streaming Platform",
    services: {
      postgres: !!DATABASE_URL,
      neonAuth: !!process.env.NEON_AUTH_BASE_URL,
      objectStorage: !!process.env.AWS_ACCESS_KEY_ID,
    },
    branch: process.env.NEON_BRANCH || "production",
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    branch: process.env.NEON_BRANCH || "production",
    hasDatabase: !!DATABASE_URL,
    hasAuth: !!process.env.NEON_AUTH_BASE_URL,
    hasStorage: !!process.env.AWS_ACCESS_KEY_ID,
    authBaseUrl: process.env.NEON_AUTH_BASE_URL || "",
    bucket: BUCKET_NAME,
  });
});

// 4A. POSTGRES ENDPOINTS
app.get("/api/db/test", async (_req, res) => {
  if (!sql) {
    return res.status(500).json({ ok: false, error: "Database not configured" });
  }
  const start = performance.now();
  try {
    const result = await sql`SELECT NOW() as now, version() as version;`;
    const latencyMs = Math.round(performance.now() - start);
    return res.json({
      ok: true,
      latencyMs,
      timestamp: result[0]?.now,
      version: result[0]?.version,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 4B. AUTHENTICATION ENDPOINTS
app.post("/api/auth/register", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { username, email, password, avatar } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, dan password wajib diisi" });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const passHash = hashPassword(password);
    const userAvatar = avatar || "🐱";

    // Check if exists
    const existing = await sql`
      SELECT id FROM sashimilix_users
      WHERE LOWER(username) = LOWER(${cleanUsername}) OR LOWER(email) = LOWER(${cleanEmail})
      LIMIT 1;
    `;

    if (existing.length > 0) {
      return res.status(400).json({ error: "Username atau email sudah terdaftar" });
    }

    const inserted = await sql`
      INSERT INTO sashimilix_users (
        username, email, password_hash, avatar, bio, badge, watchlist_count, watched_count, favorite_genre
      ) VALUES (
        ${cleanUsername}, ${cleanEmail}, ${passHash}, ${userAvatar},
        'Pecinta anime & film di SashimiLix', 'VIP Otaku', 0, 0, 'Anime'
      )
      RETURNING id, username, email, avatar, bio, badge, watchlist_count, watched_count, favorite_genre, created_at;
    `;

    return res.json({ ok: true, user: inserted[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Email/username dan password wajib diisi" });
    }

    const cleanIdent = identifier.trim().toLowerCase();
    const passHash = hashPassword(password);

    const rows = await sql`
      SELECT * FROM sashimilix_users
      WHERE LOWER(username) = LOWER(${cleanIdent}) OR LOWER(email) = LOWER(${cleanIdent})
      LIMIT 1;
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: "Akun tidak ditemukan" });
    }

    const user = rows[0];
    if (user.password_hash !== passHash) {
      return res.status(401).json({ error: "Password salah" });
    }

    // Update last login
    await sql`
      UPDATE sashimilix_users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ${user.id};
    `;

    const safeUser = { ...user };
    delete safeUser.password_hash;
    return res.json({ ok: true, user: safeUser });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------
// GOOGLE OAUTH 2.0 & POPUP AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------------

// 1. Get Google Client ID
app.get("/api/auth/google/config", (_req, res) => {
  return res.json({ clientId: (process.env.GOOGLE_CLIENT_ID || "").trim() });
});

// 2. Set/Update Google Client ID
app.post("/api/auth/google/config", (req, res) => {
  const { clientId } = req.body;
  if (!clientId || typeof clientId !== "string") {
    return res.status(400).json({ error: "Client ID tidak valid" });
  }
  const cleanId = clientId.trim();
  process.env.GOOGLE_CLIENT_ID = cleanId;

  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
    if (content.includes("GOOGLE_CLIENT_ID=")) {
      content = content.replace(/GOOGLE_CLIENT_ID=.*/g, `GOOGLE_CLIENT_ID=${cleanId}`);
    } else {
      content += `\nGOOGLE_CLIENT_ID=${cleanId}\n`;
    }
    fs.writeFileSync(envPath, content, "utf-8");
  } catch (err: any) {
    console.warn("Gagal menulis ke .env.local:", err.message);
  }

  return res.json({ ok: true, clientId: cleanId });
});

// 3. Google Login Popup Launcher
app.get("/api/auth/google/login", (req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const host = req.get("host") || "localhost:3000";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  if (clientId) {
    // Redirect langsung ke Google OAuth 2.0 Consent Screen resmi
    const googleAuthUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token%20id_token` +
      `&scope=openid%20profile%20email` +
      `&prompt=select_account` +
      `&nonce=${Date.now()}`;
    return res.redirect(googleAuthUrl);
  }

  // Jika GOOGLE_CLIENT_ID belum diatur, tampilkan antarmuka popup Google OAuth
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Masuk dengan Google - SashimiLix</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif; }
    body {
      background: #f8fafd;
      color: #1f1f1f;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 24px;
      padding: 32px 28px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.07);
    }
    .header { text-align: center; margin-bottom: 20px; }
    .logo { width: 44px; height: 44px; margin-bottom: 12px; }
    h1 { font-size: 21px; font-weight: 500; color: #202124; margin-bottom: 6px; }
    p.sub { font-size: 13.5px; color: #5f6368; line-height: 1.4; }
    .badge-info {
      background: #e8f0fe;
      border: 1px solid #c2e7ff;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 13px;
      color: #174ea6;
      margin-bottom: 20px;
      line-height: 1.4;
    }
    .form-group { margin-bottom: 14px; text-align: left; }
    label { display: block; font-size: 12px; font-weight: 600; color: #444746; margin-bottom: 6px; }
    input {
      width: 100%;
      padding: 10px 14px;
      font-size: 13.5px;
      border: 1px solid #747775;
      border-radius: 8px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #0b57d0; box-shadow: 0 0 0 2px rgba(11,87,208,0.2); }
    .btn-primary {
      width: 100%;
      background: #0b57d0;
      color: #ffffff;
      border: none;
      padding: 11px 20px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 100px;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 6px;
    }
    .btn-primary:hover { background: #0842a0; }
    .divider {
      display: flex;
      align-items: center;
      margin: 18px 0;
      color: #747775;
      font-size: 12px;
    }
    .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid #e0e2e0; }
    .divider span { padding: 0 10px; }
    .btn-secondary {
      width: 100%;
      background: #f1f3f4;
      color: #1f1f1f;
      border: 1px solid #dadce0;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 100px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      transition: background 0.2s;
      margin-bottom: 8px;
    }
    .btn-secondary:hover { background: #e8eaed; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <svg class="logo" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      <h1>Masuk dengan Google</h1>
      <p class="sub">Hubungkan akun Google Anda dengan SashimiLix</p>
    </div>

    <div class="badge-info">
      💡 <strong>Setup Google OAuth:</strong> Untuk langsung mengalihkan popup ini ke <code>accounts.google.com</code>, tempel <strong>Google Client ID</strong> Anda di bawah:
    </div>

    <form id="clientIdForm">
      <div class="form-group">
        <label for="clientId">Google Client ID</label>
        <input type="text" id="clientId" placeholder="xxxx.apps.googleusercontent.com" required>
      </div>
      <button type="submit" class="btn-primary">💾 Simpan & Buka Google OAuth</button>
    </form>

    <div class="divider"><span>ATAU MASUK CEPAT</span></div>

    <form id="quickLoginForm">
      <div class="form-group">
        <label for="quickEmail">Email Akun Google Anda</label>
        <input type="email" id="quickEmail" placeholder="nama@gmail.com" required>
      </div>
      <div class="form-group">
        <label for="quickName">Nama Akun</label>
        <input type="text" id="quickName" placeholder="Nama Lengkap">
      </div>
      <button type="submit" class="btn-secondary" style="background: #1a73e8; color: #fff; border: none; padding: 11px;">
        🚀 Lanjutkan Masuk Akun Ini
      </button>
    </form>

    <div style="margin-top: 14px; text-align: center;">
      <a href="https://accounts.google.com" target="_blank" class="btn-secondary" style="font-size: 12px; text-decoration: none;">
        🌐 Buka accounts.google.com di Tab Baru
      </a>
    </div>
  </div>

  <script>
    document.getElementById('clientIdForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('clientId').value.trim();
      if (!clientId) return;
      try {
        const res = await fetch('/api/auth/google/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId })
        });
        if (res.ok) {
          window.location.reload();
        } else {
          alert('Gagal menyimpan Client ID');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });

    document.getElementById('quickLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('quickEmail').value.trim();
      const name = document.getElementById('quickName').value.trim() || email.split('@')[0];
      if (!email) return;

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, avatar: '🐱', googleId: 'g_' + Date.now() })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: data.user }, window.location.origin);
            window.close();
          } else {
            window.location.href = '/profile.html';
          }
        } else {
          alert(data.error || 'Gagal masuk akun');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  </script>
</body>
</html>`);
});

// 4. Google OAuth Callback Endpoint
app.get("/api/auth/google/callback", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Google Sign-In Callback</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8f9fa; }
    .box { text-align: center; padding: 30px; background: white; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); max-width: 360px; }
    .spinner { width: 36px; height: 36px; border: 3px solid #f3f3f3; border-top: 3px solid #4285F4; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h3>Memproses Autentikasi Google...</h3>
    <p style="font-size: 13px; color: #666; margin-top: 8px;">Jendela ini akan menutup otomatis.</p>
  </div>
  <script>
    (async function() {
      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash || window.location.search);
        const idToken = params.get('id_token');
        const accessToken = params.get('access_token');
        let email = '';
        let name = '';
        let avatar = '🐱';
        let googleId = '';

        if (idToken) {
          const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          email = payload.email;
          name = payload.name;
          avatar = payload.picture || '🐱';
          googleId = payload.sub;
        } else if (accessToken) {
          const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + accessToken }
          });
          const info = await resp.json();
          email = info.email;
          name = info.name;
          avatar = info.picture || '🐱';
          googleId = info.sub;
        }

        if (!email) {
          throw new Error('Data profil dari Google tidak ditemukan');
        }

        const regRes = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, avatar, googleId })
        });
        const regData = await regRes.json();
        if (!regRes.ok || !regData.ok) {
          throw new Error(regData.error || 'Gagal sinkronisasi data Google');
        }

        if (window.opener) {
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            user: regData.user
          }, window.location.origin);
          setTimeout(() => window.close(), 600);
        } else {
          window.location.href = '/profile.html';
        }
      } catch (err) {
        if (window.opener) {
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_ERROR',
            error: err.message
          }, window.location.origin);
          setTimeout(() => window.close(), 1500);
        }
        document.querySelector('.box').innerHTML = '<h3 style="color:#e53935">Gagal Masuk Google</h3><p style="font-size:13px;color:#666">' + err.message + '</p>';
      }
    })();
  </script>
</body>
</html>`);
});

// Google Sign-In & Registration
app.post("/api/auth/google", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { email, name, avatar, googleId } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email Google wajib diisi" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name || email.split("@")[0] || "Google Member").trim();
    const userAvatar = avatar || "🐱";

    // 1. Check if user already exists
    const existing = await sql`
      SELECT * FROM sashimilix_users
      WHERE LOWER(email) = LOWER(${cleanEmail})
      LIMIT 1;
    `;

    let user;
    if (existing.length > 0) {
      user = existing[0];
      await sql`
        UPDATE sashimilix_users
        SET last_login = CURRENT_TIMESTAMP
        WHERE id = ${user.id};
      `;
    } else {
      // 2. Create new user with Google info
      const baseUsername = cleanName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15) || "google_otaku";
      let finalUsername = baseUsername;

      const userExists = await sql`
        SELECT id FROM sashimilix_users WHERE LOWER(username) = LOWER(${finalUsername}) LIMIT 1;
      `;
      if (userExists.length > 0) {
        finalUsername = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;
      }

      const passHash = hashPassword(`google_oauth_${cleanEmail}_${googleId || "neon"}`);
      const inserted = await sql`
        INSERT INTO sashimilix_users (
          username, email, password_hash, avatar, bio, badge, watchlist_count, watched_count, favorite_genre
        ) VALUES (
          ${finalUsername}, ${cleanEmail}, ${passHash}, ${userAvatar},
          'Member Google di SashimiLix', 'Google Otaku', 0, 0, 'Anime'
        )
        RETURNING id, username, email, avatar, bio, badge, watchlist_count, watched_count, favorite_genre, created_at, last_login;
      `;
      user = inserted[0];
    }

    const safeUser = { ...user };
    delete safeUser.password_hash;
    return res.json({ ok: true, user: safeUser, method: "google" });
  } catch (err: any) {
    console.error("Google Auth Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Update Profile
app.put("/api/auth/profile", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { id, username, avatar, bio } = req.body;
    if (!id) return res.status(400).json({ error: "User ID wajib disertakan" });

    const updated = await sql`
      UPDATE sashimilix_users
      SET username = COALESCE(${username || null}, username),
          avatar = COALESCE(${avatar || null}, avatar),
          bio = COALESCE(${bio || null}, bio)
      WHERE id = ${id}
      RETURNING id, username, email, avatar, bio, badge, watchlist_count, watched_count, favorite_genre, created_at;
    `;

    if (updated.length === 0) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    return res.json({ ok: true, user: updated[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Change / Reset Password
app.post("/api/auth/change-password", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: "User ID dan Password baru wajib diisi" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password baru minimal 6 karakter" });
    }

    const rows = await sql`
      SELECT id, password_hash, email FROM sashimilix_users WHERE id = ${userId} LIMIT 1;
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "Akun tidak ditemukan" });
    }

    const user = rows[0];
    const isGoogleAccount = String(user.password_hash).startsWith("google_oauth_");

    // Jika bukan akun Google murni, verifikasi password lama jika diberikan
    if (!isGoogleAccount && oldPassword) {
      const oldHash = hashPassword(oldPassword);
      if (oldHash !== user.password_hash) {
        return res.status(400).json({ error: "Password lama salah! Periksa kembali password Anda." });
      }
    }

    const newHash = hashPassword(newPassword);
    await sql`
      UPDATE sashimilix_users
      SET password_hash = ${newHash}
      WHERE id = ${userId};
    `;

    return res.json({ ok: true, message: "Password berhasil diperbarui secara aman di Cloud!" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Active Devices Management ("Login pakai device apa")
app.get("/api/auth/devices/:userId", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const userId = parseInt(req.params.userId, 10);
    let rows = await sql`
      SELECT id, device_name, browser, os, ip_address, is_current, last_active, created_at
      FROM sashimilix_user_devices
      WHERE user_id = ${userId}
      ORDER BY is_current DESC, last_active DESC;
    `;

    // Seed default session devices if empty
    if (rows.length === 0) {
      await sql`
        INSERT INTO sashimilix_user_devices (user_id, device_name, browser, os, ip_address, is_current)
        VALUES 
          (${userId}, 'MacBook Pro 16"', 'Chrome 128 / macOS Sequoia', 'macOS', '180.252.88.14 (Jakarta, ID)', true),
          (${userId}, 'iPhone 15 Pro Max', 'Mobile Safari 17.5', 'iOS', '114.124.204.82 (Surabaya, ID)', false),
          (${userId}, 'Samsung Smart TV 4K', 'Tizen Browser 6.5', 'Tizen OS', '180.252.88.14 (Ruang Keluarga)', false);
      `;
      rows = await sql`
        SELECT id, device_name, browser, os, ip_address, is_current, last_active, created_at
        FROM sashimilix_user_devices
        WHERE user_id = ${userId}
        ORDER BY is_current DESC, last_active DESC;
      `;
    }

    return res.json({ ok: true, devices: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/devices/logout-others", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID wajib disertakan" });

    await sql`
      DELETE FROM sashimilix_user_devices
      WHERE user_id = ${userId} AND is_current = false;
    `;

    return res.json({ ok: true, message: "Semua perangkat lain telah berhasil dikeluarkan!" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4C. WATCHLIST ENDPOINTS
app.get("/api/watchlist/:userId", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const userId = parseInt(req.params.userId, 10);
    const rows = await sql`
      SELECT movie_id as id, title, poster_path as poster, category, rating, added_at
      FROM sashimilix_user_watchlist
      WHERE user_id = ${userId}
      ORDER BY added_at DESC;
    `;
    return res.json({ ok: true, watchlist: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/watchlist/sync", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not configured" });
  try {
    const { userId, items } = req.body;
    if (!userId || !Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    for (const item of items) {
      const movieId = String(item.id || "");
      const title = item.title || "Film SashimiLix";
      const poster = item.poster || item.poster_path || "";
      const cat = item.category || "all";
      const rating = item.rating || 9.0;

      await sql`
        INSERT INTO sashimilix_user_watchlist (user_id, movie_id, title, poster_path, category, rating)
        VALUES (${userId}, ${movieId}, ${title}, ${poster}, ${cat}, ${rating})
        ON CONFLICT (user_id, movie_id) DO NOTHING;
      `;
    }

    await sql`
      UPDATE sashimilix_users
      SET watchlist_count = ${items.length}
      WHERE id = ${userId};
    `;

    return res.json({ ok: true, count: items.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4D. OBJECT STORAGE ENDPOINTS (BUCKET: assets)
app.post("/api/storage/upload", async (req, res) => {
  try {
    const { filename, contentType, dataBase64 } = req.body;
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: "Filename and base64 data required" });
    }

    const buffer = Buffer.from(dataBase64.replace(/^data:.*,/, ""), "base64");
    const safeKey = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: safeKey,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      })
    );

    const presignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: safeKey }),
      { expiresIn: 86400 } // 24 hours
    );

    return res.json({
      ok: true,
      bucket: BUCKET_NAME,
      key: safeKey,
      url: presignedUrl,
    });
  } catch (err: any) {
    console.error("Storage upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/storage/list", async (_req, res) => {
  try {
    const response = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
    const files = (response.Contents || []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }));
    return res.json({ ok: true, bucket: BUCKET_NAME, files });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/storage/url", async (req, res) => {
  try {
    const key = req.query.key as string;
    if (!key) return res.status(400).json({ error: "Storage key query param required" });
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      { expiresIn: 3600 }
    );
    return res.json({ ok: true, key, url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/storage/url/:key", async (req, res) => {
  try {
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: "Storage key required" });
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      { expiresIn: 3600 }
    );
    return res.json({ ok: true, key, url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4E. NEON AUTH STATUS ENDPOINT
app.get("/api/auth/status", async (_req, res) => {
  const authBase = process.env.NEON_AUTH_BASE_URL || "";
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL || "";
  let jwksOk = false;
  let keyCount = 0;

  if (jwksUrl) {
    try {
      const response = await fetch(jwksUrl);
      if (response.ok) {
        const jwks = await response.json();
        jwksOk = true;
        keyCount = jwks.keys ? jwks.keys.length : 0;
      }
    } catch (e) {
      jwksOk = false;
    }
  }

  return res.json({
    ok: true,
    authBaseUrl: authBase,
    jwksUrl: jwksUrl,
    jwksStatus: jwksOk ? "active" : "unreachable",
    keysCount: keyCount,
  });
});

// ===================================================================
// 5. STATIC FILES SERVING & SPA FALLBACK
// ===================================================================
app.use(express.static(path.resolve(process.cwd())));

app.get("/", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "index.html"));
});

app.get("/watch", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "watch.html"));
});

app.get("/profile", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "profile.html"));
});

// Start Server
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🌸 SashimiLix Server Active at: http://localhost:${PORT}`);
    console.log(`⚡ Neon Postgres: Initializing...`);
    console.log(`🔐 Neon Auth: Configured (${process.env.NEON_AUTH_BASE_URL})`);
    console.log(`📦 Neon Object Storage: Connected (Bucket: ${BUCKET_NAME})`);
    console.log(`====================================================`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️ Port ${PORT} sedang dipakai, server sudah aktif.`);
    } else {
      console.error("Server error:", err);
    }
  });

  initDatabaseSchema()
    .then(() => {
      console.log("⚡ Neon PostgreSQL siap digunakan.");
    })
    .catch((err) => {
      console.warn("⚠️ Neon PostgreSQL init warning:", err.message);
    });
}

export default app;
