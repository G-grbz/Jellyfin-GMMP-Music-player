import { createPlaylistModal, togglePlaylistModal } from "./playlistModal.js";
import { musicPlayerState, loadUserSettings, saveUserSettings } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { togglePlayPause, playPrevious, playNext, playTrack } from "../player/playback.js";
import { setupProgressControls } from "../player/progress.js";
import { toggleLyrics } from "../lyrics/lyrics.js";
import { toggleRepeatMode, toggleShuffle, toggleMute, toggleRemoveOnPlayMode } from "./controls.js";
import { refreshPlaylist } from "../core/playlist.js";
import { initSettings, isLocalStorageAvailable, updateConfig } from '../core/settings.js';
import { showJellyfinPlaylistsModal } from '../core/jellyfinPlaylists.js';
import { togglePlayerVisibility } from '../utils/mainIndex.js';
import { readID3Tags, arrayBufferToBase64 } from "../lyrics/id3Reader.js";
import { toggleArtistModal, setupArtistClickHandler, checkForNewMusic } from "./artistModal.js";
import { showGenreFilterModal } from "./genreFilterModal.js";
import { showTopTracksModal } from "./topModal.js";
import { getAuthToken } from "../core/auth.js";
import { showNotification } from "./notification.js";
import { loadCSS, isMobileDevice } from "../main.js";

const config = getConfig();
const DEFAULT_ARTWORK = "/web/GMMP/src/images/defaultArt.png";
const DEFAULT_ARTWORK_CSS = `url('${DEFAULT_ARTWORK}')`;

function createButton({ className, iconClass, title, onClick, id = "" }) {
  const btn = document.createElement("div");
  btn.className = `player-btn ${className || ""}`.trim();
  if (id) btn.id = id;
  btn.innerHTML = `<i class="${iconClass}"></i>`;
  btn.title = title;
  btn.onclick = onClick;
  return btn;
}

