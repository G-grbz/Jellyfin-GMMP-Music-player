import { musicPlayerState } from "./state.js";
import { togglePlayPause, playPrevious, playNext } from "../player/playback.js";

const DEFAULT_ARTWORK_URL = '/web/slider/src/images/defaultArt.png';

export function initMediaSession() {
  if (!('mediaSession' in navigator)) {
    console.warn('MediaSession API desteklenmiyor');
    return;
  }

  try {
    const actionHandlers = {
      play: () => togglePlayPause(),
      pause: () => togglePlayPause(),
      previoustrack: () => playPrevious(),
      nexttrack: () => playNext(),
      seekbackward: (details) => handleSeekBackward(details),
      seekforward: (details) => handleSeekForward(details),
      seekto: (details) => handleSeekTo(details),
      stop: () => handleStopAction()
    };

    Object.entries(actionHandlers).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
        console.log(`MediaSession action handler registered: ${action}`);
      } catch (error) {
        console.warn(`MediaSession ${action} handler not supported:`, error);
      }
    });

    updatePlaybackState();

  } catch (error) {
    console.error('MediaSession initialization failed:', error);
  }
}

function setupHeadphoneControls() {
  document.addEventListener('keydown', (e) => {
    switch(e.key) {
      case 'MediaPlayPause':
        togglePlayPause();
        break;
      case 'MediaTrackPrevious':
        playPrevious();
        break;
      case 'MediaTrackNext':
        playNext();
        break;
    }
  });

  if ('bluetooth' in navigator) {
    navigator.bluetooth.addEventListener('availabilitychanged', (event) => {
      if (event.value) {
        console.log('Bluetooth headphones connected');
      }
    });
  }
}

function handlePlayAction() {
  if (musicPlayerState.audio.paused) {
    togglePlayPause();
  }
}

function handlePauseAction() {
  if (!musicPlayerState.audio.paused) {
    togglePlayPause();
  }
}

function handleSeekBackward() {
  musicPlayerState.audio.currentTime = Math.max(0, musicPlayerState.audio.currentTime - 10);
  updatePositionState();
}

function handleSeekForward() {
  musicPlayerState.audio.currentTime = Math.min(
    musicPlayerState.audio.duration,
    musicPlayerState.audio.currentTime + 10
  );
  updatePositionState();
}

function handleSeekTo(details) {
  if (details.seekTime !== undefined) {
    musicPlayerState.audio.currentTime = details.seekTime;
    updatePositionState();
  }
}

function handleStopAction() {
  musicPlayerState.audio.pause();
  musicPlayerState.audio.currentTime = 0;
  updatePlaybackUI(false);
}

function registerActionHandlers(handlers) {
  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      if (handler) {
        navigator.mediaSession.setActionHandler(action, handler);
      }
    } catch (error) {
      console.warn(`[MediaSession] ${action} handler not supported:`, error);
    }
  });
}

export function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!musicPlayerState.audio) return;

  const duration = getEffectiveDuration();
  if (!isFinite(duration)) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: duration,
      playbackRate: musicPlayerState.audio.playbackRate || 1,
      position: Math.min(musicPlayerState.audio.currentTime, duration - 0.1)
    });
  } catch (error) {
    console.warn('[MediaSession] Position update failed:', error);
  }
}

export async function updateMediaMetadata(track) {
  if (!('mediaSession' in navigator)) return;

  try {
    const metadata = {
      title: track?.Name || track?.title || 'Unknown Track',
      artist: track?.Artists?.join(", ") ||
             track?.ArtistItems?.map(a => a.Name).join(", ") ||
             track?.artist ||
             'Unknown Artist',
      album: track?.Album || 'Unknown Album',
      artwork: await getTrackArtwork(track)
    };

    navigator.mediaSession.metadata = new MediaMetadata(metadata);
    updatePlaybackState();

  } catch (error) {
    console.error('[MediaSession] Metadata update failed:', error);
  }
}

async function getTrackArtwork(track) {
  if (track?.AlbumPrimaryImageTag || track?.PrimaryImageTag) {
    const imageId = track.AlbumId || track.Id;
    return [{
      src: `${window.location.origin}/Items/${imageId}/Images/Primary?quality=90&tag=${track.AlbumPrimaryImageTag || track.PrimaryImageTag}`,
      sizes: '512x512',
      type: 'image/jpeg'
    }];
  }
  return [{
    src: DEFAULT_ARTWORK_URL,
    sizes: '512x512',
    type: 'image/png'
  }];
}

function updatePlaybackState() {
  if (!musicPlayerState.audio) return;
  navigator.mediaSession.playbackState = musicPlayerState.audio.paused ? 'paused' : 'playing';
}

function getEffectiveDuration() {
  const { audio, currentTrack } = musicPlayerState;

  if (audio && isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }

  if (currentTrack?.RunTimeTicks) {
    return currentTrack.RunTimeTicks / 10000000;
  }

  if (isFinite(musicPlayerState.currentTrackDuration)) {
    return musicPlayerState.currentTrackDuration;
  }

  return 0;
}
