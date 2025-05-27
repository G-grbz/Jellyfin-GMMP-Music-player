import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { getAuthToken } from "../core/auth.js";
import { updateMediaMetadata, initMediaSession, updatePositionState } from "../core/mediaSession.js";
import { getFromOfflineCache, cacheForOffline } from "../core/offlineCache.js";
import { readID3Tags, arrayBufferToBase64 } from "../lyrics/id3Reader.js";
import { fetchLyrics, updateSyncedLyrics, startLyricsSync } from "../lyrics/lyrics.js";
import { updatePlaylistModal } from "../ui/playlistModal.js";
import { showNotification } from "../ui/notification.js";
import { updateProgress, updateDuration, setupAudioListeners } from "./progress.js";
import { updateNextTracks } from "../ui/playerUI.js";
import { refreshPlaylist } from "../core/playlist.js";

const config = getConfig();
const SEEK_RETRY_DELAY = 0;
const DEFAULT_ARTWORK = "url('/web/GMMP/src/images/defaultArt.png')";

let currentCanPlayHandler = null;
let currentPlayErrorHandler = null;

const updatePlaybackUI = (isPlaying) => {
  if (musicPlayerState.playPauseBtn) {
    musicPlayerState.playPauseBtn.innerHTML = isPlaying
      ? '<i class="fas fa-pause"></i>'
      : '<i class="fas fa-play"></i>';
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }
};

const handlePlaybackError = (error, action = 'play') => {
  console.error(`Oynatma sırasında hata oluştu ${action}:`, error);
  showNotification(
  `<i class="fas fa-exclamation-circle"></i> ${config.languageLabels.playbackError || "Oynatma Hatası"}`,
  3000,
  'error'
);
  setTimeout(playNext, SEEK_RETRY_DELAY);
};

function handleCanPlay() {
  musicPlayerState.audio.play()
    .then(() => updatePlaybackUI(true))
    .catch(err => handlePlaybackError(err, 'canplay'));
}

function handlePlayError() {
  console.error("Şarkı yükleme hatası:", musicPlayerState.audio.src);
  setTimeout(playNext, SEEK_RETRY_DELAY);
}

function cleanupAudioListeners() {
  const audio = musicPlayerState.audio;
  if (!audio) return;

  audio.pause();
  audio.removeEventListener('canplay', handleCanPlay);
  audio.removeEventListener('error', handlePlayError);
  audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  audio.src = '';
  audio.removeAttribute('src');
  audio.load();
  audio.onended = null;
}

function handleSongEnd() {
  const { userSettings, playlist, audio } = musicPlayerState;
  const currentTrack = playlist[musicPlayerState.currentIndex];
  if (currentTrack) {
    reportPlaybackStopped(
      currentTrack,
      convertSecondsToTicks(audio.currentTime)
    );
  }

  if (playlist.length === 0) {
    updatePlaybackUI(false);
    showNotification(
      config.languageLabels.playlistEnded || "Oynatma listesi bitti, yenileniyor...",
      2000,
      'info'
    );
    return setTimeout(() => refreshPlaylist(), 500);
  }

  switch (userSettings.repeatMode) {
    case 'one':
      musicPlayerState.audio.currentTime = 0;
      musicPlayerState.audio.play()
        .then(() => updatePlaybackUI(true))
        .catch(err => handlePlaybackError(err, 'repeat'));
      break;

    case 'all':
      if (userSettings.removeOnPlay) {
        playNext();
      } else {
        const nextIndex = (musicPlayerState.currentIndex + 1) % playlist.length;
        playTrack(nextIndex);
      }
      break;

    default:
      playNext();
  }
}

export function togglePlayPause() {
  const { audio } = musicPlayerState;

  if (!audio) {
    console.warn('Ses okunamadı');
    return;
  }

  if (audio.paused) {
    audio.play()
      .then(() => {
        updatePlaybackUI(true);
        const currentTrack = musicPlayerState.playlist[musicPlayerState.currentIndex];
        if (currentTrack) {
          reportPlaybackStart(currentTrack);
        }
      })
      .catch(error => handlePlaybackError(error));
  } else {
    audio.pause();
    updatePlaybackUI(false);
    const currentTrack = musicPlayerState.playlist[musicPlayerState.currentIndex];
    if (currentTrack) {
      reportPlaybackStopped(
        currentTrack,
        convertSecondsToTicks(audio.currentTime)
      );
    }
  }
}