export function createModernPlayerUI() {
  const player = Object.assign(document.createElement("div"), {
    id: "modern-music-player",
    role: "region",
    ariaLabel: "Music Player",
    ariaHidden: "true"
  });

  if (isMobileDevice()) {
    player.classList.add('mobile-device');
  }

  const bgLayer = document.createElement("div");
  bgLayer.className = "player-bg-layer";
  player.appendChild(bgLayer);

  const nextTracksContainer = document.createElement("div");
  nextTracksContainer.className = "next-tracks-container";

  const nextTracksName = document.createElement("div");
  nextTracksName.className = "next-tracks-name hidden";
  nextTracksName.innerText = config.languageLabels.sirada || "Sıradaki Şarkı";

  const nextTracksList = document.createElement("div");
  nextTracksList.className = "next-tracks-list";

  nextTracksContainer.append(nextTracksName, nextTracksList);

  setTimeout(() => {
    nextTracksName.classList.remove('hidden');
  }, 4000);

  const topControlsContainer = document.createElement("div");
  topControlsContainer.className = "top-controls-container";

  const buttonsTop = [
    {
        className: "theme-toggle-btn",
        iconClass: config.playerTheme === 'light' ? "fas fa-moon" : "fas fa-sun",
        title: config.playerTheme === 'light' ? config.languageLabels.darkTheme || 'Karanlık Tema' : config.languageLabels.lightTheme || 'Aydınlık Tema',
        onClick: toggleTheme
    },
    { className: "playlist-btn", iconClass: "fas fa-list", title: config.languageLabels.playlist, onClick: togglePlaylistModal },
    { className: "jplaylist-btn", iconClass: "fas fa-list-music", title: config.languageLabels.jellyfinPlaylists || "Jellyfin Oynatma Listesi", onClick: showJellyfinPlaylistsModal },
    {
        className: "settingsLink",
        iconClass: "fas fa-cog",
        title: config.languageLabels.ayarlar || "Ayarlar",
        onClick: (e) => {
            e.preventDefault();
            const settings = initSettings();
            settings.open('music');
        }
    },
    { className: "kapat-btn", iconClass: "fas fa-times", title: config.languageLabels.close || "Close", onClick: togglePlayerVisibility },
];

  buttonsTop.forEach(btnInfo => {
    const div = document.createElement("div");
    div.className = btnInfo.className;
    div.innerHTML = `<i class="${btnInfo.iconClass}"></i>`;
    div.title = btnInfo.title;
    div.onclick = btnInfo.onClick;
    topControlsContainer.appendChild(div);
  });

  const albumArt = document.createElement("div");
  albumArt.id = "player-album-art";

  const favoriteBtn = document.createElement("div");
  favoriteBtn.className = "musicfavorite-btn hidden";
  favoriteBtn.innerHTML = '<i class="fas fa-heart"></i>';
  favoriteBtn.title = config.languageLabels.addToFavorites || "Favorilere ekle";
  favoriteBtn.onclick = (e) => {
    e.stopPropagation();
    toggleFavorite();
  };

  const albumArtContainer = document.createElement("div");
  albumArtContainer.className = "album-art-container";
  albumArtContainer.append(albumArt, favoriteBtn);
  albumArtContainer.addEventListener("mouseenter", () => {
    const currentTrack = musicPlayerState.playlist?.[musicPlayerState.currentIndex];
    if (currentTrack) {
      favoriteBtn.classList.remove("hidden");
    }
  });

  albumArtContainer.addEventListener("mouseleave", () => {
    favoriteBtn.classList.add("hidden");
  });

  albumArtContainer.addEventListener("click", () => {
    const currentTrack = musicPlayerState.playlist?.[musicPlayerState.currentIndex];
    if (!currentTrack) return;

    const artistName = currentTrack.Artists?.join(", ") ||
                     currentTrack.AlbumArtist ||
                     config.languageLabels.unknownArtist;

    const artistId = currentTrack.ArtistItems?.[0]?.Id ||
                   currentTrack.AlbumArtistId ||
                   currentTrack.ArtistId ||
                   null;

    toggleArtistModal(true, artistName, artistId);
  });

  albumArtContainer.addEventListener("mouseleave", () => {
    favoriteBtn.classList.add("hidden");
  });

  const trackInfo = document.createElement("div");
  trackInfo.className = "player-track-info";

  const titleContainer = document.createElement("div");
  titleContainer.id = "player-track-title";
  titleContainer.className = "marquee-container";

  const titleText = document.createElement("div");
  titleText.className = "marquee-text";
  titleText.textContent = config.languageLabels.noSongSelected;
  titleContainer.appendChild(titleText);

  const observer = new MutationObserver(() => {
    checkMarqueeNeeded(titleText);
  });

  observer.observe(titleText, {
    childList: true,
    characterData: true,
    subtree: true
  });


  window.addEventListener('resize', () => {
    checkMarqueeNeeded(titleText);
  });

setTimeout(() => {
  checkMarqueeNeeded(titleText);
}, 100);

  const artist = document.createElement("div");
  artist.id = "player-track-artist";
  artist.textContent = config.languageLabels.artistUnknown;
  artist.onclick = () => toggleArtistModal(true, config.languageLabels.artistUnknown, null);

  const topTracksBtn = createButton({
  className: "top-tracks-btn",
  iconClass: "fas fa-chart-line",
  title: config.languageLabels.myMusic || "En Çok Dinlenenler",
  onClick: () => {
  showTopTracksModal();
},
});

  trackInfo.append(titleContainer, artist);

  const repeatBtn = createButton({ iconClass: "fas fa-repeat", title: config.languageLabels.repeatModOff, onClick: toggleRepeatMode });
  const shuffleBtn = createButton({ iconClass: "fas fa-random", title: `${config.languageLabels.shuffle}: ${config.languageLabels.shuffleOff}`, onClick: toggleShuffle });
  const removeOnPlayBtn = createButton({
   className: "remove-on-play-btn",
   iconClass: "fas fa-trash-list",
   title: musicPlayerState.userSettings.removeOnPlay
     ? config.languageLabels.removeOnPlayOn || "Çaldıktan sonra sil: Açık"
     : config.languageLabels.removeOnPlayOff || "Çaldıktan sonra sil: Kapalı",
   onClick: toggleRemoveOnPlayMode
 });

 if (musicPlayerState.userSettings.removeOnPlay) {
   removeOnPlayBtn.innerHTML = '<i class="fas fa-trash-list" style="color:#e91e63"></i>';
 }
  const refreshBtn = createButton({ iconClass: "fas fa-sync-alt", title: config.languageLabels.refreshPlaylist, onClick: refreshPlaylist });

  const genreFilterBtn = createButton({
  className: "genre-filter-btn",
  iconClass: "fas fa-filter",
  title: config.languageLabels.filterByGenre || "Türe göre filtrele",
  onClick: showGenreFilterModal
  });
  const prevBtn = createButton({ iconClass: "fas fa-step-backward", title: config.languageLabels.previousTrack, onClick: playPrevious });
  const playPauseBtn = createButton({ className: "main", iconClass: "fas fa-play", title: config.languageLabels.playPause, onClick: togglePlayPause, id: "play-pause-btn" });
  const nextBtn = createButton({ iconClass: "fas fa-step-forward", title: config.languageLabels.nextTrack, onClick: playNext });
  const lyricsBtn = createButton({
  iconClass: "fas fa-align-left",
  title: config.languageLabels.lyrics,
  onClick: () => {
    toggleLyrics();
    musicPlayerState.lyricsDelay = parseFloat(localStorage.getItem("lyricsDelay")) || 0;
  }
});
  const volumeBtn = createButton({ iconClass: "fas fa-volume-up", title: config.languageLabels.volume, onClick: toggleMute });

  const volumeSlider = Object.assign(document.createElement("input"), {
    type: "range",
    className: "player-volume-slider",
    min: "0",
    max: "1",
    step: "0.01",
    value: "1",
    title: config.languageLabels.volumeLevel,
  });

  volumeSlider.addEventListener('input', e => {
    const volume = parseFloat(e.target.value);
    const audio = musicPlayerState.audio;
    audio.volume = volume;
    audio.muted = false;
    musicPlayerState.userSettings.volume = volume;
    updateVolumeIcon(volume);
    saveUserSettings();
  });

  function updateVolumeIcon(volume) {
    let icon;
    if (volume === 0) icon = "fas fa-volume-mute";
    else if (volume < 0.5) icon = "fas fa-volume-down";
    else icon = "fas fa-volume-up";
    volumeBtn.innerHTML = `<i class="${icon}"></i>`;
  }

  const controls = document.createElement("div");
  controls.className = "player-controls";

  const controlElements = [
    prevBtn, playPauseBtn, nextBtn, repeatBtn, shuffleBtn,
    removeOnPlayBtn, lyricsBtn, refreshBtn, genreFilterBtn,
    topTracksBtn, volumeBtn, createButton({
        className: "fullscreen-btn",
        iconClass: "fa-solid fa-maximize",
        title: config.languageLabels.fullscreen || "Tam Ekran",
        onClick: toggleFullscreenMode
    }),
    createButton({
        className: "style-toggle-btn",
        iconClass: "fa-solid fa-up-down",
        title: config.playerStyle === 'player' ? config.languageLabels.dikeyStil || 'Dikey Stil' : config.languageLabels.yatayStil || 'Yatay Stil',
        onClick: togglePlayerStyle
    }),
];

window.addEventListener('load', initializeFullscreen);
document.addEventListener('DOMContentLoaded', initializeFullscreen);

  controlElements.forEach(btn => controls.appendChild(btn));
  controls.appendChild(volumeSlider);

  const progressContainer = document.createElement("div");
  progressContainer.className = "player-progress-container";

  const progressBar = document.createElement("div");
  progressBar.className = "player-progress-bar";

  const progress = document.createElement("div");
  progress.className = "player-progress";

  const progressHandle = document.createElement("div");
  progressHandle.className = "player-progress-handle";

  const timeContainer = document.createElement("div");
  timeContainer.className = "player-time-container";

  const currentTimeEl = document.createElement("span");
  currentTimeEl.className = "player-current-time";
  currentTimeEl.textContent = "0:00";

  const durationEl = document.createElement("span");
  durationEl.className = "player-duration";
  durationEl.textContent = "0:00";

  progressBar.append(progress, progressHandle);
  timeContainer.append(currentTimeEl, durationEl);
  progressContainer.append(progressBar, timeContainer);

  timeContainer.addEventListener("click", () => {
    musicPlayerState.showRemaining = !musicPlayerState.showRemaining;
    setupProgressControls();
  });

  const lyricsContainer = document.createElement("div");
  lyricsContainer.id = "player-lyrics-container";
  lyricsContainer.className = "lyrics-hidden";

  player.append(lyricsContainer, topControlsContainer, albumArtContainer, nextTracksContainer, trackInfo, progressContainer, controls);
  document.body.appendChild(player);
  createPlaylistModal();

  Object.assign(musicPlayerState, {
    modernPlayer: player,
    albumArtEl: albumArt,
    modernTitleEl: titleText,
    modernArtistEl: artist,
    progressBar,
    favoriteBtn,
    progress,
    progressHandle,
    playPauseBtn,
    progressContainer,
    currentTimeEl,
    durationEl,
    lyricsContainer,
    lyricsBtn,
    volumeBtn,
    volumeSlider,
    nextTracksContainer,
    nextTracksList,
  });

  musicPlayerState.audio.volume = musicPlayerState.userSettings.volume || 0.7;
  setupProgressControls();
  loadUserSettings();
  setupArtistClickHandler();
  updatePlayerBackground();
  initializeFullscreen();
  initializePlayerStyle();

  return { player, albumArt, title: titleContainer, artist, progressBar, progress, playPauseBtn, progressContainer, currentTimeEl, durationEl, volumeSlider, lyricsContainer, lyricsBtn };
}

