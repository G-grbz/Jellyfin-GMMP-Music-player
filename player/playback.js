import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { getAuthToken } from "../core/auth.js";
import { updateMediaMetadata, initMediaSession } from "../core/mediaSession.js";
import { getFromOfflineCache, cacheForOffline } from "../core/offlineCache.js";
import { readID3Tags, arrayBufferToBase64 } from "../lyrics/id3Reader.js";
import { fetchLyrics, updateSyncedLyrics } from "../lyrics/lyrics.js";
import { updatePlaylistModal } from "../ui/playlistModal.js";
import { showNotification } from "../ui/notification.js";
import { updateProgress, updateDuration, setupAudioListeners } from "./progress.js";

const config = getConfig();

const SEEK_RETRY_DELAY = 2000;
const DEFAULT_ARTWORK = "url('/web/slider/src/images/defaultArt.png')";
const TRACK_CHANGE_DELAY = 1000;
const ERROR_RETRY_DELAY = 2000;

let currentCanPlayHandler = null;
let currentPlayErrorHandler = null;

const updatePlaybackUI = (isPlaying) => {
  if (musicPlayerState.playPauseBtn) {
    musicPlayerState.playPauseBtn.innerHTML = isPlaying
      ? '<i class="fas fa-pause"></i>'
      : '<i class="fas fa-play"></i>';
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? 'oynatılıyor' : 'durduruldu';
  }
};

const handlePlaybackError = (error, action = 'play') => {
  console.error(`Oynatma sırasında hata oluştu ${action}:`, error);
  showNotification(config.languageLabels.playbackError);
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

  const events = {
    'canplay': currentCanPlayHandler,
    'error': currentPlayErrorHandler,
    'timeupdate': updateProgress,
    'ended': handleSongEnd,
    'loadedmetadata': handleLoadedMetadata
  };

  Object.entries(events).forEach(([event, handler]) => {
    if (handler) audio.removeEventListener(event, handler);
  });

  audio.pause();
  audio.src = '';
  audio.removeAttribute('src');
  audio.load();
}

function handleSongEnd() {
  const { audio, userSettings, currentIndex, playlist } = musicPlayerState;

  switch(userSettings.repeatMode) {
    case 'one':
      audio.currentTime = 0;
      audio.play()
        .then(() => updatePlaybackUI(true))
        .catch(e => handlePlaybackError(e, 'repeat'));
      break;

    case 'all':
      playNext();
      break;

    default:
      if (currentIndex < playlist.length - 1) {
        playNext();
      } else {
        updatePlaybackUI(false);
      }
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
      .then(() => updatePlaybackUI(true))
      .catch(error => handlePlaybackError(error));
  } else {
    audio.pause();
    updatePlaybackUI(false);
  }
}

export function playPrevious() {
  const { currentIndex, playlist, audio } = musicPlayerState;

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  cleanupAudioListeners();

  setTimeout(() => {
    const newIndex = currentIndex - 1 < 0 ? playlist.length - 1 : currentIndex - 1;
    playTrack(newIndex);
  }, TRACK_CHANGE_DELAY);
}

export function playNext() {
  const { currentIndex, playlist, userSettings } = musicPlayerState;

  cleanupAudioListeners();

  setTimeout(() => {
    if (userSettings.shuffleMode) {
      const randomIndex = Math.floor(Math.random() * playlist.length);
      playTrack(randomIndex);
      return;
    }

    const newIndex = (currentIndex + 1) % playlist.length;
    playTrack(newIndex);
  }, TRACK_CHANGE_DELAY);
}

