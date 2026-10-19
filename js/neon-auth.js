/**
 * SashimiLix - Neon PostgreSQL Authentication & Profile System
 * Supports:
 * - Serverless PostgreSQL via @neondatabase/serverless HTTP driver
 * - Web Crypto API (SHA-256) password hashing
 * - LocalStorage resilient fallback with instant cloud sync
 * - Interactive Claymorphic Auth & Profile Modal
 */

(function () {
  'use strict';

  // State keys in LocalStorage
  const STORAGE_KEYS = {
    SESSION: 'sashimilix_session',
    NEON_URL: 'sashimilix_neon_url',
    LOCAL_USERS: 'sashimilix_mock_users',
    WATCHLIST: 'sashimilix_watchlist'
  };

  // Default avatars available for selection
  const AVATAR_OPTIONS = [
    '🐱', '🦊', '🐰', '🐼', '🐯', '🦄',
    '🐸', '🐙', '🐧', '🐻', '🦁', '🦉'
  ];

  // Database State
  let neonClient = null;
  let dbStatus = {
    connected: false,
    mode: 'checking', // 'neon' | 'local' | 'checking'
    latencyMs: null,
    message: 'Menginisialisasi sistem...'
  };

  // Active User Session
  let currentUser = null;

  // Initialize session from LocalStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (saved) {
      currentUser = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Gagal membaca sesi lokal:', e);
  }

  // ===================================================================
  // 1. CRYPTO UTILITIES (SHA-256)
  // ===================================================================
  async function hashPassword(password, salt = 'sashimilix_cosmic_salt_2026') {
    if (!window.crypto || !window.crypto.subtle) {
      // Fallback simple hash for older environments
      let hash = 0;
      const str = password + salt;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return 'fh_' + Math.abs(hash).toString(16);
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ===================================================================
  // 2. NEON POSTGRESQL CLIENT & SCHEMA
  // ===================================================================
  async function getNeonSql(forceUrl = null) {
    const connStr = forceUrl || localStorage.getItem(STORAGE_KEYS.NEON_URL);
    if (!connStr || !connStr.trim()) {
      return null;
    }

    try {
      // Load official Neon Serverless driver from esm.sh CDN
      const { neon } = await import('https://esm.sh/@neondatabase/serverless@0.10.4');
      const sql = neon(connStr.trim());
      return sql;
    } catch (err) {
      console.warn('Gagal memuat Neon driver atau URL tidak valid:', err);
      throw err;
    }
  }

  // Initialize PostgreSQL Schema on Neon
  async function initNeonTables(sql) {
    if (!sql) return;

    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS sashimilix_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar VARCHAR(50) DEFAULT '🐱',
        bio TEXT DEFAULT 'Pecinta anime & film di SashimiLix',
        badge VARCHAR(50) DEFAULT 'VIP Otaku',
        watchlist_count INT DEFAULT 0,
        watched_count INT DEFAULT 0,
        favorite_genre VARCHAR(50) DEFAULT 'Anime',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create user watchlist table
    await sql`
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
  }

  // Test Connection
  async function testConnection(testUrl = null) {
    const url = testUrl || localStorage.getItem(STORAGE_KEYS.NEON_URL);
    if (!url || !url.trim()) {
      dbStatus = {
        connected: false,
        mode: 'local',
        latencyMs: null,
        message: 'Mode Database Lokal (Offline Fallback). Belum ada URL Neon PostgreSQL.'
      };
      updateDbStatusBadge();
      return { ok: false, error: 'URL Neon kosong', mode: 'local' };
    }

    const start = performance.now();
    try {
      const sql = await getNeonSql(url);
      if (!sql) throw new Error('Driver Neon gagal diinisialisasi');

      // Test query
      const result = await sql`SELECT NOW() as now, version() as ver;`;
      const latency = Math.round(performance.now() - start);

      // Auto ensure tables exist
      await initNeonTables(sql);

      neonClient = sql;
      dbStatus = {
        connected: true,
        mode: 'neon',
        latencyMs: latency,
        message: `Terhubung ke Neon PostgreSQL (${latency}ms)`
      };
      updateDbStatusBadge();
      return { ok: true, latency, version: result[0]?.ver || 'PostgreSQL' };
    } catch (err) {
      console.error('Koneksi Neon Postgres gagal:', err);
      dbStatus = {
        connected: false,
        mode: 'local',
        latencyMs: null,
        message: `Koneksi Neon Gagal: ${err.message || 'Periksa URL database'}. Mode lokal aktif.`
      };
      updateDbStatusBadge();
      return { ok: false, error: err.message };
    }
  }

  // Initialize DB on Startup
  async function initDatabase() {
    // 1. Try server backend API first if running with Express server
    try {
      const ping = await fetch('/api/db/test');
      if (ping.ok) {
        const pingData = await ping.json();
        if (pingData.ok) {
          dbStatus = {
            connected: true,
            mode: 'neon',
            latencyMs: pingData.latencyMs || 45,
            message: `Terhubung ke Neon Lakebase Postgres (${pingData.latencyMs}ms)`
          };
          updateDbStatusBadge();
          return;
        }
      }
    } catch (e) {
      // Backend not running or static mode
    }

    const savedUrl = localStorage.getItem(STORAGE_KEYS.NEON_URL);
    if (savedUrl) {
      await testConnection(savedUrl);
    } else {
      dbStatus = {
        connected: false,
        mode: 'local',
        latencyMs: null,
        message: 'Mode Demo / LocalStorage Aktif (Masukkan URL Neon Postgres untuk Cloud Sync)'
      };
      updateDbStatusBadge();
    }
  }

  // ===================================================================
  // 3. LOCAL MOCK DATABASE FALLBACK
  // ===================================================================
  function getLocalUsers() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LOCAL_USERS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalUsers(users) {
    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
  }

  // Seed default demo user if empty
  (async function seedDefaultUser() {
    const users = getLocalUsers();
    if (users.length === 0) {
      const passHash = await hashPassword('sashimi123');
      users.push({
        id: 1,
        username: 'sashimilover',
        email: 'user@sashimilix.com',
        password_hash: passHash,
        avatar: '🐱',
        bio: 'Pencinta marathon anime dan drama kosmik ✨',
        badge: 'VIP Otaku',
        watchlist_count: 5,
        watched_count: 14,
        favorite_genre: 'Anime',
        created_at: new Date().toISOString()
      });
      saveLocalUsers(users);
    }
  })();

  // ===================================================================
  // 4. AUTHENTICATION SERVICES
  // ===================================================================

  // Register New User
  async function register({ username, email, password, avatar = '🐱', bio = 'Pecinta film & anime di SashimiLix' }) {
    if (!username || username.trim().length < 3) {
      throw new Error('Username minimal 3 karakter!');
    }
    if (!email || !email.includes('@')) {
      throw new Error('Format email tidak valid!');
    }
    if (!password || password.length < 6) {
      throw new Error('Password minimal 6 karakter!');
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const passHash = await hashPassword(password);
    const userAvatar = avatar || '🐱';

    // 1. Try Neon Postgres if connected
    if (dbStatus.mode === 'neon' && neonClient) {
      try {
        // Check existing
        const existing = await neonClient`
          SELECT id FROM sashimilix_users 
          WHERE LOWER(username) = LOWER(${cleanUsername}) OR LOWER(email) = LOWER(${cleanEmail})
          LIMIT 1;
        `;
        if (existing && existing.length > 0) {
          throw new Error('Username atau Email sudah terdaftar di database!');
        }

        const inserted = await neonClient`
          INSERT INTO sashimilix_users (
            username, email, password_hash, avatar, bio, badge, watchlist_count, watched_count, favorite_genre
          ) VALUES (
            ${cleanUsername}, ${cleanEmail}, ${passHash}, ${userAvatar}, ${bio}, 'VIP Otaku', 0, 0, 'Anime'
          )
          RETURNING id, username, email, avatar, bio, badge, watchlist_count, watched_count, favorite_genre, created_at;
        `;

        const newUser = inserted[0];
        setSession(newUser);
        return newUser;
      } catch (err) {
        console.error('Neon register error:', err);
        if (err.message && err.message.includes('sudah terdaftar')) throw err;
        throw new Error(`Gagal menyimpan ke Neon PostgreSQL: ${err.message}`);
      }
    }

    // 2. Fallback to LocalStorage Mock
    const localUsers = getLocalUsers();
    const exists = localUsers.some(u => 
      u.username.toLowerCase() === cleanUsername.toLowerCase() || 
      u.email.toLowerCase() === cleanEmail.toLowerCase()
    );

    if (exists) {
      throw new Error('Username atau Email sudah terdaftar!');
    }

    const newUser = {
      id: Date.now(),
      username: cleanUsername,
      email: cleanEmail,
      password_hash: passHash,
      avatar: userAvatar,
      bio: bio,
      badge: 'VIP Otaku',
      watchlist_count: 0,
      watched_count: 0,
      favorite_genre: 'Anime',
      created_at: new Date().toISOString()
    };

    localUsers.push(newUser);
    saveLocalUsers(localUsers);
    setSession(newUser);
    return newUser;
  }

  // Login Existing User
  async function login({ identifier, password }) {
    if (!identifier || !identifier.trim()) {
      throw new Error('Masukkan Email atau Username Anda!');
    }
    if (!password) {
      throw new Error('Masukkan Password Anda!');
    }

    const cleanIdent = identifier.trim().toLowerCase();
    const passHash = await hashPassword(password);

    // 1. Try Neon Postgres if connected
    if (dbStatus.mode === 'neon' && neonClient) {
      try {
        const rows = await neonClient`
          SELECT * FROM sashimilix_users 
          WHERE LOWER(username) = LOWER(${cleanIdent}) OR LOWER(email) = LOWER(${cleanIdent})
          LIMIT 1;
        `;

        if (!rows || rows.length === 0) {
          throw new Error('Pengguna tidak ditemukan di database Neon!');
        }

        const user = rows[0];
        if (user.password_hash !== passHash) {
          throw new Error('Password yang dimasukkan salah!');
        }

        // Update last login
        await neonClient`
          UPDATE sashimilix_users 
          SET last_login = CURRENT_TIMESTAMP 
          WHERE id = ${user.id};
        `;

        // Sync watchlist from Neon
        await syncWatchlistFromNeon(user.id);

        const safeUser = { ...user };
        delete safeUser.password_hash;
        setSession(safeUser);
        return safeUser;
      } catch (err) {
        console.error('Neon login error:', err);
        throw err;
      }
    }

    // 2. Fallback to LocalStorage Mock
    const localUsers = getLocalUsers();
    const user = localUsers.find(u => 
      u.username.toLowerCase() === cleanIdent || 
      u.email.toLowerCase() === cleanIdent
    );

    if (!user) {
      throw new Error('Akun belum terdaftar! Silakan klik tab "Daftar Akun".');
    }

    if (user.password_hash !== passHash) {
      throw new Error('Password salah! Coba periksa kembali password Anda.');
    }

    const safeUser = { ...user };
    delete safeUser.password_hash;
    setSession(safeUser);
    return safeUser;
  }

  // 3B. Google Sign-In & Sync with Neon
  async function loginWithGoogle({ email, name, avatar, googleId }) {
    if (!email || !email.includes('@')) {
      throw new Error('Alamat email Google tidak valid!');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || email.split('@')[0] || 'Google Member').trim();
    const userAvatar = avatar || '🐱';

    // 1. Try Express backend API first
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: cleanName, avatar: userAvatar, googleId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          setSession(data.user);
          await syncWatchlistFromNeon(data.user.id);
          return data.user;
        }
      }
    } catch (err) {
      console.warn('Backend Google Auth gagal, mencoba direct Neon/lokal:', err);
    }

    // 2. Direct Neon Client if connected
    if (dbStatus.mode === 'neon' && neonClient) {
      try {
        const existing = await neonClient`
          SELECT * FROM sashimilix_users
          WHERE LOWER(email) = LOWER(${cleanEmail})
          LIMIT 1;
        `;

        let user;
        if (existing && existing.length > 0) {
          user = existing[0];
          await neonClient`
            UPDATE sashimilix_users
            SET last_login = CURRENT_TIMESTAMP
            WHERE id = ${user.id};
          `;
        } else {
          const baseUsername = cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15) || 'google_user';
          let finalUsername = baseUsername;
          const uCheck = await neonClient`SELECT id FROM sashimilix_users WHERE LOWER(username) = LOWER(${finalUsername}) LIMIT 1;`;
          if (uCheck.length > 0) finalUsername = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;

          const passHash = await hashPassword(`google_oauth_${cleanEmail}_${googleId || 'neon'}`);
          const inserted = await neonClient`
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

        await syncWatchlistFromNeon(user.id);
        const safeUser = { ...user };
        delete safeUser.password_hash;
        setSession(safeUser);
        return safeUser;
      } catch (err) {
        console.error('Neon direct Google auth error:', err);
      }
    }

    // 3. Fallback Local
    const localUsers = getLocalUsers();
    let user = localUsers.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      user = {
        id: Date.now(),
        username: cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15) || 'google_user',
        email: cleanEmail,
        avatar: userAvatar,
        bio: 'Member Google di SashimiLix',
        badge: 'Google Otaku',
        watchlist_count: 0,
        watched_count: 0,
        favorite_genre: 'Anime',
        created_at: new Date().toISOString()
      };
      localUsers.push(user);
      saveLocalUsers(localUsers);
    }
    setSession(user);
    return user;
  }

  // Open Official Google Sign-In Popup Window
  function openGoogleSignInPopup() {
    playSound('pop');

    // 1. Center popup window on user's display
    const width = 500;
    const height = 640;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    showToastNotice('🌐 Membuka popup Google Sign-In...');

    // 2. Panggil window.open secara SINKRON langsung saat klik user!
    // Memanggil window.open secara langsung tanpa 'await' sebelumnya menjamin
    // browser (Chrome/Safari/Brave/Firefox) TIDAK AKAN memblokir popup!
    const popup = window.open(
      '/api/auth/google/login',
      'GoogleSignInPopup',
      `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,menubar=0,location=1,resizable=1`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Jika browser memiliki ekstensi pemblokir popup ketat, arahkan langsung ke halaman login Google
      showToastNotice('⚠️ Mengarahkan ke Google Sign-In...');
      window.location.href = '/api/auth/google/login';
      return;
    }

    // 3. Listen for authentication completion message from popup
    const handlePopupMessage = async (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        window.removeEventListener('message', handlePopupMessage);
        const userData = event.data.user;
        currentUser = userData;
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(userData));
        playSound('burst');
        showToastNotice(`🎉 Selamat datang, ${userData.username}! Mengalihkan ke Profil...`);
        setTimeout(() => {
          window.location.href = 'profile.html';
        }, 600);
      } else if (event.data && event.data.type === 'GOOGLE_AUTH_ERROR') {
        window.removeEventListener('message', handlePopupMessage);
        playSound('bubble');
        showToastNotice(`❌ ${event.data.error || 'Login Google dibatalkan'}`);
      }
    };

    window.addEventListener('message', handlePopupMessage);
  }

  // Update Profile
  async function updateProfile({ username, avatar, bio }) {
    if (!currentUser) throw new Error('Tidak ada pengguna aktif.');

    const cleanUsername = username ? username.trim() : currentUser.username;
    const cleanAvatar = avatar || currentUser.avatar;
    const cleanBio = bio !== undefined ? bio.trim() : currentUser.bio;

    if (dbStatus.mode === 'neon' && neonClient) {
      try {
        const updated = await neonClient`
          UPDATE sashimilix_users 
          SET username = ${cleanUsername}, avatar = ${cleanAvatar}, bio = ${cleanBio}
          WHERE id = ${currentUser.id}
          RETURNING id, username, email, avatar, bio, badge, watchlist_count, watched_count, favorite_genre, created_at;
        `;
        if (updated && updated.length > 0) {
          setSession(updated[0]);
          return updated[0];
        }
      } catch (err) {
        console.error('Gagal update di Neon:', err);
        throw new Error('Gagal memperbarui profil di Neon: ' + err.message);
      }
    }

    // Local fallback
    const localUsers = getLocalUsers();
    const idx = localUsers.findIndex(u => u.id === currentUser.id);
    if (idx !== -1) {
      localUsers[idx].username = cleanUsername;
      localUsers[idx].avatar = cleanAvatar;
      localUsers[idx].bio = cleanBio;
      saveLocalUsers(localUsers);
    }

    currentUser.username = cleanUsername;
    currentUser.avatar = cleanAvatar;
    currentUser.bio = cleanBio;
    setSession(currentUser);
    return currentUser;
  }

  // Logout
  function logout() {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    updateNavbarAvatar();
    renderModalContent();
    showToastNotice('👋 Anda telah berhasil keluar.');
  }

  // Session Helper
  function setSession(user) {
    currentUser = { ...user };
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
    updateNavbarAvatar();
    renderModalContent();
  }

  // Sync Watchlist from Neon to Local
  async function syncWatchlistFromNeon(userId) {
    if (!neonClient) return;
    try {
      const rows = await neonClient`
        SELECT movie_id, title, poster_path, category, rating 
        FROM sashimilix_user_watchlist 
        WHERE user_id = ${userId};
      `;
      if (rows && rows.length > 0) {
        const synced = rows.map(r => ({
          id: r.movie_id,
          title: r.title,
          poster: r.poster_path,
          category: r.category,
          rating: r.rating
        }));
        localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(synced));
      }
    } catch (e) {
      console.warn('Gagal sinkronisasi watchlist dari Neon:', e);
    }
  }

  // Sync Watchlist to Neon
  async function syncWatchlistToNeon(watchlistArray) {
    if (!currentUser || !neonClient || dbStatus.mode !== 'neon') return;
    try {
      for (const item of watchlistArray) {
        const mId = String(item.id || item);
        const title = item.title || 'Film SashimiLix';
        const poster = item.poster || item.poster_path || '';
        const cat = item.category || 'all';
        const rating = item.rating || 9.0;

        await neonClient`
          INSERT INTO sashimilix_user_watchlist (user_id, movie_id, title, poster_path, category, rating)
          VALUES (${currentUser.id}, ${mId}, ${title}, ${poster}, ${cat}, ${rating})
          ON CONFLICT (user_id, movie_id) DO NOTHING;
        `;
      }

      await neonClient`
        UPDATE sashimilix_users 
        SET watchlist_count = ${watchlistArray.length}
        WHERE id = ${currentUser.id};
      `;
    } catch (e) {
      console.warn('Gagal upload watchlist ke Neon:', e);
    }
  }

  // ===================================================================
  // 5. CLAYMORPHIC MODAL COMPONENT (DOM INJECTION)
  // ===================================================================
  let activeTab = 'login'; // 'login' | 'register' | 'neon'
  let selectedRegisterAvatar = '🐱';
  let isEditingBio = false;

  function ensureModalInDOM() {
    if (document.getElementById('profile-modal-backdrop')) return;

    const modalHTML = `
      <div class="clay-modal-backdrop" id="profile-modal-backdrop">
        <div class="clay-modal-card" id="profile-modal-card" role="dialog" aria-modal="true">
          <!-- Close Button -->
          <button class="clay-modal-close" id="profile-modal-close" title="Tutup Modal">✕</button>

          <!-- Modal Body Dynamic Container -->
          <div id="profile-modal-dynamic-body"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Event listeners for close
    const backdrop = document.getElementById('profile-modal-backdrop');
    const closeBtn = document.getElementById('profile-modal-close');

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    closeBtn.addEventListener('click', () => {
      closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openModal(defaultTab = 'login') {
    if (currentUser) {
      window.location.href = 'profile.html';
      return;
    }
    ensureModalInDOM();
    activeTab = defaultTab;
    renderModalContent();
    const backdrop = document.getElementById('profile-modal-backdrop');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    playSound('pop');
  }

  function closeModal() {
    const backdrop = document.getElementById('profile-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
    }
    document.body.style.overflow = '';
    isEditingBio = false;
  }

  // Render modal content depending on auth state
  function renderModalContent() {
    const container = document.getElementById('profile-modal-dynamic-body');
    if (!container) return;

    if (!currentUser) {
      // User is NOT logged in: Render Auth Tabs (Login / Register / Neon Config)
      renderAuthView(container);
    } else {
      // User IS logged in: Render Profile Dashboard
      renderProfileView(container);
    }
  }

  // 5A. Render Auth View (Not Signed In)
  function renderAuthView(container) {
    const savedNeonUrl = localStorage.getItem(STORAGE_KEYS.NEON_URL) || '';
    const isNeonConnected = dbStatus.mode === 'neon' && dbStatus.connected;

    container.innerHTML = `
      <div class="clay-auth-header">
        <div class="auth-mascot-badge">🐱</div>
        <h2 class="auth-title">SashimiLix Akun</h2>
        <p class="auth-subtitle">
          Masuk atau buat akun baru untuk mengakses profil, sinkronisasi watchlist, dan simpan film favorit Anda ke <strong>Cloud</strong>.
        </p>

        <!-- Database Cloud Status Pill -->
        <div class="auth-db-status-pill ${isNeonConnected ? 'connected' : 'local'}" id="auth-db-status-pill">
          <span class="db-dot"></span>
          <span class="db-text">${isNeonConnected ? `🟢 Cloud Database: Terhubung (${dbStatus.latencyMs}ms)` : '🟡 Mode Database: Demo / Lokal'}</span>
        </div>
      </div>

      <!-- Clay Tabs -->
      <div class="clay-tabs-nav">
        <button class="clay-tab-btn ${activeTab === 'login' ? 'active' : ''}" data-tab="login">
          🔑 Masuk
        </button>
        <button class="clay-tab-btn ${activeTab === 'register' ? 'active' : ''}" data-tab="register">
          ✨ Daftar Baru
        </button>
      </div>

      <!-- Tab Error Notice -->
      <div class="clay-form-error" id="auth-error-banner" style="display: none;"></div>

      <!-- TAB 1: LOGIN -->
      <div class="clay-tab-content ${activeTab === 'login' ? 'active' : ''}" id="tab-login">
        <!-- Google Sign-In Button -->
        <button type="button" class="google-auth-btn" id="btn-google-login">
          <svg viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>Lanjutkan dengan Google</span>
        </button>

        <div class="auth-divider">
          <span>atau gunakan email</span>
        </div>

        <form class="clay-auth-form" id="form-login">
          <div class="clay-form-group">
            <label class="clay-label">Email atau Username</label>
            <div class="clay-input-wrap">
              <span class="input-icon">👤</span>
              <input type="text" id="login-identifier" class="clay-input" placeholder="contoh: user@sashimilix.com" required autocomplete="username">
            </div>
          </div>

          <div class="clay-form-group">
            <label class="clay-label">Password</label>
            <div class="clay-input-wrap">
              <span class="input-icon">🔒</span>
              <input type="password" id="login-password" class="clay-input" placeholder="Masukkan password Anda" required autocomplete="current-password">
              <button type="button" class="pwd-toggle-btn" id="login-pwd-toggle" title="Tampilkan/Sembunyikan password">👁️</button>
            </div>
          </div>

          <div class="form-aux-row">
            <label class="clay-checkbox-label">
              <input type="checkbox" id="login-remember" checked>
              <span>Ingat saya di peramban ini</span>
            </label>
            <button type="button" class="aux-link-btn" id="btn-fill-demo">🧪 Akun Demo</button>
          </div>

          <button type="submit" class="clay-button clay-button-coral clay-submit-btn" id="btn-submit-login">
            <span>Masuk Sekarang</span> 🚀
          </button>
        </form>

        <div class="auth-switch-prompt">
          Belum punya akun? <a href="#" id="link-to-register" class="auth-inline-link">Daftar Akun Baru Sekarang ✨</a>
        </div>
      </div>

      <!-- TAB 2: REGISTER -->
      <div class="clay-tab-content ${activeTab === 'register' ? 'active' : ''}" id="tab-register">
        <!-- Google Register Button -->
        <button type="button" class="google-auth-btn" id="btn-google-register">
          <svg viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>Daftar Cepat dengan Google</span>
        </button>

        <div class="auth-divider">
          <span>atau daftar manual</span>
        </div>

        <form class="clay-auth-form" id="form-register">
          <div class="clay-form-group">
            <label class="clay-label">Pilih Avatar Clay Karakter</label>
            <div class="avatar-picker-grid" id="avatar-picker-grid">
              ${AVATAR_OPTIONS.map(emoji => `
                <button type="button" class="avatar-option-btn ${emoji === selectedRegisterAvatar ? 'selected' : ''}" data-avatar="${emoji}">
                  ${emoji}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="clay-form-group">
            <label class="clay-label">Username</label>
            <div class="clay-input-wrap">
              <span class="input-icon">✨</span>
              <input type="text" id="reg-username" class="clay-input" placeholder="contoh: OtakuStar26" minlength="3" required autocomplete="username">
            </div>
          </div>

          <div class="clay-form-group">
            <label class="clay-label">Alamat Email</label>
            <div class="clay-input-wrap">
              <span class="input-icon">✉️</span>
              <input type="email" id="reg-email" class="clay-input" placeholder="nama@email.com" required autocomplete="email">
            </div>
          </div>

          <div class="clay-form-row">
            <div class="clay-form-group">
              <label class="clay-label">Password</label>
              <div class="clay-input-wrap">
                <span class="input-icon">🔑</span>
                <input type="password" id="reg-password" class="clay-input" placeholder="Min. 6 huruf" minlength="6" required autocomplete="new-password">
              </div>
            </div>

            <div class="clay-form-group">
              <label class="clay-label">Ulangi Password</label>
              <div class="clay-input-wrap">
                <span class="input-icon">🛡️</span>
                <input type="password" id="reg-password-confirm" class="clay-input" placeholder="Ulangi password" minlength="6" required autocomplete="new-password">
              </div>
            </div>
          </div>

          <button type="submit" class="clay-button clay-button-coral clay-submit-btn" id="btn-submit-register">
            <span>Daftar Akun Baru</span> ✨
          </button>
        </form>

        <div class="auth-switch-prompt">
          Sudah punya akun? <a href="#" id="link-to-login" class="auth-inline-link">Masuk di sini 🔑</a>
        </div>
      </div>
    `;

    // Attach event listeners for Auth View
    attachAuthEventListeners(container);
  }

  // 5B. Render Profile Dashboard View (Signed In)
  function renderProfileView(container) {
    const isNeonConnected = dbStatus.mode === 'neon' && dbStatus.connected;
    const localWatchlist = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATCHLIST) || '[]');
    const joinDate = currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) : '16 Oktober 2026';

    container.innerHTML = `
      <div class="clay-profile-dashboard">

        <!-- Profile Top Banner -->
        <div class="profile-hero-card">
          <div class="profile-avatar-big-wrap">
            <div class="profile-avatar-big" id="profile-display-avatar" style="overflow: hidden;">
              ${currentUser.avatar && (currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('data:'))
                ? `<img src="${currentUser.avatar}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                : (currentUser.avatar || '🐱')}
            </div>
            <button class="profile-avatar-change-btn" id="btn-toggle-avatar-picker" title="Ganti Avatar Emoji / Unggah Foto">✏️</button>
          </div>

          <div class="profile-info-col">
            <div class="profile-badge-row">
              <span class="user-role-badge">🌸 ${currentUser.badge || 'VIP Otaku Member'}</span>
              <span class="user-cloud-badge ${isNeonConnected ? 'neon-active' : 'local-active'}">
                ${isNeonConnected ? '⚡ Neon Postgres Cloud' : '💾 Penyimpanan Lokal'}
              </span>
            </div>

            <h2 class="profile-username" id="profile-display-name">${currentUser.username}</h2>
            <div class="profile-email-row">
              <span>✉️ ${currentUser.email}</span>
              <span>•</span>
              <span>📅 Bergabung: ${joinDate}</span>
            </div>
          </div>
        </div>

        <!-- Hidden Avatar Picker Drawer (Toggleable) -->
        <div class="profile-avatar-drawer" id="profile-avatar-drawer" style="display: none;">
          <label class="clay-label">Pilih Karakter Avatar Baru:</label>
          <div class="avatar-picker-grid">
            ${AVATAR_OPTIONS.map(emoji => `
              <button type="button" class="avatar-option-btn ${emoji === currentUser.avatar ? 'selected' : ''}" data-avatar="${emoji}">
                ${emoji}
              </button>
            `).join('')}
          </div>

          <!-- Neon Object Storage Upload Option -->
          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-subtle); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 0.82rem; color: var(--text-secondary);">Atau gunakan foto pribadi:</span>
            <label class="clay-button clay-button-lilac" style="padding: 6px 14px; font-size: 0.8rem; cursor: pointer; margin: 0; box-shadow: var(--clay-shadow-sm);">
              📦 Unggah ke Neon Storage
              <input type="file" id="neon-avatar-upload-input" accept="image/*" style="display: none;">
            </label>
          </div>
        </div>

        <!-- 3D Clay Stats Cards Grid -->
        <div class="profile-stats-grid">
          <div class="clay-stat-card">
            <span class="stat-icon">🎬</span>
            <div class="stat-val">${currentUser.watched_count || 14}</div>
            <div class="stat-label">Film Ditonton</div>
          </div>

          <div class="clay-stat-card clickable" id="profile-stat-watchlist-btn" title="Buka Daftar Watchlist">
            <span class="stat-icon">❤️</span>
            <div class="stat-val" id="profile-watchlist-count">${localWatchlist.length}</div>
            <div class="stat-label">Koleksi Watchlist</div>
          </div>

          <div class="clay-stat-card">
            <span class="stat-icon">🌸</span>
            <div class="stat-val">${currentUser.favorite_genre || 'Anime 4K'}</div>
            <div class="stat-label">Genre Terfavorit</div>
          </div>
        </div>

        <!-- Bio & Status Section -->
        <div class="profile-bio-card">
          <div class="bio-header-row">
            <span class="bio-title">💬 Status & Bio Diri</span>
            <button class="bio-edit-toggle-btn" id="btn-toggle-edit-bio">
              ${isEditingBio ? 'Batal' : '✏️ Ubah Bio'}
            </button>
          </div>

          <div id="bio-display-view" style="${isEditingBio ? 'display: none;' : 'display: block;'}">
            <p class="bio-text" id="profile-bio-text">
              "${currentUser.bio || 'Menikmati keajaiban dunia anime dan sinema bersama SashimiLix! 🌸'}"
            </p>
          </div>

          <div id="bio-edit-view" style="${isEditingBio ? 'display: block;' : 'display: none;'}">
            <textarea id="profile-bio-input" class="clay-textarea" rows="2" maxlength="150" placeholder="Tuliskan bio atau kutipan favoritmu...">${currentUser.bio || ''}</textarea>
            <div class="bio-save-row">
              <button class="clay-button clay-button-coral" id="btn-save-bio-changes" style="padding: 6px 18px; font-size: 0.85rem;">
                💾 Simpan Perubahan
              </button>
            </div>
          </div>
        </div>

        <!-- Database Storage Status -->
        <div class="profile-db-banner">
          <div class="db-banner-info">
            <span class="db-brand-icon">⚡</span>
            <div>
              <div class="db-title">Penyimpanan Akun: <strong>${isNeonConnected ? 'Cloud Serverless (Aktif)' : 'Penyimpanan Lokal'}</strong></div>
              <div class="db-desc">${isNeonConnected ? 'Profil & watchlist Anda otomatis tersimpan aman di Cloud.' : dbStatus.message}</div>
            </div>
          </div>
          <span style="font-size: 0.8rem; font-weight: 700; color: ${isNeonConnected ? '#10b981' : 'var(--text-tertiary)'}; background: rgba(16, 185, 129, 0.12); padding: 5px 12px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.25);">
            ${isNeonConnected ? '🟢 Cloud Sync' : '💾 Lokal'}
          </span>
        </div>

        <!-- Profile Bottom Actions -->
        <div class="profile-footer-actions">
          <button class="clay-button" id="btn-profile-go-watchlist">
            <span>❤️ Lihat Watchlist Saya</span>
          </button>
          <button class="clay-button clay-button-danger" id="btn-profile-logout">
            <span>🚪 Keluar Akun</span>
          </button>
        </div>

      </div>
    `;

    attachProfileEventListeners(container);
  }

  // ===================================================================
  // 6. EVENT LISTENERS ATTACHMENT
  // ===================================================================

  function attachAuthEventListeners(container) {
    // Tab switching
    container.querySelectorAll('.clay-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('bubble');
        activeTab = btn.getAttribute('data-tab');
        renderModalContent();
      });
    });

    // Google Sign-In and Register Click Listeners
    const handleGoogleAuth = () => {
      openGoogleSignInPopup();
    };

    const btnGoogleLogin = container.querySelector('#btn-google-login');
    if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', handleGoogleAuth);

    const btnGoogleRegister = container.querySelector('#btn-google-register');
    if (btnGoogleRegister) btnGoogleRegister.addEventListener('click', handleGoogleAuth);

    // Switch links
    const linkToReg = container.querySelector('#link-to-register');
    if (linkToReg) {
      linkToReg.addEventListener('click', (e) => {
        e.preventDefault();
        playSound('pop');
        activeTab = 'register';
        renderModalContent();
      });
    }

    const linkToLog = container.querySelector('#link-to-login');
    if (linkToLog) {
      linkToLog.addEventListener('click', (e) => {
        e.preventDefault();
        playSound('pop');
        activeTab = 'login';
        renderModalContent();
      });
    }

    // Password visibility toggle
    const pwdToggle = container.querySelector('#login-pwd-toggle');
    if (pwdToggle) {
      pwdToggle.addEventListener('click', () => {
        const input = container.querySelector('#login-password');
        if (input.type === 'password') {
          input.type = 'text';
          pwdToggle.textContent = '🙈';
        } else {
          input.type = 'password';
          pwdToggle.textContent = '👁️';
        }
      });
    }

    // Demo Account Auto-Fill
    const demoBtn = container.querySelector('#btn-fill-demo');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        playSound('pop');
        const idInput = container.querySelector('#login-identifier');
        const passInput = container.querySelector('#login-password');
        idInput.value = 'user@sashimilix.com';
        passInput.value = 'sashimi123';
        showToastNotice('🧪 Akun demo diisi otomatis!');
      });
    }

    // Avatar picker in register
    container.querySelectorAll('#avatar-picker-grid .avatar-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('pop');
        selectedRegisterAvatar = btn.getAttribute('data-avatar');
        container.querySelectorAll('#avatar-picker-grid .avatar-option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // Form Login Submit
    const formLogin = container.querySelector('#form-login');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ident = container.querySelector('#login-identifier').value;
        const pass = container.querySelector('#login-password').value;
        const submitBtn = container.querySelector('#btn-submit-login');
        const errorBanner = container.querySelector('#auth-error-banner');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Memverifikasi...</span> ⏳';
        errorBanner.style.display = 'none';

        try {
          const user = await login({ identifier: ident, password: pass });
          playSound('burst');
          showToastNotice(`🎉 Selamat datang kembali, ${user.username}! Mengalihkan ke Profil...`);
          setTimeout(() => {
            window.location.href = 'profile.html';
          }, 600);
        } catch (err) {
          playSound('bubble');
          errorBanner.textContent = `❌ ${err.message || 'Login gagal'}`;
          errorBanner.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Masuk Sekarang</span> 🚀';
        }
      });
    }

    // Form Register Submit
    const formRegister = container.querySelector('#form-register');
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = container.querySelector('#reg-username').value;
        const email = container.querySelector('#reg-email').value;
        const password = container.querySelector('#reg-password').value;
        const passwordConfirm = container.querySelector('#reg-password-confirm').value;
        const submitBtn = container.querySelector('#btn-submit-register');
        const errorBanner = container.querySelector('#auth-error-banner');

        if (password !== passwordConfirm) {
          errorBanner.textContent = '❌ Konfirmasi password tidak cocok!';
          errorBanner.style.display = 'block';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Membuat Akun...</span> ⏳';
        errorBanner.style.display = 'none';

        try {
          const user = await register({
            username,
            email,
            password,
            avatar: selectedRegisterAvatar
          });
          playSound('burst');
          showToastNotice(`✨ Akun berhasil dibuat! Selamat datang, ${user.username}! Mengalihkan...`);
          setTimeout(() => {
            window.location.href = 'profile.html';
          }, 600);
        } catch (err) {
          playSound('bubble');
          errorBanner.textContent = `❌ ${err.message || 'Pendaftaran gagal'}`;
          errorBanner.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Daftar Akun Baru</span> ✨';
        }
      });
    }

    // Neon Tab: Toggle URL
    const neonUrlToggle = container.querySelector('#neon-url-toggle');
    if (neonUrlToggle) {
      neonUrlToggle.addEventListener('click', () => {
        const input = container.querySelector('#neon-conn-input');
        if (input.type === 'password') {
          input.type = 'text';
          neonUrlToggle.textContent = '🙈';
        } else {
          input.type = 'password';
          neonUrlToggle.textContent = '👁️';
        }
      });
    }

    // Neon Tab: Test Connection
    const btnNeonTest = container.querySelector('#btn-neon-test');
    if (btnNeonTest) {
      btnNeonTest.addEventListener('click', async () => {
        const connUrl = container.querySelector('#neon-conn-input').value.trim();
        const resultsBox = container.querySelector('#neon-test-results');

        btnNeonTest.disabled = true;
        btnNeonTest.innerHTML = '<span>Menguji...</span> ⏳';
        resultsBox.innerHTML = '<div class="neon-result-box info">⏳ Menghubungi Neon PostgreSQL server...</div>';

        const res = await testConnection(connUrl);
        if (res.ok) {
          playSound('burst');
          resultsBox.innerHTML = `
            <div class="neon-result-box success">
              ✅ <strong>Koneksi Berhasil!</strong> Server merespons dalam <strong>${res.latency}ms</strong>.<br>
              Versi: ${res.version}. Skema tabel siap digunakan.
            </div>
          `;
        } else {
          playSound('bubble');
          resultsBox.innerHTML = `
            <div class="neon-result-box error">
              ❌ <strong>Koneksi Gagal:</strong> ${res.error || 'Periksa format URL dan koneksi internet.'}
            </div>
          `;
        }
        btnNeonTest.disabled = false;
        btnNeonTest.innerHTML = '<span>⚡ Tes Koneksi</span>';
      });
    }

    // Neon Tab: Save Connection
    const btnNeonSave = container.querySelector('#btn-neon-save');
    if (btnNeonSave) {
      btnNeonSave.addEventListener('click', async () => {
        const connUrl = container.querySelector('#neon-conn-input').value.trim();
        if (!connUrl) {
          localStorage.removeItem(STORAGE_KEYS.NEON_URL);
          neonClient = null;
          dbStatus = {
            connected: false,
            mode: 'local',
            latencyMs: null,
            message: 'Mode Database Lokal (Offline Fallback).'
          };
          updateDbStatusBadge();
          showToastNotice('ℹ️ Mode kembali ke LocalStorage');
          renderModalContent();
          return;
        }

        btnNeonSave.disabled = true;
        btnNeonSave.innerHTML = '<span>Menyimpan...</span> ⏳';

        const res = await testConnection(connUrl);
        if (res.ok) {
          localStorage.setItem(STORAGE_KEYS.NEON_URL, connUrl);
          playSound('burst');
          showToastNotice('⚡ Neon PostgreSQL berhasil disimpan & diaktifkan!');
          renderModalContent();
        } else {
          playSound('bubble');
          alert(`Gagal terhubung ke Neon PostgreSQL:\n${res.error}\n\nPastikan format connection string benar.`);
        }
        btnNeonSave.disabled = false;
        btnNeonSave.innerHTML = '<span>💾 Simpan & Aktifkan</span>';
      });
    }
  }

  function attachProfileEventListeners(container) {
    // Avatar drawer toggle
    const toggleAvatarBtn = container.querySelector('#btn-toggle-avatar-picker');
    const avatarDrawer = container.querySelector('#profile-avatar-drawer');
    if (toggleAvatarBtn && avatarDrawer) {
      toggleAvatarBtn.addEventListener('click', () => {
        playSound('pop');
        const isHidden = avatarDrawer.style.display === 'none';
        avatarDrawer.style.display = isHidden ? 'block' : 'none';
      });
    }

    // Avatar selection in profile
    container.querySelectorAll('#profile-avatar-drawer .avatar-option-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newAvatar = btn.getAttribute('data-avatar');
        playSound('pop');
        try {
          await updateProfile({ avatar: newAvatar });
          showToastNotice(`Avatar berhasil diubah ke ${newAvatar}! ✨`);
          renderModalContent();
        } catch (e) {
          showToastNotice('Gagal mengubah avatar: ' + e.message);
        }
      });
    });

    // Bio edit toggle
    const btnToggleBio = container.querySelector('#btn-toggle-edit-bio');
    if (btnToggleBio) {
      btnToggleBio.addEventListener('click', () => {
        playSound('bubble');
        isEditingBio = !isEditingBio;
        renderModalContent();
      });
    }

    // Save bio
    const btnSaveBio = container.querySelector('#btn-save-bio-changes');
    if (btnSaveBio) {
      btnSaveBio.addEventListener('click', async () => {
        const inputVal = container.querySelector('#profile-bio-input').value;
        playSound('pop');
        try {
          await updateProfile({ bio: inputVal });
          isEditingBio = false;
          showToastNotice('💬 Bio berhasil diperbarui!');
          renderModalContent();
        } catch (e) {
          showToastNotice('Gagal menyimpan bio: ' + e.message);
        }
      });
    }

    // Watchlist jump button
    const statWatchlistBtn = container.querySelector('#profile-stat-watchlist-btn');
    const goWatchlistBtn = container.querySelector('#btn-profile-go-watchlist');
    const handleGoWatchlist = () => {
      playSound('pop');
      closeModal();
      // If we are on index.html with catalog filter
      const watchlistPill = document.querySelector('.filter-pill[data-filter="watchlist"]');
      if (watchlistPill) {
        watchlistPill.click();
        const catalogEl = document.getElementById('catalog');
        if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
      } else {
        // We might be on watch.html
        window.location.href = 'index.html#catalog';
      }
    };

    if (statWatchlistBtn) statWatchlistBtn.addEventListener('click', handleGoWatchlist);
    if (goWatchlistBtn) goWatchlistBtn.addEventListener('click', handleGoWatchlist);

    // Neon Object Storage: Avatar File Upload
    const avatarUploadInput = container.querySelector('#neon-avatar-upload-input');
    if (avatarUploadInput) {
      avatarUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        playSound('pop');
        showToastNotice('⏳ Mengunggah avatar ke Neon Object Storage (Bucket: assets)...');
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch('/api/storage/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type || 'image/jpeg',
                dataBase64: reader.result
              })
            });
            const data = await res.json();
            if (data.ok && data.url) {
              await updateProfile({ avatar: data.url });
              playSound('burst');
              showToastNotice('✨ Avatar berhasil disimpan di Neon Object Storage!');
              renderModalContent();
            } else {
              showToastNotice('Gagal upload: ' + (data.error || 'Terjadi kesalahan'));
            }
          } catch (err) {
            showToastNotice('Gagal upload: ' + err.message);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Logout
    const btnLogout = container.querySelector('#btn-profile-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        playSound('pop');
        if (confirm('Apakah Anda yakin ingin keluar dari akun SashimiLix?')) {
          logout();
        }
      });
    }
  }

  // ===================================================================
  // 7. NAVBAR AVATAR & STATUS SYNC
  // ===================================================================
  function updateNavbarAvatar() {
    const avatarBtns = document.querySelectorAll('.user-avatar-btn');
    avatarBtns.forEach(btn => {
      if (currentUser) {
        const isImg = currentUser.avatar && (currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('data:'));
        const avatarContent = isImg
          ? `<img src="${currentUser.avatar}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
          : (currentUser.avatar || '🐱');
        btn.innerHTML = `
          ${avatarContent}
          <span class="user-online-dot active" title="Online: ${currentUser.username}"></span>
        `;
        btn.setAttribute('title', `Profil: ${currentUser.username} (${currentUser.badge || 'VIP Otaku'})`);
      } else {
        btn.innerHTML = `
          🐱
          <span class="user-online-dot guest" title="Belum Masuk"></span>
        `;
        btn.setAttribute('title', 'Masuk atau Daftar Akun SashimiLix');
      }
    });
  }

  function updateDbStatusBadge() {
    const statusPill = document.getElementById('auth-db-status-pill');
    if (statusPill) {
      const isConnected = dbStatus.mode === 'neon' && dbStatus.connected;
      statusPill.className = `auth-db-status-pill ${isConnected ? 'connected' : 'local'}`;
      const textSpan = statusPill.querySelector('.db-text');
      if (textSpan) {
        textSpan.textContent = isConnected 
          ? `🟢 Neon PostgreSQL: Terhubung (${dbStatus.latencyMs}ms)`
          : '🟡 Mode Database: Demo / Lokal';
      }
    }
  }

  // Helper sound function (reuses Web Audio API or fallback)
  function playSound(type = 'pop') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'burst') {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(920, now + 0.16);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else {
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      }
    } catch (e) {}
  }

  // Helper toast notice
  function showToastNotice(msg) {
    let toast = document.getElementById('toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notice';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✨</span> ${msg}`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // Bind click listener to navbar avatar buttons
  function bindAvatarTriggers() {
    const avatarBtns = document.querySelectorAll('.user-avatar-btn');
    avatarBtns.forEach(btn => {
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentUser) {
          window.location.href = 'profile.html';
        } else {
          openModal();
        }
      });
    });
  }

  // ===================================================================
  // 8. INITIALIZATION
  // ===================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    ensureModalInDOM();
    updateNavbarAvatar();
    bindAvatarTriggers();
  });

  // Global window export for cross-module integration
  window.SashimiAuth = {
    getCurrentUser: () => currentUser,
    openModal: openModal,
    closeModal: closeModal,
    testConnection: testConnection,
    syncWatchlistToNeon: syncWatchlistToNeon,
    getDbStatus: () => dbStatus
  };

})();