export async function updateNextTracks() {
  const {
    playlist,
    currentIndex,
    userSettings,
    nextTracksContainer,
    id3ImageCache = {},
    effectivePlaylist
  } = musicPlayerState;

  if (!nextTracksContainer || !playlist) return;
  nextTracksContainer.innerHTML = '';

  const playlistLength = playlist.length;
  if (playlistLength <= 1) {
    return;
  }

  if (!musicPlayerState.playedHistory ||
      musicPlayerState.lastShuffleState !== userSettings.shuffle ||
      musicPlayerState.lastCurrentIndex !== currentIndex) {
    musicPlayerState.playedHistory = [currentIndex];
    musicPlayerState.lastShuffleState = userSettings.shuffle;
    musicPlayerState.lastCurrentIndex = currentIndex;
  }

  const nextTracksList = document.createElement('div');
  nextTracksList.className = 'next-tracks-list';
  musicPlayerState.nextTracksList = nextTracksList;

  const nextTracksName = document.createElement('div');
  nextTracksName.className = 'next-tracks-name hidden';
  nextTracksName.textContent = userSettings.shuffle
    ? config.languageLabels.rastgele || "Rastgele"
    : config.languageLabels.sirada || "Sıradakiler";

  const maxNextTracks = Math.min(
    config.nextTrack,
    (config.muziklimit ? config.muziklimit - 1 : config.nextTrack)
  );

  const nextIndices = [];

  if (userSettings.shuffle) {
    const playedSet = new Set(musicPlayerState.playedHistory);
    if (!playedSet.has(currentIndex)) {
      playedSet.add(currentIndex);
    }

    if (playedSet.size >= playlistLength) {
      playedSet.clear();
      playedSet.add(currentIndex);
    }

    const selectedSet = new Set();
    while (selectedSet.size < maxNextTracks && selectedSet.size < playlistLength - 1) {
      const randIdx = Math.floor(Math.random() * playlistLength);
      if (randIdx !== currentIndex && !playedSet.has(randIdx)) {
        selectedSet.add(randIdx);
      }
    }

    nextIndices.push(...selectedSet);

    if (nextIndices.length < maxNextTracks) {
      for (let i = 0; i < playlistLength && nextIndices.length < maxNextTracks; i++) {
        if (i !== currentIndex && !nextIndices.includes(i)) {
          nextIndices.push(i);
        }
      }
    }

    musicPlayerState.playedHistory.push(...nextIndices);
    musicPlayerState.playedHistory = Array.from(new Set(musicPlayerState.playedHistory));
    if (musicPlayerState.playedHistory.length > playlistLength * 2) {
      musicPlayerState.playedHistory = musicPlayerState.playedHistory.slice(-playlistLength);
    }

  } else {
    let idx = currentIndex;
    let attempts = 0;
    const maxAttempts = playlistLength * 2;

    while (nextIndices.length < maxNextTracks && attempts < maxAttempts) {
      idx = (idx + 1) % playlistLength;
      if (!musicPlayerState.playedHistory.includes(idx)) {
        nextIndices.push(idx);
        musicPlayerState.playedHistory.push(idx);
      }
      attempts++;
      if (attempts >= playlistLength && nextIndices.length === 0) {
        musicPlayerState.playedHistory = [currentIndex];
        idx = currentIndex;
        attempts = 0;
      }
    }
  }

  musicPlayerState.lastCurrentIndex = currentIndex;

  const trackElements = nextIndices.map((nextIndex) => {
    const track = playlist[nextIndex];
    if (!track) return null;

    const trackElement = document.createElement('div');
    trackElement.className = 'next-track-item hidden';
    trackElement.dataset.trackId = track.Id;
    trackElement.dataset.trackIndex = nextIndex;
    trackElement.dataset.loaded = "false";
    trackElement.title = track.Name || config.languageLabels.unknownTrack;

    const coverElement = document.createElement('div');
    coverElement.className = 'next-track-cover';
    coverElement.style.backgroundImage = DEFAULT_ARTWORK_CSS;
    coverElement.onclick = () => playTrack(nextIndex);

    const titleElement = document.createElement('div');
    titleElement.className = 'next-track-title';
    titleElement.textContent = track.Name || config.languageLabels.unknownTrack;
    titleElement.onclick = () => playTrack(nextIndex);

    trackElement.append(coverElement, titleElement);
    nextTracksList.appendChild(trackElement);

    return { nextIndex, track, trackElement, coverElement };
  }).filter(Boolean);

  const MAX_CONCURRENT_READS = config.id3limit;
  let loadedCount = 0;

  const loadNextBatch = () => {
    const batch = trackElements.slice(loadedCount, loadedCount + MAX_CONCURRENT_READS);
    batch.forEach(({ trackElement }) => {
      trackElement.classList.remove('hidden');
      trackElement.classList.add('visible');
      observer.observe(trackElement);
    });
    loadedCount += batch.length;

    if (loadedCount >= trackElements.length) {
      sentinelObserver.unobserve(sentinel);
    }
  };

  const observer = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const el = entry.target;
      if (el.dataset.loaded === "true") continue;

      const nextIndex = parseInt(el.dataset.trackIndex, 10);
      const { track, coverElement } = trackElements.find(te => te.nextIndex === nextIndex) || {};
      if (!track || !coverElement) continue;

      try {
        const imageUri = await getTrackImage(track, id3ImageCache);
        if (imageUri) {
          coverElement.style.backgroundImage = `url('${imageUri}')`;
        }
        el.dataset.loaded = "true";
        observer.unobserve(el);
      } catch (err) {
        console.error(`Track #${nextIndex} resmi yüklenirken hata:`, err);
      }
    }
  }, {
    root: nextTracksList,
    threshold: 0.1
  });

  const sentinel = document.createElement('div');
  sentinel.className = 'next-track-sentinel';
  nextTracksList.appendChild(sentinel);

  const sentinelObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadNextBatch();
    }
  }, {
    root: nextTracksList,
    threshold: 1.0
  });

  sentinelObserver.observe(sentinel);
  loadNextBatch();

  trackElements.forEach(({ trackElement }, idx) => {
    setTimeout(() => {
      trackElement.classList.remove('hidden');
      trackElement.classList.add('visible');
      observer.observe(trackElement);
    }, (idx + 1) * 50);
  });

  const scrollLeftBtn = document.createElement('div');
  scrollLeftBtn.className = 'track-scroll-btn track-scroll-left';
  const leftIcon = document.createElement('i');
  leftIcon.className = 'fas fa-chevron-left';
  scrollLeftBtn.appendChild(leftIcon);

  const scrollRightBtn = document.createElement('div');
  scrollRightBtn.className = 'track-scroll-btn track-scroll-right';
  const rightIcon = document.createElement('i');
  rightIcon.className = 'fas fa-chevron-right';
  scrollRightBtn.appendChild(rightIcon);

  const wrapper = document.createElement('div');
  wrapper.className = 'next-tracks-wrapper';
  wrapper.appendChild(nextTracksList);

  let scrollIndex = 0;
  const visibleCount = 4;
  const itemWidth = 75;

  const updateScroll = () => {
    nextTracksList.style.transform = `translateX(-${scrollIndex * itemWidth}px)`;
  };

  scrollLeftBtn.onclick = () => {
    scrollIndex = Math.max(0, scrollIndex - visibleCount);
    updateScroll();
  };
  scrollRightBtn.onclick = () => {
    scrollIndex = Math.min(trackElements.length - visibleCount, scrollIndex + visibleCount);
    updateScroll();
  };

  const addedCount = trackElements.length;
  if (addedCount > visibleCount) {
    nextTracksContainer.append(nextTracksName, scrollLeftBtn, wrapper, scrollRightBtn);
  } else {
    nextTracksContainer.append(wrapper, nextTracksName);
  }

  if (addedCount > 0) {
    setTimeout(() => {
      nextTracksName.classList.remove('hidden');
      nextTracksName.classList.add('visible');
    }, (addedCount + 1) * 50);
  }

  musicPlayerState.id3ImageCache = id3ImageCache;
}