export function playPrevious() {
  const { playlist, effectivePlaylist, userSettings, audio } = musicPlayerState;
  const currentIndex = musicPlayerState.currentIndex;

  if (playlist.length === 0) {
    updatePlaybackUI(false);
    showNotification(
      config.languageLabels.playlistEnded || "Oynatma listesi bitti, yenileniyor...",
      2000,
      'info'
    );
    return refreshPlaylist();
  }

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    showNotification(
  `<i class="fas fa-music" style="margin-right: 8px;"></i>${config.languageLabels.simdioynat}: ${musicPlayerState.currentTrackName}`,
  2000,
  'kontrol'
);
    return;
  }

  if (userSettings.removeOnPlay) {
    const removed = playlist.splice(currentIndex, 1);
    const effIdx = effectivePlaylist.findIndex(t => t.Id === removed[0]?.Id);
    if (effIdx > -1) effectivePlaylist.splice(effIdx, 1);
    updatePlaylistModal();

    if (playlist.length === 0) {
      updatePlaybackUI(false);
      showNotification(
        config.languageLabels.playlistEnded || "Oynatma listesi bitti, yenileniyor...",
        2000,
        'info'
      );
      return refreshPlaylist();
    }

    musicPlayerState.currentIndex = Math.min(currentIndex, playlist.length - 1);
  }

  let prevIndex = musicPlayerState.currentIndex - 1;
  if (prevIndex < 0) prevIndex = playlist.length - 1;

  playTrack(prevIndex);
}

export function playNext() {
  const { playlist, effectivePlaylist, userSettings, currentIndex } = musicPlayerState;

  if (playlist.length === 0) {
    updatePlaybackUI(false);
    showNotification(
      config.languageLabels.playlistEnded || "Oynatma listesi bitti, yenileniyor...",
      2000,
      'info'
    );
    return refreshPlaylist();
  }

  if (userSettings.removeOnPlay && currentIndex >= 0 && currentIndex < playlist.length) {
    const currentTrackId = musicPlayerState.currentTrackId;
    playlist.splice(currentIndex, 1);
    const effIdx = effectivePlaylist.findIndex(t => t.Id === currentTrackId);
    if (effIdx > -1) effectivePlaylist.splice(effIdx, 1);
    updatePlaylistModal();

    if (playlist.length === 0) {
      updatePlaybackUI(false);
      showNotification(
        config.languageLabels.playlistEnded || "Oynatma listesi bitti, yenileniyor...",
        2000,
        'info'
      );
      return refreshPlaylist();
    }

    if (userSettings.shuffle) {
      const nextIndex = Math.floor(Math.random() * playlist.length);
      return playTrack(nextIndex);
    } else {
      const newIndex = currentIndex >= playlist.length ? 0 : currentIndex;
      return playTrack(newIndex);
    }
  }

  let nextIndex;
  if (userSettings.shuffle) {
    let rnd;
    do {
      rnd = Math.floor(Math.random() * effectivePlaylist.length);
    } while (rnd === currentIndex && effectivePlaylist.length > 1);
    nextIndex = rnd;
  } else {
    if (userSettings.repeatMode === 'all') {
      nextIndex = (currentIndex + 1) % effectivePlaylist.length;
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= effectivePlaylist.length) {
        updatePlaybackUI(false);
        return;
      }
    }
  }

  playTrack(nextIndex);
}

export async function updateModernTrackInfo(track) {
  if (!track) {
    resetTrackInfo();
    return;
  }

  const title = track.Name || config.languageLabels.unknownTrack;
  const artists = track.Artists || (track.ArtistItems?.map(a => a.Name) || []) || (track.artist ? [track.artist] : []) || [config.languageLabels.unknownArtist];

  musicPlayerState.modernTitleEl.textContent = title;
  musicPlayerState.modernArtistEl.textContent = artists.join(", ");

  await Promise.all([
    loadAlbumArt(track),
    updateTrackMeta(track)
  ]);

  updateMediaMetadata(track);
}

function resetTrackInfo() {
  musicPlayerState.modernTitleEl.textContent = config.languageLabels.unknownTrack;
  musicPlayerState.modernArtistEl.textContent = config.languageLabels.unknownArtist;
  setAlbumArt(DEFAULT_ARTWORK);
}

