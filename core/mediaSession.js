import { musicPlayerState } from "./state.js";
import { togglePlayPause, playPrevious, playNext } from "../player/playback.js";

const DEFAULT_ARTWORK_URL = '/web/GMMP/src/images/defaultArt.png';

export function initMediaSession() {
  if (!('mediaSession' in navigator)) return;

  try {
    musicPlayerState.mediaSession = navigator.mediaSession;

    const actionHandlers = {
      play: () => {
        if (musicPlayerState.audio.paused) {
          togglePlayPause();
        }
      },
      pause: () => {
        if (!musicPlayerState.audio.paused) {
          togglePlayPause();
        }
      },
      previoustrack: playPrevious,
      nexttrack: playNext,
      seekbackward: () => {
        musicPlayerState.audio.currentTime = Math.max(0, musicPlayerState.audio.currentTime - 10);
        updatePositionState();
      },
      seekforward: () => {
        musicPlayerState.audio.currentTime = Math.min(
          musicPlayerState.audio.duration,
          musicPlayerState.audio.currentTime + 10
        );
        updatePositionState();
      },
      seekto: (details) => {
        if (details.seekTime !== undefined) {
          musicPlayerState.audio.currentTime = details.seekTime;
          updatePositionState();
        }
      },
      stop: () => {
        musicPlayerState.audio.pause();
        musicPlayerState.audio.currentTime = 0;
        updatePlaybackUI(false);
      }
    };

    Object.entries(actionHandlers).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        console.warn(`[MedyaOturumu] ${action} işleyici desteklenmiyor:`, error);
      }
    });

    if (/Android/i.test(navigator.userAgent)) {
      updatePositionState();
    }

  } catch (error) {
    console.error('[MedyaOturumu] Başlatma başarısız:', error);
  }
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!musicPlayerState.audio) return;

  const duration = getEffectiveDuration();
  if (!isFinite(duration)) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: duration,
      playbackRate: musicPlayerState.audio.playbackRate || 1,
      position: musicPlayerState.audio.currentTime || 0
    });
  } catch (error) {
    console.warn('[MedyaOturumu] Pozisyon güncelleme başarısız:', error);
  }
}

export async function updateMediaMetadata(track) {
  if (!('mediaSession' in navigator)) return;

  try {
    const title = track?.Name || track?.title || 'Bilinmeyen Şarkı';
    const artist = track?.Artists?.join(", ") ||
                  track?.ArtistItems?.map(a => a.Name).join(", ") ||
                  track?.artist ||
                  'Bilinmeyen Sanatçı';
    const album = track?.Album || 'Bilinmeyen Albüm';

    let artworkUrl;
    if (track?.AlbumPrimaryImageTag || track?.PrimaryImageTag) {
      const imageId = track.AlbumId || track.Id;
      artworkUrl = `${window.location.origin}/Items/${imageId}/Images/Primary?quality=90&tag=${track.AlbumPrimaryImageTag || track.PrimaryImageTag}`;
    } else {
      artworkUrl = DEFAULT_ARTWORK_URL;
    }

    const artwork = [{
      src: artworkUrl,
      sizes: '512x512',
      type: artworkUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }];

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork
    });

    navigator.mediaSession.playbackState = musicPlayerState.audio?.paused ? 'durduruldu' : 'oynatılıyor';

    if (/Android/i.test(navigator.userAgent)) {
      updatePositionState();
    }

  } catch (error) {
    console.error('[MedyaOturumu] Bilgi güncelleme başarısız:', error);
  }
}

function getEffectiveDuration() {
  const audio = musicPlayerState.audio;
  if (audio && isFinite(audio.duration)) return audio.duration;
  if (isFinite(musicPlayerState.currentTrackDuration)) return musicPlayerState.currentTrackDuration;
  return 0;
}