async function getTrackImage(track, cache) {
  const trackId = track.Id;
  if (cache[trackId]) return cache[trackId];

  try {
    const tags = await readID3Tags(trackId);

    if (tags?.pictureUri) {
      cache[trackId] = tags.pictureUri;
      return tags.pictureUri;
    }
  } catch (e) {
    console.warn(`ID3 etiketi okunamadı (ID: ${trackId})`, e);
  }
  const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
  const imageId = track.AlbumId || trackId;
  if (imageTag) {
    return `/Items/${imageId}/Images/Primary?fillHeight=100&fillWidth=100&quality=99&tag=${imageTag}`;
  }

  return null;
}

async function toggleFavorite() {
  const { playlist, currentIndex, favoriteBtn } = musicPlayerState;
  const track = playlist?.[currentIndex];
  if (!track?.Id) return;

  try {
    const authToken = getAuthToken();
    if (!authToken) {
      showNotification(
        `<i class="fas fa-exclamation-circle"></i> ${config.languageLabels.authRequired || "Kimlik doğrulama hatası"}`,
        3000,
        'error'
      );
      return;
    }

    const isFavorite = track.UserData?.IsFavorite || false;
    const url = `/Users/${window.ApiClient.getCurrentUserId()}/FavoriteItems/${track.Id}`;
    const method = isFavorite ? "DELETE" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        "X-Emby-Token": authToken,
        "Content-Type": "application/json"
      }
    });

    if (response.ok) {
      track.UserData = track.UserData || {};
      track.UserData.IsFavorite = !isFavorite;

      if (favoriteBtn) {
        favoriteBtn.innerHTML = track.UserData.IsFavorite
          ? '<i class="fas fa-heart" style="color:#e91e63"></i>'
          : '<i class="fas fa-heart"></i>';
        favoriteBtn.title = track.UserData.IsFavorite
          ? config.languageLabels.removeFromFavorites || "Favorilerden kaldır"
          : config.languageLabels.addToFavorites || "Favorilere ekle";
      }

      showNotification(
        `<i class="fas fa-heart"></i> ${track.UserData.IsFavorite
          ? config.languageLabels.addedToFavorites || "Favorilere eklendi"
          : config.languageLabels.removedFromFavorites || "Favorilerden kaldırıldı"}`,
        2000,
        'kontrol'
      );
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("Favori işlemi hatası:", error);
    showNotification(
      `<i class="fas fa-exclamation-circle"></i> ${
        config.languageLabels.favoriteError || "Favori işlemi sırasında hata"
      }`,
      3000,
      'error'
    );
  }
}