async function updateTrackMeta(track) {
  if (!musicPlayerState.metaWrapper) {
    createMetaWrapper();
  }

  if (!musicPlayerState.metaContainer) {
    musicPlayerState.metaContainer = document.createElement("div");
    musicPlayerState.metaContainer.className = "player-meta-container";
    musicPlayerState.metaWrapper.appendChild(musicPlayerState.metaContainer);
  }

  musicPlayerState.metaContainer.innerHTML = '';

  const metaItems = [
    { condition: track?.Album, className: 'album', icon: 'fas fa-compact-disc', text: track.Album },
    { condition: track?.IndexNumber, className: 'track-number', icon: 'fas fa-list-ol', text: track.IndexNumber },
    { condition: track?.ProductionYear, className: 'year', icon: 'fas fa-calendar-alt', text: track.ProductionYear }
  ];

  metaItems.forEach(item => {
    if (item.condition) {
      addMetaItem(item.className, item.icon, item.text);
    }
  });

  const tags = await readID3Tags(track.Id);
  if (tags?.genre) {
    addMetaItem('genre', 'fas fa-music', tags.genre);
  }
}

function setAlbumArt(imageUrl) {
  if (!musicPlayerState.albumArtEl) return;
  if (!imageUrl || imageUrl === 'undefined') {
    musicPlayerState.albumArtEl.style.backgroundImage = DEFAULT_ARTWORK;
    musicPlayerState.currentArtwork = [{
      src: DEFAULT_ARTWORK.replace("url('/", "").replace("')", ""),
      sizes: '300x300',
      type: 'image/png'
    }];
    return;
  }

  if (imageUrl.startsWith('url(')) {
    musicPlayerState.albumArtEl.style.backgroundImage = imageUrl;
    musicPlayerState.currentArtwork = [{
      src: imageUrl.replace("url('", "").replace("')", ""),
      sizes: '300x300',
      type: 'image/jpeg'
    }];
    return;
  }

  musicPlayerState.albumArtEl.style.backgroundImage = `url('${imageUrl}')`;
  musicPlayerState.currentArtwork = [{
    src: imageUrl,
    sizes: '300x300',
    type: imageUrl.startsWith('data:') ? imageUrl.split(';')[0].split(':')[1] : 'image/jpeg'
  }];
}

function createMetaWrapper() {
  const metaWrapper = document.createElement("div");
  metaWrapper.className = "player-meta-wrapper";

  if (musicPlayerState.modernPlayer) {
    musicPlayerState.modernPlayer.insertBefore(
      metaWrapper,
      musicPlayerState.progressContainer
    );
  }
  musicPlayerState.metaWrapper = metaWrapper;
}

function addMetaItem(className, icon, text) {
  if (!musicPlayerState.metaContainer || !text) return;

  const span = document.createElement("span");
  span.className = `${className}-meta`;

  const label = config.languageLabels[className] || className;
  span.title = `${label}: ${text}`;

  span.innerHTML = `<i class="${icon}"></i> ${text}`;
  musicPlayerState.metaContainer.appendChild(span);
}

async function loadAlbumArt(track) {
  try {
    const artwork = await getArtworkFromSources(track);
    setAlbumArt(artwork);

    if (artwork && artwork !== DEFAULT_ARTWORK) {
      cacheForOffline(track.Id, 'artwork', artwork);
    }
  } catch (err) {
    console.error("Albüm kapağı yükleme hatası:", err);
    setAlbumArt(DEFAULT_ARTWORK);
  }
}

async function getArtworkFromSources(track) {
  try {
    const fromCache = await getFromOfflineCache(track.Id, 'artwork');
    if (fromCache) return fromCache;

    const embedded = await getEmbeddedImage(track.Id);
    if (embedded) return embedded;

    const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
    if (imageTag) {
      const imageId = track.AlbumId || track.Id;
      const serverUrl = window.ApiClient?.serverAddress() || window.location.origin;
      const url = `/Items/${imageId}/Images/Primary?fillHeight=300&fillWidth=300&quality=90&tag=${imageTag}`;
      const valid = await checkImageExists(url);
      return valid ? url : DEFAULT_ARTWORK;
    }

    return DEFAULT_ARTWORK;
  } catch (error) {
    console.error("Artwork alınırken hata:", error);
    return DEFAULT_ARTWORK;
  }
}

function checkImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function getEmbeddedImage(trackId) {
  const tags = await readID3Tags(trackId);
  return tags?.pictureUri || null;
}

