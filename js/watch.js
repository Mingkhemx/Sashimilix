/**
 * SashimiLix - Dedicated Full-Page Movie Player Engine (watch.js)
 * Clean, cinematic streaming without popup modals.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Application State
  const state = {
    theme: localStorage.getItem('sashimilix_theme') || 'light',
    soundEnabled: localStorage.getItem('sashimilix_sound') !== 'false',
    activeMovie: null,
    activeEpisode: 1,
    activeSeason: 1,
    activeServer: 'vidsrc_su',
    currentTrailerKey: null,
    comments: [...INITIAL_COMMENTS]
  };

  // Web Audio Synthesizer (Cute Pop & Bubble Sounds)
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
      console.warn("Audio Context pending gesture");
    }
  }

  // Toast Notification Helper
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

  // Theme Switcher (Light / Dark)
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
      applyTheme(state.theme === 'light' ? 'dark' : 'light');
    });
  }

  // Sound FX Switcher
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

  // Ambient Particles Background
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
    for (let i = 0; i < 24; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 12 + 6,
        speedY: -(Math.random() * 0.4 + 0.15),
        speedX: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.35 + 0.15,
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
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
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
  // DOM Elements for Watch Stage
  // ===================================================================
  const videoStageContainer = document.getElementById('video-stage-container');
  const embedScreen = document.getElementById('embed-screen');
  const videoElem = document.getElementById('video-screen');
  const playerLoading = document.getElementById('player-loading');
  const customVideoControls = document.getElementById('custom-video-controls');
  const serverPills = document.querySelectorAll('.server-pill-btn');
  const btnServerTrailer = document.getElementById('btn-server-trailer');
  const playerExternalLink = document.getElementById('player-external-link');
  const videoCenterBtn = document.getElementById('video-center-btn');
  const ctrlPlayBtn = document.getElementById('ctrl-play-btn');
  const ctrlTimelineWrap = document.getElementById('timeline-slider-wrap');
  const ctrlTimelinePlayed = document.getElementById('timeline-played');
  const ctrlTimelineThumb = document.getElementById('timeline-thumb');
  const ctrlTimeDisplay = document.getElementById('ctrl-time-display');
  const ctrlVolumeRange = document.getElementById('ctrl-volume-range');
  const ctrlMuteBtn = document.getElementById('ctrl-mute-btn');
  const ctrlFullscreenBtn = document.getElementById('ctrl-fullscreen-btn');
  const playerReactionsLayer = document.getElementById('video-reactions-layer');

  const playerTitle = document.getElementById('player-title');
  const playerRatingBadge = document.getElementById('player-rating-badge');
  const playerQualityBadge = document.getElementById('player-quality-badge');
  const playerTypeBadge = document.getElementById('player-type-badge');
  const playerYearBadge = document.getElementById('player-year-badge');
  const playerDesc = document.getElementById('player-desc');
  const episodesListElem = document.getElementById('episodes-list');
  const playerSeasonLabel = document.getElementById('player-season-label');
  const commentsFeedElem = document.getElementById('comments-feed');
  const commentInput = document.getElementById('comment-input');
  const commentSubmitBtn = document.getElementById('comment-submit-btn');
  const relatedMoviesGrid = document.getElementById('related-movies-grid');

  // Format mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // HTML5 Native Video Controls
  function toggleNativePlay() {
    if (!videoElem) return;
    if (videoElem.paused || videoElem.ended) {
      videoElem.play().catch(e => console.log('Autoplay interaction pending:', e));
    } else {
      videoElem.pause();
    }
  }

  if (videoCenterBtn) {
    videoCenterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSquishSound('pop');
      toggleNativePlay();
    });
  }

  if (ctrlPlayBtn) {
    ctrlPlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSquishSound('pop');
      toggleNativePlay();
    });
  }

  if (videoElem) {
    videoElem.addEventListener('click', () => toggleNativePlay());

    videoElem.addEventListener('play', () => {
      if (ctrlPlayBtn) ctrlPlayBtn.textContent = '⏸';
      if (videoCenterBtn) videoCenterBtn.style.opacity = '0';
    });

    videoElem.addEventListener('pause', () => {
      if (ctrlPlayBtn) ctrlPlayBtn.textContent = '▶';
      if (videoCenterBtn) videoCenterBtn.style.opacity = '1';
    });

    videoElem.addEventListener('timeupdate', () => {
      if (!videoElem.duration) return;
      const progress = (videoElem.currentTime / videoElem.duration) * 100;
      if (ctrlTimelinePlayed) ctrlTimelinePlayed.style.width = `${progress}%`;
      if (ctrlTimelineThumb) ctrlTimelineThumb.style.left = `${progress}%`;
      if (ctrlTimeDisplay) {
        ctrlTimeDisplay.textContent = `${formatTime(videoElem.currentTime)} / ${formatTime(videoElem.duration)}`;
      }
    });

    videoElem.addEventListener('loadedmetadata', () => {
      if (ctrlTimeDisplay) {
        ctrlTimeDisplay.textContent = `0:00 / ${formatTime(videoElem.duration)}`;
      }
    });

    videoElem.addEventListener('ended', () => {
      if (ctrlPlayBtn) ctrlPlayBtn.textContent = '▶';
      if (videoCenterBtn) videoCenterBtn.style.opacity = '1';
    });
  }

  if (ctrlTimelineWrap && videoElem) {
    ctrlTimelineWrap.addEventListener('click', (e) => {
      const rect = ctrlTimelineWrap.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (videoElem.duration) {
        videoElem.currentTime = pos * videoElem.duration;
      }
    });
  }

  if (ctrlVolumeRange && videoElem) {
    ctrlVolumeRange.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      videoElem.volume = val;
      videoElem.muted = (val === 0);
      if (ctrlMuteBtn) ctrlMuteBtn.textContent = val === 0 ? '🔇' : '🔊';
    });
  }

  if (ctrlMuteBtn && videoElem) {
    ctrlMuteBtn.addEventListener('click', () => {
      videoElem.muted = !videoElem.muted;
      if (videoElem.muted) {
        ctrlMuteBtn.textContent = '🔇';
        if (ctrlVolumeRange) ctrlVolumeRange.value = 0;
      } else {
        ctrlMuteBtn.textContent = '🔊';
        if (ctrlVolumeRange) ctrlVolumeRange.value = videoElem.volume || 0.8;
      }
    });
  }

  if (ctrlFullscreenBtn && videoStageContainer) {
    ctrlFullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        videoStageContainer.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // ===================================================================
  // Load Target Movie Data
  // ===================================================================
  async function resolveTargetMovie() {
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get('id');
    const paramTmdb = params.get('tmdb');
    const paramType = params.get('type') || 'movie';

    // 1. Check SessionStorage first
    const stored = sessionStorage.getItem('sashimilix_active_movie');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (!paramId || String(parsed.id) === String(paramId) || String(parsed.tmdbId) === String(paramId)) {
          return parsed;
        }
      } catch (e) {}
    }

    // 2. Check local catalog MOVIES_DATA
    if (paramId) {
      const foundInLocal = MOVIES_DATA.find(m => String(m.id) === String(paramId) || String(m.tmdbId) === String(paramId));
      if (foundInLocal) return foundInLocal;
    }

    // 3. Fetch from TMDB if numeric ID available
    const numericId = paramTmdb || (paramId && !isNaN(Number(paramId)) ? paramId : null);
    if (numericId) {
      try {
        const mediaType = paramType === 'tv' || paramType === 'series' || paramType === 'anime' ? 'tv' : 'movie';
        const details = await TmdbService.getDetails(mediaType, numericId);
        if (details) {
          return TmdbService.formatItem(details, mediaType);
        }
      } catch (e) {
        console.warn("Could not fetch remote TMDB details:", e);
      }
    }

    // 4. Default fallback to first movie in data
    return MOVIES_DATA[0];
  }

  // Helper: Determine strictly whether movie is TV series or movie
  function getEffectiveMediaType(movie) {
    if (!movie) return 'movie';
    if (movie.mediaType === 'movie') return 'movie';
    if (movie.mediaType === 'tv') return 'tv';
    if (movie.type === 'movie') return 'movie';
    if (movie.type === 'series') return 'tv';
    if (movie.episodes && movie.episodes.length > 1) return 'tv';
    if (typeof movie.duration === 'string' && (movie.duration.includes('Ep') || movie.duration.toLowerCase().includes('series'))) return 'tv';
    return 'movie';
  }

  // Setup Movie in Watch Page
  async function setupWatchMovie(movie) {
    state.activeMovie = movie;
    state.activeEpisode = 1;
    state.activeSeason = 1;
    state.currentTrailerKey = null;

    // Document Title
    document.title = `Nonton ${movie.title} — SashimiLix`;

    // Render Basic Info
    if (playerTitle) playerTitle.textContent = movie.title;
    if (playerTypeBadge) playerTypeBadge.textContent = (movie.genres || []).join(' • ');
    if (playerRatingBadge) playerRatingBadge.textContent = `⭐ ${movie.rating || 9.0}`;
    if (playerQualityBadge) playerQualityBadge.textContent = movie.quality || '4K UHD';
    if (playerYearBadge) playerYearBadge.textContent = movie.year || 2026;
    if (playerDesc) playerDesc.textContent = movie.synopsis || 'Sinopsis tayangan tidak tersedia.';

    // Check if numeric TMDB ID exists
    const hasNumericTmdbId = movie.tmdbId && !isNaN(Number(movie.tmdbId));
    if (!hasNumericTmdbId || movie.isOriginal) {
      state.activeServer = 'demo';
    } else {
      // Default to VidSrc SU (Server 1) which has maximum uptime and no 404
      state.activeServer = 'vidsrc_su';
    }

    // Reset Pill UI
    serverPills.forEach(p => {
      if (p.dataset.server) {
        p.classList.toggle('active', p.dataset.server === state.activeServer);
      }
    });

    // Show loading spinner
    if (playerLoading) playerLoading.classList.add('active');

    // Fetch Details & Trailer from TMDB
    try {
      const mediaType = getEffectiveMediaType(movie);
      const tmdbId = movie.tmdbId || (hasNumericTmdbId ? movie.id : null);

      if (tmdbId && hasNumericTmdbId) {
        const details = await TmdbService.getDetails(mediaType, tmdbId);

        if (details) {
          if (details.overview && details.overview.trim() !== '') {
            playerDesc.textContent = details.overview;
          }

          if (details.videos && details.videos.results && details.videos.results.length > 0) {
            const trailer = details.videos.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) 
              || details.videos.results[0];
            if (trailer && trailer.key) {
              state.currentTrailerKey = trailer.key;
              if (btnServerTrailer) btnServerTrailer.style.display = 'inline-block';
            }
          }
        }

        // Fetch Episodes if TV series
        if (mediaType === 'tv') {
          const eps = await TmdbService.getSeasonEpisodes(tmdbId, 1);
          movie.episodes = eps;
        } else {
          movie.episodes = [{ ep: 1, title: 'Full Movie HD', duration: movie.duration || 'Film Lengkap' }];
        }
      } else {
        if (btnServerTrailer) btnServerTrailer.style.display = 'none';
        if (!movie.episodes || movie.episodes.length === 0) {
          movie.episodes = [{ ep: 1, title: 'Full Movie HD', duration: movie.duration || 'Film Lengkap' }];
        }
      }

      renderEpisodesList(movie);
      updateStreamingSource();
    } catch (err) {
      console.warn("Failed loading full details:", err);
      updateStreamingSource();
    }
  }

  // Update Streaming Source in Theater
  function updateStreamingSource() {
    const movie = state.activeMovie;
    if (!movie) return;

    const mediaType = getEffectiveMediaType(movie);
    const hasNumericTmdbId = movie.tmdbId && !isNaN(Number(movie.tmdbId));
    const tmdbId = hasNumericTmdbId ? movie.tmdbId : (movie.id && !isNaN(Number(movie.id)) ? movie.id : null);

    if (state.activeServer === 'demo' || !tmdbId) {
      // Native HTML5 Player Mode
      if (videoStageContainer) {
        videoStageContainer.classList.add('native-mode');
        videoStageContainer.classList.remove('embed-mode');
      }
      if (embedScreen) {
        embedScreen.style.display = 'none';
        embedScreen.src = 'about:blank';
      }
      if (videoElem) {
        videoElem.style.display = 'block';
        videoElem.src = movie.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        videoElem.load();
        videoElem.play().catch(e => console.log("Waiting for play gesture"));
      }
      if (videoCenterBtn) {
        videoCenterBtn.style.display = 'flex';
        videoCenterBtn.style.opacity = '1';
      }
      if (customVideoControls) customVideoControls.style.display = 'flex';
      if (playerLoading) playerLoading.classList.remove('active');
    } else {
      // Streaming Server Embed Mode (VidSrc SU, 2Embed, MultiEmbed, VidSrc RIP, VidLink, Trailer)
      if (videoStageContainer) {
        videoStageContainer.classList.add('embed-mode');
        videoStageContainer.classList.remove('native-mode');
      }
      if (videoElem) {
        videoElem.pause();
        videoElem.style.display = 'none';
      }
      if (videoCenterBtn) videoCenterBtn.style.display = 'none';
      if (customVideoControls) customVideoControls.style.display = 'none';

      const streamUrl = TmdbService.getStreamingEmbedUrl(
        state.activeServer,
        mediaType,
        tmdbId,
        state.activeSeason,
        state.activeEpisode,
        state.currentTrailerKey
      );

      if (playerExternalLink) {
        playerExternalLink.href = streamUrl;
      }

      if (embedScreen) {
        embedScreen.style.display = 'block';
        if (playerLoading) playerLoading.classList.add('active');
        embedScreen.src = streamUrl;

        setTimeout(() => {
          if (playerLoading) playerLoading.classList.remove('active');
        }, 800);

        embedScreen.onload = () => {
          if (playerLoading) playerLoading.classList.remove('active');
        };
      }
    }
  }


  // Server Switcher Click Handlers
  serverPills.forEach(pill => {
    if (!pill.dataset.server) return; // Only process server selector pills
    pill.addEventListener('click', () => {
      playSquishSound('pop');
      serverPills.forEach(p => {
        if (p.dataset.server) p.classList.remove('active');
      });
      pill.classList.add('active');
      state.activeServer = pill.dataset.server;

      const serverName = pill.textContent.trim();
      showToast(`Beralih ke: ${serverName}`);
      updateStreamingSource();
    });
  });

  // Quick Failover Switcher Button
  const quickFailoverBtn = document.getElementById('quick-server-failover-btn');
  if (quickFailoverBtn) {
    quickFailoverBtn.addEventListener('click', () => {
      playSquishSound('pop');
      const serverOrder = ['vidsrc_su', 'superembed', '2embed', 'demo'];
      const currentIndex = serverOrder.indexOf(state.activeServer);
      const nextServer = serverOrder[(currentIndex + 1) % serverOrder.length];
      state.activeServer = nextServer;

      serverPills.forEach(p => {
        if (p.dataset.server) {
          p.classList.toggle('active', p.dataset.server === nextServer);
        }
      });

      const nextPill = document.querySelector(`.server-pill-btn[data-server="${nextServer}"]`);
      const serverName = nextPill ? nextPill.textContent.trim() : nextServer;
      showToast(`Mencoba server alternatif: ${serverName}`);
      updateStreamingSource();
    });
  }

  // Render Episode List
  function renderEpisodesList(movie) {
    if (!episodesListElem) return;
    const episodes = movie.episodes && movie.episodes.length > 0 ? movie.episodes : [
      { ep: 1, title: 'Episode 1', duration: '24m' }
    ];

    if (playerSeasonLabel) {
      playerSeasonLabel.textContent = movie.mediaType === 'tv' ? `Musim ${state.activeSeason}` : 'Film Lengkap';
    }

    episodesListElem.innerHTML = episodes.map(ep => `
      <div class="episode-pill-item ${ep.ep === state.activeEpisode ? 'active' : ''}" data-ep="${ep.ep}">
        <span class="episode-num">EP ${ep.ep}</span>
        <span class="episode-name">${ep.title}</span>
        <span class="episode-dur">${ep.duration || '24m'}</span>
      </div>
    `).join('');

    episodesListElem.querySelectorAll('.episode-pill-item').forEach(item => {
      item.addEventListener('click', () => {
        playSquishSound('bubble');
        const epNum = parseInt(item.dataset.ep, 10);
        state.activeEpisode = epNum;
        episodesListElem.querySelectorAll('.episode-pill-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        showToast(`Memutar Episode ${epNum}: ${episodes[epNum - 1]?.title || ''}`);
        updateStreamingSource();
      });
    });
  }

  // Floating Emoji Burst Reactions
  const reactionButtons = document.querySelectorAll('.reaction-burst-btn');
  reactionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      playSquishSound('burst');
      const emoji = btn.dataset.emoji || '💖';
      spawnFloatingReaction(emoji);

      const countElem = btn.querySelector('.reaction-count');
      if (countElem) {
        countElem.textContent = parseInt(countElem.textContent, 10) + 1;
      }
    });
  });

  function spawnFloatingReaction(emoji) {
    if (!playerReactionsLayer) return;
    const item = document.createElement('div');
    item.className = 'floating-reaction-item';
    item.textContent = emoji;
    item.style.right = `${Math.random() * 60 + 10}px`;
    playerReactionsLayer.appendChild(item);

    setTimeout(() => {
      item.remove();
    }, 2000);
  }

  // Comments Engine
  function renderComments() {
    if (!commentsFeedElem) return;
    commentsFeedElem.innerHTML = state.comments.map(c => `
      <div class="comment-bubble">
        <div class="comment-user-row">
          <span class="comment-username">${c.avatar} ${c.user}</span>
          <span style="color: var(--text-muted); font-size: 0.75rem;">${c.time}</span>
        </div>
        <p class="comment-text">${c.text}</p>
      </div>
    `).join('');
  }
  renderComments();

  if (commentSubmitBtn && commentInput) {
    function submitComment() {
      const text = commentInput.value.trim();
      if (!text) return;
      playSquishSound('burst');
      state.comments.unshift({
        user: "Kamu (Penonton SashimiLix)",
        avatar: "🐱",
        time: "Baru saja",
        text: text,
        likes: 1
      });
      commentInput.value = '';
      renderComments();
      showToast("Komentar kamu berhasil dikirim! 💬");
    }

    commentSubmitBtn.addEventListener('click', submitComment);
    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitComment();
    });
  }

  // Render Recommended Movies at Bottom
  async function renderRelatedMovies() {
    if (!relatedMoviesGrid) return;

    let related = MOVIES_DATA.filter(m => String(m.id) !== String(state.activeMovie?.id)).slice(0, 8);

    relatedMoviesGrid.innerHTML = related.map(m => {
      return `
        <div class="movie-card" data-id="${m.id}">
          <div class="movie-poster-wrap">
            <img src="${m.poster}" alt="${m.title}" class="movie-poster-img" loading="lazy">
            <div class="movie-card-glare"></div>
            ${m.badge ? `<div class="card-badge badge-popular">${m.badge}</div>` : ''}
            <div class="card-hover-play">
              <div class="card-play-icon">▶</div>
            </div>
          </div>
          <div class="movie-info-wrap">
            <div class="movie-genres-row">
              ${(m.genres || []).slice(0, 2).map(g => `<span class="genre-tag">${g}</span>`).join('')}
            </div>
            <h4 class="movie-card-title">${m.title}</h4>
            <div class="movie-meta-footer">
              <span class="movie-meta-rating">★ ${m.rating || 9.0}</span>
              <span class="movie-meta-episodes">${m.duration || 'Tayangan'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    relatedMoviesGrid.querySelectorAll('.movie-card').forEach(card => {
      const id = card.dataset.id;
      const target = MOVIES_DATA.find(m => String(m.id) === String(id));
      card.addEventListener('click', () => {
        playSquishSound('bubble');
        if (target) {
          sessionStorage.setItem('sashimilix_active_movie', JSON.stringify(target));
          setupWatchMovie(target);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  // Initialize
  const initialMovie = await resolveTargetMovie();
  await setupWatchMovie(initialMovie);
  await renderRelatedMovies();
});