export function checkMarqueeNeeded(element) {
  if (!element || !element.parentElement) return;

  const container = element.parentElement;
  const textWidth = element.scrollWidth;
  const containerWidth = container.offsetWidth;

  container.style.setProperty('--container-width', `${containerWidth}px`);

  element.style.removeProperty('animation');
  element.classList.remove('marquee-active');

  requestAnimationFrame(() => {
    if (textWidth > containerWidth) {
      element.classList.add('marquee-active');
    } else {
      element.classList.remove('marquee-active');
      element.style.transform = 'none';
    }
  });
}

function toggleTheme() {
    const config = getConfig();
    const newTheme = config.playerTheme === 'light' ? 'dark' : 'light';
    const updatedConfig = {
        ...config,
        playerTheme: newTheme
    };
    updateConfig(updatedConfig);
    const themeBtn = document.querySelector('.theme-toggle-btn');
    if (themeBtn) {
        themeBtn.innerHTML = `<i class="fas fa-${newTheme === 'light' ? 'moon' : 'sun'}"></i>`;
        themeBtn.title = newTheme === 'light' ? config.languageLabels.darkTheme || 'Karanlık Tema' : config.languageLabels.lightTheme || 'Aydınlık Tema';
    }
    loadCSS();

    showNotification(
        `<i class="fas fa-${newTheme === 'light' ? 'sun' : 'moon'}"></i> ${newTheme === 'light' ? config.languageLabels.lightThemeEnabled || 'Aydınlık tema etkin' : config.languageLabels.darkThemeEnabled || 'Karanlık tema etkin'}`,
        2000,
        'info'
    );
}