export function playTrack(index) {
  cleanupAudioListeners();
  const currentTrack = musicPlayerState.playlist[musicPlayerState.currentIndex];
  if (currentTrack) {
    reportPlaybackStopped(
      currentTrack,
      convertSecondsToTicks(musicPlayerState.audio.currentTime)
    );
  }

  if (index < 0 || index >= musicPlayerState.playlist.length) return;

  if (!musicPlayerState.mediaSessionInitialized && 'mediaSession' in navigator) {
    initMediaSession();
    musicPlayerState.mediaSessionInitialized = true;
  }

  const track = musicPlayerState.isUserModified ?
    musicPlayerState.combinedPlaylist[index] :
    musicPlayerState.playlist[index];
  musicPlayerState.currentIndex = index;
  musicPlayerState.currentTrackName = track.Name || config.languageLabels.unknownTrack;
  musicPlayerState.currentAlbumName = track.Album || config.languageLabels.unknownAlbum;

  showNotification(
    `<i class="fas fa-music" style="margin-right: 8px;"></i>${config.languageLabels.simdioynat}: ${musicPlayerState.currentTrackName}`,
    2000,
    'kontrol'
  );

  updateModernTrackInfo(track);
  updatePlaylistModal();
  startLyricsSync();
  reportPlaybackStart(track);

  const audio = musicPlayerState.audio;
  audio.onended = handleSongEnd;
  audio.addEventListener('canplay', handleCanPlay, { once: true });
  audio.addEventListener('error', handlePlayError, { once: true });
  audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
  setupAudioListeners();

  const audioUrl = `/Audio/${track.Id}/stream.mp3?Static=true`;
  audio.src = audioUrl;
  audio.load();

  if (musicPlayerState.lyricsActive) {
    fetchLyrics();
    startLyricsSync();
  }
  updateNextTracks();
}

function getAudioUrl(track) {
  if (musicPlayerState.playlistSource === "jellyfin") {
    const trackId = track.Id || track.id;
    if (!trackId) {
      console.error("Parça Id Bulunamadı:", track);
      return null;
    }

    const authToken = getAuthToken();
    if (!authToken) {
      showNotification(
      `<i class="fas fa-exclamation-circle"></i> ${config.languageLabels.authRequired || "Kimlik doğrulama hatası"}`,
      3000,
      'error'
    );
      return null;
    }

    return `/Audio/${encodeURIComponent(trackId)}/stream.mp3?Static=true&api_key=${authToken}`;
  }

  return track.filePath || track.mediaSource ||
        (track.Id && `/Audio/${track.Id}/stream.mp3`);
}

function getEffectiveDuration() {
  const audio = musicPlayerState.audio;
  if (audio && isFinite(audio.duration)) return audio.duration;
  if (isFinite(musicPlayerState.currentTrackDuration)) return musicPlayerState.currentTrackDuration;
  return 0;
}

function handleLoadedMetadata() {
  const effectiveDuration = getEffectiveDuration();
  musicPlayerState.currentTrackDuration = effectiveDuration;

  updateDuration();
  updateProgress();

  if (!isFinite(effectiveDuration)) {
    setTimeout(() => {
      updateDuration();
      updateProgress();
    }, 1000);
  }
}

async function reportPlaybackStart(track) {
  if (!track?.Id) return;

  try {
    const authToken = getAuthToken();
    if (!authToken) return;

    const response = await fetch(`/Sessions/Playing`, {
      method: "POST",
      headers: {
        "Authorization": `MediaBrowser Token="${authToken}"`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ItemId: track.Id,
        PlayMethod: "DirectStream",
        CanSeek: true,
        IsPaused: false,
        IsMuted: false,
        PositionTicks: 0
      })
    });

    if (!response.ok) {
      console.error("Oynatma başlatma raporu gönderilemedi:", response.status);
    }
  } catch (error) {
    console.error("Oynatma raporlama hatası:", error);
  }
}

async function reportPlaybackStopped(track, positionTicks) {
  if (!track?.Id) return;

  try {
    const authToken = getAuthToken();
    if (!authToken) return;

    const response = await fetch(`/Sessions/Playing/Stopped`, {
      method: "POST",
      headers: {
        "Authorization": `MediaBrowser Token="${authToken}"`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ItemId: track.Id,
        PlayMethod: "DirectStream",
        PositionTicks: positionTicks || 0
      })
    });

    if (!response.ok) {
      console.error("Oynatma durdurma raporu gönderilemedi:", response.status);
    }
  } catch (error) {
    console.error("Oynatma durdurma raporlama hatası:", error);
  }
}

function convertSecondsToTicks(seconds) {
  return seconds ? Math.floor(seconds * 10000000) : 0;
}
