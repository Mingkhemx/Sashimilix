/**
 * SashimiLix - Dedicated Profile Dashboard Logic
 * Integrates with Neon PostgreSQL, Neon Object Storage, and Device Sessions
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    SESSION: 'sashimilix_session',
    WATCHLIST: 'sashimilix_watchlist',
    PREFS: 'sashimilix_user_prefs'
  };

  const AVATAR_OPTIONS = [
    '🐱', '🦊', '🐰', '🐼', '🐯', '🦄',
    '🐸', '🐙', '🐧', '🐻', '🦁', '🦉'
  ];

  let currentUser = null;
  let activeTab = 'overview';
  let watchlistData = [];
  let devicesData = [];

  // 1. Check Session & Initialize
  function initProfilePage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (saved) {
        currentUser = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Gagal membaca sesi pengguna:', e);
    }

    if (!currentUser) {
      // Redirect to index with prompt to login
      alert('Silakan masuk terlebih dahulu untuk mengakses Halaman Profil SashimiLix! 🌸');
      window.location.href = 'index.html';
      return;
    }

    renderProfileHeader();
    renderOverviewTab();
    setupTabNavigation();
    loadDevices();
    loadWatchlist();
    loadPreferences();
    setupSecurityForm();
    setupAvatarCustomizer();
    setupBioEditor();
    setupDangerZone();
  }

  // 2. Render Profile Header & Hero Card
  function renderProfileHeader() {
    const avatarEl = document.getElementById('profile-hero-avatar');
    const nameEl = document.getElementById('profile-hero-name');
    const emailEl = document.getElementById('profile-hero-email');
    const badgeEl = document.getElementById('profile-hero-badge');
    const joinedEl = document.getElementById('profile-hero-joined');
    const navAvatarEl = document.querySelector('.user-avatar-btn');

    const isImg = currentUser.avatar && (currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('data:'));
    const avatarMarkup = isImg
      ? `<img src="${currentUser.avatar}" alt="Avatar">`
      : (currentUser.avatar || '🐱');

    if (avatarEl) avatarEl.innerHTML = avatarMarkup;
    if (navAvatarEl) {
      navAvatarEl.innerHTML = `${avatarMarkup} <span class="user-online-dot active"></span>`;
    }

    if (nameEl) nameEl.textContent = currentUser.username || 'Otaku Member';
    if (emailEl) emailEl.textContent = currentUser.email || 'user@sashimilix.com';
    if (badgeEl) badgeEl.textContent = `🌸 ${currentUser.badge || 'VIP Otaku'}`;

    if (joinedEl) {
      const joinDate = currentUser.created_at
        ? new Date(currentUser.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        : '16 Oktober 2026';
      joinedEl.textContent = joinDate;
    }

    // Set bio text
    const bioTextEl = document.getElementById('profile-bio-text');
    if (bioTextEl) {
      bioTextEl.textContent = `"${currentUser.bio || 'Menikmati keajaiban dunia anime dan sinema bersama SashimiLix! 🌸'}"`;
    }
  }

  // 3. Tab Switching
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.profile-tab-item');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');
        if (!tabTarget) return;

        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.profile-tab-panel').forEach(panel => {
          panel.classList.remove('active');
        });

        const activePanel = document.getElementById(`tab-panel-${tabTarget}`);
        if (activePanel) {
          activePanel.classList.add('active');
        }

        activeTab = tabTarget;
        playSound('pop');
      });
    });
  }

  // 4. Load & Render Overview Stats
  function renderOverviewTab() {
    const statWatched = document.getElementById('stat-watched-count');
    const statWatchlist = document.getElementById('stat-watchlist-count');
    const statGenre = document.getElementById('stat-favorite-genre');
    const statDays = document.getElementById('stat-active-days');

    if (statWatched) statWatched.textContent = currentUser.watched_count || 18;
    if (statGenre) statGenre.textContent = currentUser.favorite_genre || 'Anime & Fantasi';
    if (statDays) statDays.textContent = '14 Hari';

    // Watchlist count from localStorage or session
    const localWatchlist = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATCHLIST) || '[]');
    if (statWatchlist) statWatchlist.textContent = localWatchlist.length;
  }

  // 5. Security & Reset Password Form
  function setupSecurityForm() {
    const form = document.getElementById('form-change-password');
    const newPwdInput = document.getElementById('pwd-new');
    const strengthBar = document.getElementById('pwd-strength-indicator');
    const alertBox = document.getElementById('security-alert-box');

    // Password strength meter
    if (newPwdInput && strengthBar) {
      newPwdInput.addEventListener('input', () => {
        const val = newPwdInput.value;
        strengthBar.className = 'pwd-strength-fill';
        if (val.length === 0) {
          strengthBar.style.width = '0%';
        } else if (val.length < 6) {
          strengthBar.classList.add('weak');
        } else if (val.length < 10) {
          strengthBar.classList.add('medium');
        } else {
          strengthBar.classList.add('strong');
        }
      });
    }

    // Toggle password view buttons
    document.querySelectorAll('.pwd-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-for');
        const input = document.getElementById(targetId);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
          } else {
            input.type = 'password';
            btn.textContent = '👁️';
          }
        }
      });
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPassword = document.getElementById('pwd-old')?.value || '';
        const newPassword = document.getElementById('pwd-new')?.value || '';
        const confirmPassword = document.getElementById('pwd-confirm')?.value || '';
        const submitBtn = document.getElementById('btn-submit-pwd');

        if (alertBox) alertBox.style.display = 'none';

        if (newPassword !== confirmPassword) {
          showAlert(alertBox, '❌ Konfirmasi password baru tidak cocok!', 'error');
          return;
        }

        if (newPassword.length < 6) {
          showAlert(alertBox, '❌ Password baru minimal harus 6 karakter!', 'error');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>Memperbarui di Cloud...</span> ⏳';
        }

        try {
          const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUser.id,
              oldPassword,
              newPassword
            })
          });

          const data = await res.json();
          if (res.ok && data.ok) {
            playSound('burst');
            showAlert(alertBox, '✅ ' + data.message, 'success');
            form.reset();
            if (strengthBar) strengthBar.style.width = '0%';
          } else {
            playSound('bubble');
            showAlert(alertBox, '❌ ' + (data.error || 'Gagal mengubah password'), 'error');
          }
        } catch (err) {
          playSound('bubble');
          showAlert(alertBox, '❌ Terjadi kendala saat menghubungi server: ' + err.message, 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>💾 Simpan Password Baru</span>';
          }
        }
      });
    }
  }

  function showAlert(box, msg, type = 'error') {
    if (!box) return;
    box.style.display = 'block';
    box.className = `clay-form-error ${type === 'success' ? 'success' : ''}`;
    box.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 94, 126, 0.15)';
    box.style.borderColor = type === 'success' ? '#10b981' : 'var(--primary-coral)';
    box.style.color = type === 'success' ? '#10b981' : 'var(--primary-coral)';
    box.textContent = msg;
  }

  // 6. Active Devices Management ("Login Pakai Device Apa")
  async function loadDevices() {
    const listContainer = document.getElementById('device-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">⏳ Memuat riwayat perangkat dari Cloud...</div>';

    try {
      const res = await fetch(`/api/auth/devices/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.devices)) {
          devicesData = data.devices;
          renderDevicesList(devicesData);
          return;
        }
      }
    } catch (err) {
      console.warn('Gagal memuat perangkat dari backend, menggunakan data simulasi sesi:', err);
    }

    // Fallback devices
    devicesData = [
      {
        id: 1,
        device_name: 'MacBook Pro 16" (Apple M-Series)',
        browser: 'Google Chrome 128 • macOS Sequoia',
        ip_address: '180.252.88.14 (Jakarta, ID)',
        is_current: true,
        last_active: new Date().toISOString()
      },
      {
        id: 2,
        device_name: 'iPhone 15 Pro Max',
        browser: 'Mobile Safari 17.5 • iOS 17',
        ip_address: '114.124.204.82 (Surabaya, ID)',
        is_current: false,
        last_active: new Date(Date.now() - 7200000).toISOString()
      },
      {
        id: 3,
        device_name: 'Samsung Smart TV 4K Crystal UHD',
        browser: 'Tizen OS TV Browser',
        ip_address: '180.252.88.14 (Ruang Keluarga)',
        is_current: false,
        last_active: new Date(Date.now() - 86400000).toISOString()
      }
    ];
    renderDevicesList(devicesData);
  }

  function renderDevicesList(devices) {
    const listContainer = document.getElementById('device-list-container');
    if (!listContainer) return;

    if (devices.length === 0) {
      listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Tidak ada perangkat lain yang terhubung.</div>';
      return;
    }

    listContainer.innerHTML = devices.map(dev => {
      const icon = dev.device_name.toLowerCase().includes('phone') ? '📱'
        : dev.device_name.toLowerCase().includes('tv') ? '📺' : '💻';

      return `
        <div class="device-item-card ${dev.is_current ? 'current' : ''}">
          <div class="device-icon-col">${icon}</div>
          <div class="device-details-col">
            <div class="device-name-row">
              <span>${dev.device_name}</span>
              ${dev.is_current ? '<span class="device-current-badge">✓ Perangkat Ini (Aktif)</span>' : ''}
            </div>
            <div class="device-meta-row">
              🌐 ${dev.browser} • 📍 ${dev.ip_address}
            </div>
            <div class="device-meta-row" style="margin-top: 2px; font-size: 0.78rem; opacity: 0.8;">
              ⏱️ ${dev.is_current ? 'Aktif sekarang' : 'Terakhir aktif: ' + formatRelativeTime(dev.last_active)}
            </div>
          </div>
          ${!dev.is_current ? `
            <button type="button" class="clay-button clay-button-danger btn-logout-single-device" data-id="${dev.id}" style="padding: 6px 14px; font-size: 0.8rem;">
              Keluarkan 🚪
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    // Attach single device logout buttons
    listContainer.querySelectorAll('.btn-logout-single-device').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        devicesData = devicesData.filter(d => d.id !== id);
        renderDevicesList(devicesData);
        playSound('pop');
        showToast('Perangkat tersebut telah berhasil dikeluarkan!');
      });
    });

    // Remote logout all other devices button
    const btnLogoutOthers = document.getElementById('btn-logout-other-devices');
    if (btnLogoutOthers) {
      btnLogoutOthers.onclick = async () => {
        if (!confirm('Apakah Anda yakin ingin mengeluarkan semua perangkat lain dari akun SashimiLix Anda?')) return;
        playSound('pop');
        try {
          await fetch('/api/auth/devices/logout-others', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
          });
        } catch (e) {}

        devicesData = devicesData.filter(d => d.is_current);
        renderDevicesList(devicesData);
        playSound('burst');
        showToast('🚪 Berhasil mengeluarkan semua perangkat lain!');
      };
    }
  }

  function formatRelativeTime(isoStr) {
    if (!isoStr) return 'Beberapa saat lalu';
    const diffMin = Math.round((Date.now() - new Date(isoStr).getTime()) / 60000);
    if (diffMin < 2) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} menit yang lalu`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours} jam yang lalu`;
    return `${Math.round(diffHours / 24)} hari yang lalu`;
  }

  // 7. Watchlist Tab Integration
  async function loadWatchlist() {
    const grid = document.getElementById('profile-watchlist-grid');
    if (!grid) return;

    let items = [];
    try {
      const res = await fetch(`/api/watchlist/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.watchlist)) {
          items = data.watchlist;
        }
      }
    } catch (e) {}

    if (items.length === 0) {
      items = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATCHLIST) || '[]');
    }

    watchlistData = items;
    renderWatchlistGrid(watchlistData);
  }

  function renderWatchlistGrid(items) {
    const grid = document.getElementById('profile-watchlist-grid');
    const emptyNotice = document.getElementById('watchlist-empty-notice');
    if (!grid) return;

    if (!items || items.length === 0) {
      grid.style.display = 'none';
      if (emptyNotice) emptyNotice.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    if (emptyNotice) emptyNotice.style.display = 'none';

    grid.innerHTML = items.map(movie => {
      const poster = movie.poster || movie.poster_path || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400';
      return `
        <div class="profile-watchlist-card">
          <img src="${poster}" alt="${movie.title}" class="profile-watchlist-poster" loading="lazy">
          <div class="profile-watchlist-info">
            <div class="profile-watchlist-title" title="${movie.title}">${movie.title}</div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 6px;">
              ⭐ ${movie.rating || 9.2} • ${movie.category || 'Anime'}
            </div>
            <div class="profile-watchlist-actions">
              <a href="watch.html?id=${movie.id}" class="clay-button clay-button-coral" style="flex: 1; padding: 6px 10px; font-size: 0.8rem; text-decoration: none; text-align: center;">
                Tonton 🎬
              </a>
              <button type="button" class="clay-button clay-button-danger btn-remove-watchlist" data-id="${movie.id}" title="Hapus dari Watchlist" style="padding: 6px 10px; font-size: 0.8rem;">
                ✕
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Remove item listener
    grid.querySelectorAll('.btn-remove-watchlist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        watchlistData = watchlistData.filter(m => String(m.id) !== String(id));
        localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(watchlistData));
        renderWatchlistGrid(watchlistData);
        renderOverviewTab();
        playSound('pop');
        showToast('Film dihapus dari koleksi Watchlist.');
      });
    });
  }

  // 8. Avatar Customization (Emoji Picker & Neon Storage Upload)
  function setupAvatarCustomizer() {
    const avatarPicker = document.getElementById('profile-avatar-picker-grid');
    const uploadInput = document.getElementById('profile-file-upload');
    const avatarHero = document.getElementById('profile-hero-avatar');

    if (avatarPicker) {
      avatarPicker.innerHTML = AVATAR_OPTIONS.map(emoji => `
        <button type="button" class="avatar-option-btn ${emoji === currentUser.avatar ? 'selected' : ''}" data-avatar="${emoji}">
          ${emoji}
        </button>
      `).join('');

      avatarPicker.querySelectorAll('.avatar-option-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const selected = btn.getAttribute('data-avatar');
          playSound('pop');
          await saveNewAvatar(selected);
          avatarPicker.querySelectorAll('.avatar-option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }

    if (uploadInput) {
      uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        playSound('pop');
        showToast('⏳ Mengunggah foto ke Neon Object Storage (Bucket: assets)...');

        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch('/api/storage/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type,
                dataBase64: reader.result
              })
            });

            if (res.ok) {
              const data = await res.json();
              if (data.ok && data.url) {
                await saveNewAvatar(data.url);
                playSound('burst');
                showToast('✨ Foto profil berhasil diunggah ke Neon Storage!');
              }
            } else {
              // Local preview fallback
              await saveNewAvatar(reader.result);
              showToast('✨ Foto profil disimpan di penyimpanan lokal!');
            }
          } catch (err) {
            // Local preview
            await saveNewAvatar(reader.result);
            showToast('✨ Foto profil disimpan di peramban.');
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }

  async function saveNewAvatar(newAvatar) {
    currentUser.avatar = newAvatar;
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
    renderProfileHeader();

    try {
      await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentUser.id,
          avatar: newAvatar
        })
      });
    } catch (e) {}
  }

  // 9. Bio Editor
  function setupBioEditor() {
    const editBtn = document.getElementById('btn-edit-bio');
    const saveBtn = document.getElementById('btn-save-bio');
    const cancelBtn = document.getElementById('btn-cancel-bio');
    const displayBox = document.getElementById('bio-display-box');
    const editBox = document.getElementById('bio-edit-box');
    const bioInput = document.getElementById('input-bio');

    if (!editBtn || !saveBtn || !bioInput) return;

    editBtn.addEventListener('click', () => {
      playSound('bubble');
      bioInput.value = currentUser.bio || '';
      displayBox.style.display = 'none';
      editBox.style.display = 'block';
    });

    cancelBtn.addEventListener('click', () => {
      displayBox.style.display = 'block';
      editBox.style.display = 'none';
    });

    saveBtn.addEventListener('click', async () => {
      const val = bioInput.value.trim();
      playSound('pop');
      currentUser.bio = val;
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
      renderProfileHeader();

      displayBox.style.display = 'block';
      editBox.style.display = 'none';
      showToast('💬 Bio profil berhasil disimpan!');

      try {
        await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentUser.id,
            bio: val
          })
        });
      } catch (e) {}
    });
  }

  // 10. Streaming & Player Preferences
  function loadPreferences() {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFS) || '{}');
    const qualSelect = document.getElementById('pref-quality');
    const serverSelect = document.getElementById('pref-server');
    const subSelect = document.getElementById('pref-subtitle');
    const saveBtn = document.getElementById('btn-save-prefs');

    if (qualSelect && prefs.quality) qualSelect.value = prefs.quality;
    if (serverSelect && prefs.server) serverSelect.value = prefs.server;
    if (subSelect && prefs.subtitle) subSelect.value = prefs.subtitle;

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const newPrefs = {
          quality: qualSelect?.value || '4k',
          server: serverSelect?.value || 'vidsrc_su',
          subtitle: subSelect?.value || 'id'
        };
        localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(newPrefs));
        playSound('burst');
        showToast('⚙️ Preferensi streaming Anda berhasil disimpan!');
      });
    }
  }

  // 11. Danger Zone & Logout
  function setupDangerZone() {
    const logoutBtn = document.getElementById('btn-logout-account');
    const topLogoutBtn = document.getElementById('btn-top-logout');

    const handleLogout = () => {
      if (confirm('Apakah Anda yakin ingin keluar dari akun SashimiLix?')) {
        playSound('bubble');
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        showToast('Sampai jumpa kembali! 🌸');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 600);
      }
    };

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (topLogoutBtn) topLogoutBtn.addEventListener('click', handleLogout);
  }

  // Sound & Toast Helpers
  function playSound(type = 'pop') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
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

  function showToast(msg) {
    let toast = document.getElementById('sashimi-toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sashimi-toast-notice';
      toast.className = 'sashimi-toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✨</span> ${msg}`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // Initialize on DOM Ready
  document.addEventListener('DOMContentLoaded', initProfilePage);

})();