function togglePlayerStyle() {
    const config = getConfig();
    const newStyle = config.playerStyle === 'player' ? 'newplayer' : 'player';
    const iconName = newStyle === 'player' ? 'up-down' : 'left-right';
    const notifcationName = newStyle === 'player' ? 'left-right' : 'up-down';
    const updatedConfig = {
        ...config,
        playerStyle: newStyle
    };

    updateConfig(updatedConfig);

    const styleBtn = document.querySelector('.style-toggle-btn');
    if (styleBtn) {
        styleBtn.innerHTML = `<i class="fas fa-${iconName}"></i>`;
        styleBtn.title = newStyle === 'player'
            ? config.languageLabels.dikeyStil || 'Dikey Stil'
            : config.languageLabels.yatayStil || 'Yatay Stil';
    }

    loadCSS();
    showNotification(
        `<i class="fas fa-${notifcationName}"></i> ${
            newStyle === 'player'
                ? config.languageLabels.yatayStilEnabled || 'Yatay stil etkin'
                : config.languageLabels.dikeyStilEnabled || 'Dikey stil etkin'
        }`,
        2000,
        'info'
    );
}

export function updatePlayerBackground() {
  const config = getConfig();
  const bgLayer = document.querySelector('#modern-music-player .player-bg-layer');
  const track = musicPlayerState.playlist?.[musicPlayerState.currentIndex];

  let bgUrl = DEFAULT_ARTWORK;

  if (track) {
    const tag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
    const id = track.AlbumId || track.Id;
    if (tag && id) {
      bgUrl = `/Items/${id}/Images/Primary?fillHeight=1000&fillWidth=1000&quality=96&tag=${tag}`;
    }
  }

  if (config.useAlbumArtAsBackground) {
    const img = new Image();
    img.onload = () => {
      bgLayer.style.backgroundImage = `url('${bgUrl}')`;
      bgLayer.style.opacity = config.albumArtBackgroundOpacity;
      bgLayer.style.filter = `blur(${config.albumArtBackgroundBlur}px)`;
      bgLayer.style.display = 'block';
    };
    img.onerror = () => {
      bgLayer.style.backgroundImage = DEFAULT_ARTWORK_CSS;
      bgLayer.style.opacity = config.albumArtBackgroundOpacity;
      bgLayer.style.filter = `blur(${config.albumArtBackgroundBlur}px)`;
      bgLayer.style.display = 'block';
    };
    img.src = bgUrl;
  } else {
    bgLayer.style.backgroundImage = 'none';
    bgLayer.style.opacity = '';
    bgLayer.style.filter = '';
  }
}

