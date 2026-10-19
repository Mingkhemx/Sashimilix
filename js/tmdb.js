/**
 * SashimiLix - TMDB API Service & Streaming Provider Engine
 * API Integration with Live Search, Categories, Real Metadata, and Multi-Server Streaming Embeds
 */

const TMDB_CONFIG = {
  API_KEY: '3c888b69734f28f29611683c958aa09d',
  READ_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzYzg4OGI2OTczNGYyOGYyOTYxMTY4M2M5NThhYTA5ZCIsIm5iZiI6MTc5MjA1NDkwOS4zMTMsInN1YiI6IjZhZDA5NjdkYTZlZThkN2ZiYjdhNTI0MiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.QgZuiiY3XCoyIWwG9DWsNTrFoqyB94n_WD8mWpkE_BQ',
  BASE_URL: 'https://api.themoviedb.org/3',
  IMG_W500: 'https://image.tmdb.org/t/p/w500',
  IMG_ORIGINAL: 'https://image.tmdb.org/t/p/original',
  IMG_W1280: 'https://image.tmdb.org/t/p/w1280',
  LANG: 'id-ID'
};

// Genre Mapping TMDB
const GENRE_MAP = {
  28: 'Aksi', 12: 'Petualangan', 16: 'Anime/Animasi', 35: 'Komedi', 80: 'Kriminal',
  99: 'Dokumenter', 18: 'Drama', 10751: 'Keluarga', 14: 'Fantasi', 36: 'Sejarah',
  27: 'Horor', 10402: 'Musik', 9648: 'Misteri', 10749: 'Romansa', 878: 'Sci-Fi',
  10770: 'Film TV', 53: 'Thriller', 10752: 'Perang', 37: 'Western',
  10759: 'Aksi & Petualangan', 10762: 'Anak-anak', 10763: 'Berita', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasi', 10766: 'Sinetron', 10767: 'Talk', 10768: 'Perang & Politik'
};