export async function updateModernTrackInfo(track) {
  if (!track) {
    resetTrackInfo();
    return;
  }

  const title = track.Name || track.title || config.languageLabels.unknownTrack;
  const artists = track.Artists ||
                 (track.ArtistItems?.map(a => a.Name) || []) ||
                 (track.artist ? [track.artist] : []) ||
                 [config.languageLabels.unknownArtist];

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
      src: DEFAULT_ARTWORK.replace("url('", "").replace("')", ""),
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

  if (imageUrl.startsWith('data:')) {
    musicPlayerState.albumArtEl.style.backgroundImage = `url('${imageUrl}')`;
    musicPlayerState.currentArtwork = [{
      src: imageUrl,
      sizes: '300x300',
      type: imageUrl.split(';')[0].split(':')[1]
    }];
    return;
  }

  musicPlayerState.albumArtEl.style.backgroundImage = `url('${imageUrl}')`;
  musicPlayerState.currentArtwork = [{
    src: imageUrl,
    sizes: '300x300',
    type: 'image/jpeg'
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
  span.title = config.languageLabels[className] || className;
  span.innerHTML = `<i class="${icon}"></i> ${text}`;
  musicPlayerState.metaContainer.appendChild(span);
}

async function loadAlbumArt(track) {
  try {
    const artwork = await getArtworkFromSources(track);
    setAlbumArt(artwork);

    if (artwork !== DEFAULT_ARTWORK) {
      cacheForOffline(track.Id, 'artwork', artwork);
    }
  } catch (err) {
    console.error("Albüm kapağı yükleme hatası:", err);
    setAlbumArt(DEFAULT_ARTWORK);
  }
}

async function getArtworkFromSources(track) {
  try {
    const cachedArtwork = await getFromOfflineCache(track.Id, 'artwork');
    if (cachedArtwork) return cachedArtwork;

    const embeddedImage = await getEmbeddedImage(track.Id);
    if (embeddedImage) return embeddedImage;

    const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
    if (imageTag) {
      const imageId = track.AlbumId || track.Id;
      const serverUrl = window.ApiClient?.serverAddress() || window.location.origin;
      const artworkUrl = `${serverUrl}/Items/${imageId}/Images/Primary?fillHeight=300&fillWidth=300&quality=90&tag=${imageTag}`;
      const valid = await checkImageExists(artworkUrl);
      return valid ? artworkUrl : DEFAULT_ARTWORK;
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
  if (tags?.picture) {
    return `data:${tags.picture.format};base64,${arrayBufferToBase64(tags.picture.data)}`;
  }
  return null;
}

export function playTrack(index) {
  if (index < 0 || index >= musicPlayerState.playlist.length) return;

  const track = musicPlayerState.playlist[index];
  musicPlayerState.currentIndex = index;

  musicPlayerState.currentTrackName = track.Name || track.title || "Bilinmeyen Şarkı";
  musicPlayerState.currentAlbumName = track.Album || "Bilinmeyen Albüm";

  updateModernTrackInfo(track);
  updatePlaylistModal();

  if (/Linux/i.test(navigator.userAgent)) {
    const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
    if (imageTag) {
      const imageId = track.AlbumId || track.Id;
      const artworkUrl = `${window.location.origin}/Items/${imageId}/Images/Primary?fillHeight=512&fillWidth=512&quality=90&tag=${imageTag}`;
      musicPlayerState.currentArtwork = [{
        src: artworkUrl,
        sizes: '512x512',
        type: 'image/jpeg'
      }];
    }
  }

  const audioUrl = `${window.location.origin}/Audio/${track.Id}/stream.mp3?Static=true`;
  musicPlayerState.audio.src = audioUrl;
  musicPlayerState.audio.removeEventListener('canplay', handleCanPlay);
  musicPlayerState.audio.removeEventListener('error', handlePlayError);
  musicPlayerState.audio.removeEventListener("timeupdate", updateProgress);
  musicPlayerState.audio.removeEventListener("ended", handleSongEnd);
  musicPlayerState.audio.removeEventListener("loadedmetadata", updateDuration);
  musicPlayerState.audio.removeEventListener("timeupdate", updateSyncedLyrics);
  musicPlayerState.audio.addEventListener('canplay', handleCanPlay);
  musicPlayerState.audio.addEventListener('error', handlePlayError);
  setupAudioListeners();

  if (musicPlayerState.mediaSession) {
    musicPlayerState.mediaSession.playbackState = 'none';
  }

  musicPlayerState.audio.load();

  function handleCanPlay() {
    musicPlayerState.audio.play()
      .then(() => {
        musicPlayerState.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        if (musicPlayerState.mediaSession) {
          musicPlayerState.mediaSession.playbackState = 'playing';
        }
      })
      .catch(err => {
        console.error("Oynatma hatası:", err);
        setTimeout(playNext, 2000);
      });

    musicPlayerState.audio.removeEventListener('canplay', handleCanPlay);
    musicPlayerState.audio.removeEventListener('error', handlePlayError);
  }

  function handlePlayError() {
    console.error("Parça yüklenemedi:", audioUrl);
    setTimeout(playNext, 2000);
    musicPlayerState.audio.removeEventListener('canplay', handleCanPlay);
    musicPlayerState.audio.removeEventListener('error', handlePlayError);
  }

  if (musicPlayerState.lyricsActive) {
    fetchLyrics();
  }
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
      showNotification(config.languageLabels.authRequired);
      return null;
    }

    return `${window.ApiClient.serverAddress()}/Audio/${encodeURIComponent(trackId)}/stream.mp3?Static=true&api_key=${authToken}`;
  }

  return track.filePath || track.mediaSource ||
        (track.Id && `${window.location.origin}/Audio/${track.Id}/stream.mp3`);
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