export async function updateAlbumArt(artUrl) {
  return new Promise((resolve) => {
    const albumArtEl = musicPlayerState.albumArtEl;
    if (!albumArtEl) return resolve();

    const url = artUrl ? `url('${artUrl}')` : DEFAULT_ARTWORK_CSS;
    const img = new Image();
    img.onload = () => {
      albumArtEl.style.backgroundImage = url;
      resolve();
    };
    img.onerror = () => {
      albumArtEl.style.backgroundImage = DEFAULT_ARTWORK_CSS;
      resolve();
    };
    img.src = artUrl || DEFAULT_ARTWORK;
  });
}

function toggleFullscreenMode() {
    const config = getConfig();
    const newMode = !config.fullscreenMode;
    localStorage.setItem('fullscreenMode', newMode);

    const updatedConfig = {
        ...config,
        fullscreenMode: newMode
    };

    updateConfig(updatedConfig);
    loadCSS();

    const player = document.getElementById('modern-music-player');
    if (player) {
        if (newMode) {
            player.classList.add('fullscreen-mode');
            document.body.style.overflow = 'hidden';
        } else {
            player.classList.remove('fullscreen-mode');
            document.body.style.overflow = '';
        }
    }

    const fullscreenBtn = document.querySelector('.fullscreen-btn i');
    if (fullscreenBtn) {
        fullscreenBtn.className = newMode
            ? 'fa-solid fa-minimize'
            : 'fa-solid fa-maximize';
    }

    showNotification(
        `<i class="fa-solid fa-${newMode ? 'maximize' : 'minimize'}"></i> ${
            newMode
                ? config.languageLabels.fullscreenEnabled || 'Tam ekran modu etkin'
                : config.languageLabels.fullscreenDisabled || 'Tam ekran modu devre dışı'
        }`,
        2000,
        'info'
    );
}

