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
const DEFAULT_ARTWORK = "url('/web/slider/src/images/defaultArt.png')";
const SEEK_RETRY_DELAY = 2000;

let currentCanPlayHandler = null;
let currentPlayErrorHandler = null;

// Oynatma durumunu güncelleme fonksiyonu
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

// Hata yönetimi fonksiyonu
const handlePlaybackError = (error, action = 'play') => {
  console.error(`Playback error during ${action}:`, error);
  showNotification(config.languageLabels.playbackError);
  setTimeout(playNext, SEEK_RETRY_DELAY);
};

// Ses dinleyicilerini temizleme
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

// Şarkı sonu işleme
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

// Oynatma fonksiyonları
export function togglePlayPause() {
  const { audio } = musicPlayerState;

  if (!audio) {
    console.warn('Audio element not found');
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

  // Eğer şarkının başından 3 saniyeden fazla geçmişse başa sar
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  // Önceki şarkıya geç (döngüsel)
  const newIndex = currentIndex - 1 < 0 ? playlist.length - 1 : currentIndex - 1;
  playTrack(newIndex);
}

export function playNext() {
  const { currentIndex, playlist, userSettings, shuffleHistory = [] } = musicPlayerState;

  // Karıştırma modu aktifse
  if (userSettings.shuffleMode) {
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * playlist.length);
      if (shuffleHistory.length >= playlist.length) {
        musicPlayerState.shuffleHistory = [];
      }
    } while (shuffleHistory.includes(randomIndex) && playlist.length > 1);

    musicPlayerState.shuffleHistory = [...shuffleHistory, randomIndex];
    playTrack(randomIndex);
    showNotification(`Shuffle mode: ${playlist[randomIndex].Name || playlist[randomIndex].title}`);
    return;
  }

  // Normal modda sonraki şarkıya geç (döngüsel)
  const newIndex = (currentIndex + 1) % playlist.length;
  playTrack(newIndex);
}

// Şarkı bilgilerini güncelleme
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

// Albüm kapağı yükleme
async function loadAlbumArt(track) {
  try {
    const artwork = await getArtworkFromSources(track);
    setAlbumArt(artwork);

    if (artwork !== DEFAULT_ARTWORK) {
      cacheForOffline(track.Id, 'artwork', artwork);
    }
  } catch (err) {
    console.error("Album art loading error:", err);
    setAlbumArt(DEFAULT_ARTWORK);
  }
}

// Şarkıyı çalma fonksiyonu
export function playTrack(index) {
  if (index < 0 || index >= musicPlayerState.playlist.length) return;

  const track = musicPlayerState.playlist[index];
  musicPlayerState.currentIndex = index;
  musicPlayerState.currentTrackName = track.Name || track.title || "Unknown Track";
  musicPlayerState.currentAlbumName = track.Album || "Unknown Album";

  updateModernTrackInfo(track);
  updatePlaylistModal();

  // Linux için özel artwork ayarı
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

  // Audio öğesini ayarla
  const audioUrl = getAudioUrl(track);
  if (!audioUrl) return;

  cleanupAudioListeners();
  musicPlayerState.audio.src = audioUrl;

  // Dinleyicileri ekle
  setupAudioListeners();
  musicPlayerState.audio.addEventListener('canplay', handleCanPlay, { once: true });
  musicPlayerState.audio.addEventListener('error', handlePlayError, { once: true });

  // MediaSession durumunu güncelle
  if (musicPlayerState.mediaSession) {
    musicPlayerState.mediaSession.playbackState = 'none';
  }

  musicPlayerState.audio.load();

  function handleCanPlay() {
    musicPlayerState.audio.play()
      .then(() => {
        updatePlaybackUI(true);
        if (musicPlayerState.lyricsActive) {
          fetchLyrics();
        }
      })
      .catch(err => {
        console.error("Playback error:", err);
        setTimeout(playNext, 2000);
      });
  }

  function handlePlayError() {
    console.error("Track loading failed:", audioUrl);
    setTimeout(playNext, 2000);
  }
}

// Yardımcı fonksiyonlar
function getAudioUrl(track) {
  if (musicPlayerState.playlistSource === "jellyfin") {
    const trackId = track.Id || track.id;
    if (!trackId) {
      console.error("Track ID not found:", track);
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

// Diğer yardımcı fonksiyonlar (resetTrackInfo, setAlbumArt, createMetaWrapper, addMetaItem, getArtworkFromSources, checkImageExists, getEmbeddedImage)
// Bu fonksiyonlar orijinal halleriyle aynı şekilde kalabilir