const TmdbService = {
  // Common Fetch Helper
  async request(endpoint, params = {}) {
    try {
      const url = new URL(`${TMDB_CONFIG.BASE_URL}${endpoint}`);
      url.searchParams.set('api_key', TMDB_CONFIG.API_KEY);
      url.searchParams.set('language', TMDB_CONFIG.LANG);

      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null) {
          url.searchParams.set(k, params[k]);
        }
      });

      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${TMDB_CONFIG.READ_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`TMDB HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn("TmdbService request failed:", endpoint, err);
      return null;
    }
  },

  // Transform raw TMDB item into standardized SashimiLix movie object
  formatItem(item, forcedType = null) {
    if (!item) return null;
    const mediaType = forcedType || item.media_type || (item.title ? 'movie' : 'tv');
    const isMovie = mediaType === 'movie';

    const title = isMovie ? (item.title || item.original_title) : (item.name || item.original_name);
    const originalTitle = isMovie ? item.original_title : item.original_name;
    const releaseDate = isMovie ? item.release_date : item.first_air_date;
    const year = releaseDate ? new Date(releaseDate).getFullYear() : 2026;

    // Genres
    const genres = (item.genre_ids || [])
      .map(id => GENRE_MAP[id])
      .filter(Boolean);
    if (genres.length === 0) genres.push(isMovie ? 'Film' : 'Series');

    // Poster & Backdrop with fallbacks
    const poster = item.poster_path 
      ? `${TMDB_CONFIG.IMG_W500}${item.poster_path}`
      : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80';

    const banner = item.backdrop_path 
      ? `${TMDB_CONFIG.IMG_W1280}${item.backdrop_path}`
      : (item.poster_path ? `${TMDB_CONFIG.IMG_ORIGINAL}${item.poster_path}` : poster);

    // Badges
    let badge = 'POPULER';
    if (item.vote_average >= 8.2) badge = 'TOP RATING ★';
    else if (item.popularity > 200) badge = 'TRENDING 🔥';
    else if (genres.includes('Anime/Animasi')) badge = 'ANIME';

    return {
      id: item.id,
      tmdbId: item.id,
      mediaType: isMovie ? 'movie' : 'tv',
      type: isMovie ? 'movie' : (genres.includes('Anime/Animasi') ? 'anime' : 'series'),
      title: title || 'Tayangan SashimiLix',
      originalTitle: originalTitle || title,
      rating: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : 8.5,
      year: year,
      duration: isMovie ? 'Film HD' : 'Serial TV',
      quality: '4K UHD',
      badge: badge,
      isTrending: item.popularity > 100,
      genres: genres,
      poster: poster,
      banner: banner,
      synopsis: item.overview && item.overview.trim() !== '' 
        ? item.overview 
        : `Saksikan tayangan ${title} eksklusif di SashimiLix dengan streaming lancar, subtitle bahasa Indonesia, dan resolusi tinggi 4K.`,
      voteCount: item.vote_count || 100,
      episodes: []
    };
  },

  // 1. Trending Items (All)
  async getTrending() {
    const data = await this.request('/trending/all/day');
    if (data && data.results) {
      return data.results
        .filter(item => item.poster_path && !item.adult)
        .map(item => this.formatItem(item));
    }
    return [];
  },

  // 2. Anime & Japanese Animation
  async getPopularAnime() {
    const data = await this.request('/discover/tv', {
      with_genres: '16',
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      page: 1
    });
    if (data && data.results) {
      return data.results
        .filter(item => item.poster_path && !item.adult)
        .map(item => this.formatItem(item, 'tv'));
    }
    return [];
  },

  // 3. Box Office Movies
  async getPopularMovies() {
    const data = await this.request('/movie/popular', { page: 1 });
    if (data && data.results) {
      return data.results
        .filter(item => item.poster_path && !item.adult)
        .map(item => this.formatItem(item, 'movie'));
    }
    return [];
  },

  // 4. K-Drama & Top Series
  async getPopularSeries() {
    const data = await this.request('/discover/tv', {
      with_original_language: 'ko',
      sort_by: 'popularity.desc',
      page: 1
    });
    if (data && data.results) {
      return data.results
        .filter(item => item.poster_path && !item.adult)
        .map(item => this.formatItem(item, 'tv'));
    }
    return [];
  },

  // 5. Multi Search (Movies, TV Shows, Anime)
  async search(query) {
    if (!query || query.trim() === '') return [];
    const data = await this.request('/search/multi', {
      query: encodeURIComponent(query.trim()),
      page: 1
    });
    if (data && data.results) {
      return data.results
        .filter(item => item.poster_path && (item.media_type === 'movie' || item.media_type === 'tv') && !item.adult)
        .map(item => this.formatItem(item));
    }
    return [];
  },

  // 6. Fetch Full Item Details (Videos, Trailers, Cast)
  async getDetails(mediaType, tmdbId) {
    const endpoint = `/${mediaType}/${tmdbId}`;
    const data = await this.request(endpoint, {
      append_to_response: 'videos,credits'
    });
    return data;
  },

  // 7. Fetch TV Season Episodes
  async getSeasonEpisodes(tvId, seasonNumber = 1) {
    const data = await this.request(`/tv/${tvId}/season/${seasonNumber}`);
    if (data && data.episodes && data.episodes.length > 0) {
      return data.episodes.map(ep => ({
        ep: ep.episode_number,
        season: ep.season_number,
        title: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview,
        duration: ep.runtime ? `${ep.runtime}m` : '24m',
        thumbnail: ep.still_path ? `${TMDB_CONFIG.IMG_W500}${ep.still_path}` : null
      }));
    }
    // Fallback if season 1 is empty
    return [
      { ep: 1, season: 1, title: 'Episode 1', duration: '24m' },
      { ep: 2, season: 1, title: 'Episode 2', duration: '24m' },
      { ep: 3, season: 1, title: 'Episode 3', duration: '25m' }
    ];
  },

  // 8. Generate Multi-Server Streaming Embed URLs
  getStreamingEmbedUrl(serverType, mediaType, tmdbId, season = 1, episode = 1, trailerKey = null) {
    // If trailer requested
    if (serverType === 'trailer' && trailerKey) {
      return `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&modestbranding=1&rel=0&enablejsapi=1`;
    }

    const isMovie = mediaType === 'movie';
    const s = Math.max(1, parseInt(season, 10) || 1);
    const e = Math.max(1, parseInt(episode, 10) || 1);

    switch (serverType) {
      case 'vidsrc_su': // Server 1: VidSrc SU (Cepat, Stabil & HD)
      case 'vidsrc_net':
      case 'vidsrc_cc':
        return isMovie
          ? `https://vidsrc.su/embed/movie/${tmdbId}`
          : `https://vidsrc.su/embed/tv/${tmdbId}/${s}/${e}`;

      case '2embed': // Server 2: 2Embed Player (Lengkap Episode)
        return isMovie
          ? `https://www.2embed.cc/embed/${tmdbId}`
          : `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`;

      case 'multiembed': // Server 3: MultiEmbed VIP
      case 'superembed':
        return isMovie
          ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
          : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`;

      case 'vidsrc_rip': // Server 4: VidSrc RIP
      case 'vidsrc_to':
        return isMovie
          ? `https://vidsrc.rip/embed/movie/${tmdbId}`
          : `https://vidsrc.rip/embed/tv/${tmdbId}/${s}/${e}`;

      case 'vidlink': // Server 5: VidLink Pro
        return isMovie 
          ? `https://vidlink.pro/movie/${tmdbId}`
          : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}`;

      default:
        return isMovie
          ? `https://vidsrc.su/embed/movie/${tmdbId}`
          : `https://vidsrc.su/embed/tv/${tmdbId}/${s}/${e}`;
    }
  }
};