function initializePlayerStyle() {
    const config = getConfig();
    const player = document.getElementById('modern-music-player');
    const styleToggleBtn = document.querySelector('.style-toggle-btn i');

    if (!player || !styleToggleBtn) return;

    if (config.playerStyle === 'newplayer') {
        player.classList.add('style-toggle');
        styleToggleBtn.className = 'fas fa-left-right';
        styleToggleBtn.title = config.languageLabels.dikeyStil || 'Dikey Stil';
    } else {
        player.classList.remove('style-toggle');
        styleToggleBtn.className = 'fas fa-up-down';
        styleToggleBtn.title = config.languageLabels.yatayStil || 'Yatay Stil';
    }
}

function initializeFullscreen() {
    const config = getConfig();
    const player = document.getElementById('modern-music-player');
    const fullscreenBtn = document.querySelector('.fullscreen-btn i');

    if (config.fullscreenMode) {
        player?.classList.add('fullscreen-mode');
        document.body.style.overflow = 'hidden';
        if (fullscreenBtn) {
            fullscreenBtn.className = 'fa-solid fa-minimize';
        }
    } else {
        player?.classList.remove('fullscreen-mode');
        document.body.style.overflow = '';
        if (fullscreenBtn) {
            fullscreenBtn.className = 'fa-solid fa-maximize';
        }
    }
}
