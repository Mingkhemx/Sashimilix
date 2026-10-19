/**
 * SashimiLix - Interactive Streaming Application Engine with TMDB API Integration
 * Claymorphic 3D Physics, Multi-Server Streaming Embeds, Sound Effects, Canvas Particles, Light/Dark Modes
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    theme: localStorage.getItem('sashimilix_theme') || 'light',
    soundEnabled: localStorage.getItem('sashimilix_sound') !== 'false',
    currentHeroIndex: 0,
    currentFilter: 'all',
    searchQuery: '',
    watchlist: JSON.parse(localStorage.getItem('sashimilix_watchlist') || '[]'),
    activeMovie: null,
    activeEpisode: 1,
    activeSeason: 1,
    activeServer: 'vidsrc_to',
    currentTrailerKey: null,
    comments: [...INITIAL_COMMENTS],
    cachedCatalog: {},
    isSearching: false
  };

  // Sound Synthesizer (Web Audio API - Cute Pop / Squish Sounds)
  let audioCtx = null;
  function playSquishSound(type = 'pop') {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (type === 'pop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'bubble') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'burst') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(950, now + 0.18);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn("Audio Context init pending user gesture");
    }
  }

  // ===================================================================
  // 1. THEME SWITCHER (Light / Dark Mode)
  // ===================================================================
  const themeSwitchBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sashimilix_theme', theme);
    if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
  }

  applyTheme(state.theme);

  if (themeSwitchBtn) {
    themeSwitchBtn.addEventListener('click', () => {
      playSquishSound('pop');
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  }

  // Sound Toggle Button
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  function updateSoundUI() {
    if (!soundToggleBtn) return;
    soundToggleBtn.innerHTML = state.soundEnabled ? '🔔' : '🔕';
    soundToggleBtn.title = state.soundEnabled ? 'Suara Efek: Aktif' : 'Suara Efek: Bisu';
  }
  updateSoundUI();

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem('sashimilix_sound', state.soundEnabled);
      updateSoundUI();
      if (state.soundEnabled) playSquishSound('pop');
    });
  }

  // ===================================================================
  // 2. AMBIENT BACKGROUND PARTICLES (Floating Bubbles & Stars)
  // ===================================================================
  const canvas = document.getElementById('ambient-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const particleCount = 28;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 14 + 6,
        speedY: -(Math.random() * 0.4 + 0.15),
        speedX: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.4 + 0.15,
        color: ['#FF5E7E', '#7C5CFC', '#FFA6C9', '#FFD166'][Math.floor(Math.random() * 4)],
        pulse: Math.random() * Math.PI,
        type: Math.random() > 0.4 ? 'bubble' : 'sparkle'
      });
    }

    function renderParticles() {
      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.pulse += 0.02;

        if (p.y < -30) {
          p.y = height + 30;
          p.x = Math.random() * width;
        }
        if (p.x < -30) p.x = width + 30;
        if (p.x > width + 30) p.x = -30;

        ctx.save();
        ctx.globalAlpha = p.opacity + Math.sin(p.pulse) * 0.1;
        ctx.fillStyle = p.color;

        if (p.type === 'bubble') {
          // Clay bubble with soft sheen
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Bubble inner highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Cute Star / Sparkle
          ctx.beginPath();
          const r = p.size * 0.8;
          ctx.moveTo(p.x, p.y - r);
          ctx.quadraticCurveTo(p.x, p.y, p.x + r, p.y);
          ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + r);
          ctx.quadraticCurveTo(p.x, p.y, p.x - r, p.y);
          ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r);
          ctx.fill();
        }

        ctx.restore();
      });

      requestAnimationFrame(renderParticles);
    }
    renderParticles();
  }

  // ===================================================================
  // 3. HERO CAROUSEL ENGINE (TMDB Live Data)
  // ===================================================================
  let heroMovies = MOVIES_DATA.slice(0, 5);
  const heroWrapper = document.getElementById('hero-clay-wrapper');
  const heroBackdrop = document.getElementById('hero-backdrop-img');
  const heroBadgeType = document.getElementById('hero-badge-type');
  const heroBadgeQuality = document.getElementById('hero-badge-quality');
  const heroTitle = document.getElementById('hero-title');
  const heroRating = document.getElementById('hero-rating-val');
  const heroYear = document.getElementById('hero-year-val');
  const heroDuration = document.getElementById('hero-duration-val');
  const heroSynopsis = document.getElementById('hero-synopsis');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroWatchlistBtn = document.getElementById('hero-watchlist-btn');
  const heroIndicators = document.getElementById('hero-indicators');

  function renderHeroIndicators() {
    if (!heroIndicators) return;
    heroIndicators.innerHTML = heroMovies.map((_, i) => `
      <button class="hero-dot ${i === state.currentHeroIndex ? 'active' : ''}" data-index="${i}" aria-label="Slide ${i + 1}"></button>
    `).join('');

    heroIndicators.querySelectorAll('.hero-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        playSquishSound('pop');
        const idx = parseInt(e.target.dataset.index, 10);
        setHeroSlide(idx);
      });
    });
  }

  function setHeroSlide(idx) {
    state.currentHeroIndex = idx;
    const movie = heroMovies[idx];
    if (!movie) return;

    if (heroBackdrop) {
      heroBackdrop.style.opacity = '0.3';
      setTimeout(() => {
        heroBackdrop.src = movie.banner || movie.poster;
        heroBackdrop.style.opacity = '0.85';
      }, 200);
    }

    if (heroBadgeType) heroBadgeType.textContent = movie.badge || 'TMDB EXCLUSIVE';
    if (heroBadgeQuality) heroBadgeQuality.textContent = movie.quality || '4K UHD';
    if (heroTitle) heroTitle.textContent = movie.title;
    if (heroRating) heroRating.textContent = movie.rating;
    if (heroYear) heroYear.textContent = movie.year;
    if (heroDuration) heroDuration.textContent = movie.duration;
    if (heroSynopsis) heroSynopsis.textContent = movie.synopsis;

    // Update watchlist button state
    updateHeroWatchlistBtn(movie.id);

    // Update active dot
    if (heroIndicators) {
      heroIndicators.querySelectorAll('.hero-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === idx);
      });
    }
  }

  function updateHeroWatchlistBtn(movieId) {
    if (!heroWatchlistBtn) return;
    const isInWatchlist = state.watchlist.some(w => String(w.id || w) === String(movieId));
    heroWatchlistBtn.innerHTML = isInWatchlist
      ? `<span>❤️</span> Tersimpan`
      : `<span>➕</span> Watchlist`;
  }

  // Navigate to dedicated full-page theater (no popup modal)
  function navigateToWatch(movie) {
    if (!movie) return;
    try {
      sessionStorage.setItem('sashimilix_active_movie', JSON.stringify(movie));
    } catch (e) {}
    const tmdbParam = movie.tmdbId ? `&tmdb=${movie.tmdbId}` : '';
    const mediaParam = movie.mediaType || movie.type || 'movie';
    const idParam = encodeURIComponent(movie.id || movie.tmdbId);
    window.location.href = `watch.html?id=${idParam}&type=${mediaParam}${tmdbParam}`;
  }

  if (heroPlayBtn) {
    heroPlayBtn.addEventListener('click', () => {
      playSquishSound('bubble');
      navigateToWatch(heroMovies[state.currentHeroIndex]);
    });
  }

  if (heroWatchlistBtn) {
    heroWatchlistBtn.addEventListener('click', () => {
      const currentMovie = heroMovies[state.currentHeroIndex];
      toggleWatchlist(currentMovie);
      updateHeroWatchlistBtn(currentMovie.id);
    });
  }

  let heroAutoTimer = null;
  function startHeroTimer() {
    clearInterval(heroAutoTimer);
    heroAutoTimer = setInterval(() => {
      if (heroMovies.length > 0) {
        const nextIdx = (state.currentHeroIndex + 1) % heroMovies.length;
        setHeroSlide(nextIdx);
      }
    }, 8000);
  }

  if (heroWrapper) {
    heroWrapper.addEventListener('mouseenter', () => clearInterval(heroAutoTimer));
    heroWrapper.addEventListener('mouseleave', startHeroTimer);
  }

  // ===================================================================
  // 4. MOVIES RENDERING & 3D CLAY TILT
  // ===================================================================
  const moviesGrid = document.getElementById('movies-grid');
  const sectionTitle = document.getElementById('catalog-title');
  const sectionCount = document.getElementById('catalog-count');

  function renderMovies(movies) {
    if (!moviesGrid) return;
    if (!movies || movies.length === 0) {
      moviesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;" class="clay-card">
          <div style="font-size: 3.5rem; margin-bottom: 12px;">🍥</div>
          <h3 style="font-family: var(--font-bubble); font-size: 1.5rem; margin-bottom: 8px;">Tidak Ada Film Ditemukan</h3>
          <p style="color: var(--text-secondary);">Coba cari dengan kata kunci lain atau pilih kategori berbeda.</p>
        </div>
      `;
      if (sectionCount) sectionCount.textContent = '0 Item';
      return;
    }

    if (sectionCount) sectionCount.textContent = `${movies.length} Item`;

    moviesGrid.innerHTML = movies.map(movie => {
      const isSaved = state.watchlist.some(w => String(w.id || w) === String(movie.id));
      const badgeClass = movie.badge && movie.badge.includes('TOP RATING')
        ? 'badge-popular'
        : (movie.badge && movie.badge.includes('TRENDING') ? 'badge-exclusive' : 'badge-default');

      return `
        <div class="movie-card" data-id="${movie.id}">
          <div class="movie-poster-wrap">
            <img src="${movie.poster}" alt="${movie.title}" class="movie-poster-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80'">
            <div class="movie-card-glare"></div>
            ${movie.badge ? `<div class="card-badge ${badgeClass}">${movie.badge}</div>` : ''}
            
            <div class="card-quick-actions">
              <button class="card-action-btn watchlist-btn ${isSaved ? 'active' : ''}" data-id="${movie.id}" title="${isSaved ? 'Hapus dari Watchlist' : 'Simpan ke Watchlist'}">
                ${isSaved ? '❤️' : '🤍'}
              </button>
            </div>

            <div class="card-hover-play">
              <div class="card-play-icon">▶</div>
            </div>
          </div>

          <div class="movie-info-wrap">
            <div class="movie-genres-row">
              ${(movie.genres || []).slice(0, 2).map(g => `<span class="genre-tag">${g}</span>`).join('')}
            </div>
            <h4 class="movie-card-title" title="${movie.title}">${movie.title}</h4>
            <div class="movie-meta-footer">
              <span class="movie-meta-rating">★ ${movie.rating || 8.5}</span>
              <span class="movie-meta-episodes">${movie.duration || (movie.mediaType === 'tv' ? 'Series' : 'Film')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Click Events & 3D Tilt Physics to each card
    moviesGrid.querySelectorAll('.movie-card').forEach(card => {
      const id = card.dataset.id;
      const movie = movies.find(m => String(m.id) === String(id));

      card.addEventListener('click', (e) => {
        if (e.target.closest('.watchlist-btn')) return;
        playSquishSound('bubble');
        if (movie) navigateToWatch(movie);
      });

      // 3D Tilt Interaction
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.02)`;

        const glare = card.querySelector('.movie-card-glare');
        if (glare) {
          const moveX = (x / rect.width) * 100;
          const moveY = (y / rect.height) * 100;
          glare.style.background = `radial-gradient(circle at ${moveX}% ${moveY}%, rgba(255,255,255,0.3) 0%, transparent 60%)`;
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)`;
        const glare = card.querySelector('.movie-card-glare');
        if (glare) {
          glare.style.background = `linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)`;
        }
      });
    });

    // Attach Watchlist Buttons
    moviesGrid.querySelectorAll('.watchlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const targetMovie = movies.find(m => String(m.id) === String(id));
        if (targetMovie) {
          toggleWatchlist(targetMovie);
          const isSaved = state.watchlist.some(w => String(w.id || w) === String(id));
          btn.classList.toggle('active', isSaved);
          btn.innerHTML = isSaved ? '❤️' : '🤍';
        }
      });
    });
  }

  // ===================================================================
  // 5. TMDB DATA LOADER & CATEGORY FILTERING
  // ===================================================================
  const filterPills = document.querySelectorAll('.filter-pill');
  const searchInput = document.getElementById('nav-search');
  const searchClear = document.getElementById('search-clear');

  async function loadCategoryMovies(category) {
    if (moviesGrid) {
      moviesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px;">
          <div class="clay-spinner" style="margin: 0 auto 16px;"></div>
          <p style="font-family: var(--font-bubble); color: var(--text-secondary);">Memuat data dari TMDB...</p>
        </div>
      `;
    }

    try {
      let items = [];
      if (category === 'watchlist') {
        items = state.watchlist;
      } else if (category === 'trending' || category === 'all') {
        if (!state.cachedCatalog.trending) {
          state.cachedCatalog.trending = await TmdbService.getTrending();
        }
        items = state.cachedCatalog.trending;
      } else if (category === 'anime') {
        if (!state.cachedCatalog.anime) {
          state.cachedCatalog.anime = await TmdbService.getPopularAnime();
        }
        items = state.cachedCatalog.anime;
      } else if (category === 'movie') {
        if (!state.cachedCatalog.movie) {
          state.cachedCatalog.movie = await TmdbService.getPopularMovies();
        }
        items = state.cachedCatalog.movie;
      } else if (category === 'series') {
        if (!state.cachedCatalog.series) {
          state.cachedCatalog.series = await TmdbService.getPopularSeries();
        }
        items = state.cachedCatalog.series;
      }

      // If TMDB returns empty or network issue, fallback to MOVIES_DATA
      if (!items || items.length === 0) {
        items = MOVIES_DATA;
      }

      renderMovies(items);
    } catch (err) {
      console.warn("Failed loading category:", category, err);
      renderMovies(MOVIES_DATA);
    }
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      playSquishSound('pop');
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.currentFilter = pill.dataset.filter;

      if (sectionTitle) {
        if (state.currentFilter === 'watchlist') {
          sectionTitle.textContent = 'Daftar Watchlist Saya';
        } else if (state.currentFilter === 'trending') {
          sectionTitle.textContent = 'Sedang Trending Hari Ini (TMDB)';
        } else if (state.currentFilter === 'anime') {
          sectionTitle.textContent = 'Anime & Animasi Jepang Terpopuler';
        } else if (state.currentFilter === 'movie') {
          sectionTitle.textContent = 'Film Box Office Dunia';
        } else if (state.currentFilter === 'series') {
          sectionTitle.textContent = 'Serial TV & K-Drama Populer';
        } else {
          sectionTitle.textContent = 'Eksplorasi Tayangan TMDB';
        }
      }

      loadCategoryMovies(state.currentFilter);
    });
  });

  // Live TMDB Search Handler with Debounce
  let searchDebounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      if (searchClear) {
        searchClear.style.display = state.searchQuery.length > 0 ? 'block' : 'none';
      }

      clearTimeout(searchDebounceTimer);
      if (state.searchQuery.length === 0) {
        loadCategoryMovies(state.currentFilter);
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        if (sectionTitle) sectionTitle.textContent = `Hasil Pencarian: "${state.searchQuery}"`;
        if (moviesGrid) {
          moviesGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px;">
              <div class="clay-spinner" style="margin: 0 auto 16px;"></div>
              <p style="font-family: var(--font-bubble); color: var(--text-secondary);">Mencari "${state.searchQuery}" di TMDB...</p>
            </div>
          `;
        }

        const results = await TmdbService.search(state.searchQuery);
        renderMovies(results);
      }, 350);
    });

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        playSquishSound('pop');
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.style.display = 'none';
        loadCategoryMovies(state.currentFilter);
        searchInput.focus();
      });
    }

    // Keyboard shortcut '/' to search
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // ===================================================================
  // 6. WATCHLIST SYSTEM & TOAST
  // ===================================================================
  const toastNotice = document.getElementById('toast-notice');
  let toastTimer = null;

  function showToast(message) {
    if (!toastNotice) return;
    toastNotice.innerHTML = `<span>✨</span> ${message}`;
    toastNotice.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastNotice.classList.remove('show');
    }, 2800);
  }

  function toggleWatchlist(movie) {
    playSquishSound('pop');
    const existingIndex = state.watchlist.findIndex(w => String(w.id || w) === String(movie.id));

    if (existingIndex > -1) {
      state.watchlist.splice(existingIndex, 1);
      showToast(`Dihapus dari Watchlist: ${movie.title}`);
    } else {
      state.watchlist.push(movie);
      showToast(`Disimpan ke Watchlist: ${movie.title} ❤️`);
    }

    localStorage.setItem('sashimilix_watchlist', JSON.stringify(state.watchlist));
    if (window.SashimiAuth && typeof window.SashimiAuth.syncWatchlistToNeon === 'function') {
      window.SashimiAuth.syncWatchlistToNeon(state.watchlist);
    }
    if (state.currentFilter === 'watchlist') {
      renderMovies(state.watchlist);
    }
  }

  // ===================================================================
  // 7. FULL-PAGE STREAMING NAVIGATION (NO POPUP MODAL)
  // ===================================================================
  function openPlayerModal(movie) {
    navigateToWatch(movie);
  }

  // ===================================================================
  // INITIALIZE APP WITH TMDB TRENDING DATA
  // ===================================================================
  async function initApp() {
    try {
      const trending = await TmdbService.getTrending();
      if (trending && trending.length > 0) {
        state.cachedCatalog.trending = trending;
        heroMovies = trending.slice(0, 5);
        renderHeroIndicators();
        setHeroSlide(0);
        startHeroTimer();
        renderMovies(trending);
      } else {
        renderHeroIndicators();
        setHeroSlide(0);
        startHeroTimer();
        renderMovies(MOVIES_DATA);
      }
    } catch (err) {
      console.warn("Init TMDB fallback:", err);
      renderHeroIndicators();
      setHeroSlide(0);
      startHeroTimer();
      renderMovies(MOVIES_DATA);
    }
  }

  initApp();
});
