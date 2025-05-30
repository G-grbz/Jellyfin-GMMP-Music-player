import { musicPlayerState } from "../core/state.js";
import { handleSongEnd } from "./audio.js";
import { updateSyncedLyrics } from "../lyrics/lyrics.js";

let isDragging = false;
let isClick = false;
let dragStartX = 0;
let dragStartTime = 0;
let positionUpdateInterval;

export function formatTime(seconds) {
  if (!isFinite(seconds)) return '0:00';
  const minutes = Math.floor(Math.min(seconds, 5999) / 60);
  const secs = Math.floor(Math.min(seconds, 5999) % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function getEffectiveDuration() {
  const { audio } = musicPlayerState;

  if (audio && isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }

  if (isFinite(musicPlayerState.currentTrackDuration)) {
    return musicPlayerState.currentTrackDuration;
  }

  return 30;
}

function updateMediaPositionState() {
  if ('mediaSession' in navigator && musicPlayerState.audio) {
    try {
      navigator.mediaSession.setPositionState({
        duration: getEffectiveDuration(),
        playbackRate: musicPlayerState.audio.playbackRate,
        position: musicPlayerState.audio.currentTime
      });
    } catch (e) {
      console.warn('MediaSession konum durumu güncellemesi başarısız oldu:', e);
    }
  }
}

export function initMediaSessionHandlers() {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        musicPlayerState.audio.play().catch(e => console.error('Oynatma hatası:', e));
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        musicPlayerState.audio.pause();
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime) {
          musicPlayerState.audio.currentTime = details.seekTime;
          updateProgress();
          updateMediaPositionState();
        }
      });

      navigator.mediaSession.setActionHandler('seekforward', () => {
        musicPlayerState.audio.currentTime += 10;
        updateProgress();
        updateMediaPositionState();
      });

      navigator.mediaSession.setActionHandler('seekbackward', () => {
        musicPlayerState.audio.currentTime = Math.max(0, musicPlayerState.audio.currentTime - 10);
        updateProgress();
        updateMediaPositionState();
      });

      if (/Android/i.test(navigator.userAgent)) {
        clearInterval(positionUpdateInterval);
        positionUpdateInterval = setInterval(updateMediaPositionState, 1000);
      }
    } catch (error) {
      console.warn('MediaSession eylem işleyicisi desteklenmiyor:', error);
    }
  }
}

export function setupAudioListeners() {
  const { audio } = musicPlayerState;

  audio.removeEventListener("timeupdate", updateProgress);
  audio.removeEventListener("ended", handleSongEnd);
  audio.removeEventListener("loadedmetadata", updateDuration);
  audio.removeEventListener("timeupdate", updateSyncedLyrics);
  audio.removeEventListener("timeupdate", updateMediaPositionState);
  audio.removeEventListener("loadedmetadata", updateMediaPositionState);

  audio.addEventListener("timeupdate", () => {
    updateProgress();
    updateMediaPositionState();
  });

  audio.addEventListener("ended", handleSongEnd, { once: true });

  const endedHandler = () => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = "none";
    }
  };
  audio.addEventListener("ended", endedHandler, { once: true });

  audio.addEventListener("loadedmetadata", () => {
    updateDuration();
    updateMediaPositionState();
  });

  audio.addEventListener("timeupdate", updateSyncedLyrics);

  initMediaSessionHandlers();
}

export function setupProgressControls() {
  const { progressBar, progressHandle } = musicPlayerState;
  if (!progressBar || !progressHandle) return;

  progressBar.removeEventListener('mousedown', handleMouseDown);
  progressBar.removeEventListener('touchstart', handleTouchStart);
  progressBar.removeEventListener('click', handleClick);
  progressHandle.removeEventListener('mousedown', handleMouseDown);
  progressHandle.removeEventListener('touchstart', handleTouchStart);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('touchmove', handleTouchMove);
  document.removeEventListener('touchend', handleTouchEnd);

  progressBar.addEventListener('mousedown', handleMouseDown);
  progressBar.addEventListener('touchstart', handleTouchStart, { passive: false });
  progressBar.addEventListener('click', handleClick);
  progressHandle.addEventListener('mousedown', handleMouseDown);
  progressHandle.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
  progressBar.removeEventListener('wheel', handleWheel);
  progressBar.addEventListener('wheel', handleWheel, { passive: false });

  updateProgress();
}

function handleMouseDown(e) {
  if (!e.target.closest('.player-progress-bar, .player-progress-handle')) return;

  dragStartX = e.clientX;
  dragStartTime = Date.now();
  isClick = true;
  isDragging = true;
  e.preventDefault();
}

function handleTouchStart(e) {
  if (!e.target.closest('.player-progress-bar, .player-progress-handle')) return;

  dragStartX = e.touches[0].clientX;
  dragStartTime = Date.now();
  isClick = true;
  isDragging = true;
  e.preventDefault();
}

function handleClick(e) {
  if (!isClick || isDragging) return;
  seekToPosition(e.clientX);
}

function handleMouseMove(e) {
  if (!isDragging) return;

  const movedDistance = Math.abs(e.clientX - dragStartX);
  const elapsedTime = Date.now() - dragStartTime;

  if (isClick && (movedDistance > 5 || elapsedTime > 100)) {
    isClick = false;
  }

  seekToPosition(e.clientX);
}

function handleTouchMove(e) {
  if (!isDragging) return;

  const movedDistance = Math.abs(e.touches[0].clientX - dragStartX);
  const elapsedTime = Date.now() - dragStartTime;

  if (isClick && (movedDistance > 5 || elapsedTime > 100)) {
    isClick = false;
  }

  seekToPosition(e.touches[0].clientX);
  e.preventDefault();
}

function handleMouseUp() {
  if (isClick) {
    seekToPosition(dragStartX);
  }
  endDrag();
}

function handleTouchEnd() {
  if (isClick) {
    seekToPosition(dragStartX);
  }
  endDrag();
}

function seekToPosition(clientX) {
  const { audio, progressBar, progressHandle, durationEl } = musicPlayerState;
  if (!audio || !progressBar) return;

  const rect = progressBar.getBoundingClientRect();
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const percent = (x / rect.width) * 100;
  const dur = getEffectiveDuration();
  const seekTime = (percent / 100) * dur;

  if (isFinite(seekTime)) {
    audio.currentTime = seekTime;
    progressHandle.style.left = `${percent}%`;
    updateProgress();
    updateMediaPositionState();

    const remaining = Math.max(0, dur - audio.currentTime);
    if (durationEl) {
      durationEl.textContent = `-${formatTime(remaining)}`;
    }
  }
}

function endDrag() {
  isDragging = false;
  isClick = false;
}

let lastUpdateTime = 0;

export function updateProgress() {
  const now = Date.now();
  if (now - lastUpdateTime < 200 && !isDragging) return;
  lastUpdateTime = now;

  const { audio, progress, currentTimeEl, progressHandle, durationEl, showRemaining } = musicPlayerState;
  const dur = getEffectiveDuration();

  if (!progress || !currentTimeEl || !durationEl) return;
  if (!isFinite(dur) || dur <= 0) {
    progress.style.width = `0%`;
    if (progressHandle) progressHandle.style.left = `0%`;
    currentTimeEl.textContent = formatTime(audio.currentTime || 0);
    durationEl.textContent = formatTime(dur);
    return;
  }
  const percent = Math.min(100, (audio.currentTime / dur) * 100);
  progress.style.width = `${percent}%`;
  if (progressHandle) progressHandle.style.left = `${percent}%`;

  currentTimeEl.textContent = formatTime(audio.currentTime);
  if (showRemaining) {
    const remaining = Math.max(0, dur - audio.currentTime);
    durationEl.textContent = `-${formatTime(remaining)}`;
  } else {
    durationEl.textContent = formatTime(dur);
  }
}

export function updateDuration() {
  const { durationEl } = musicPlayerState;
  if (!durationEl) return;

  const dur = getEffectiveDuration();
  durationEl.textContent = formatTime(dur);
}

export function cleanupMediaSession() {
  if (positionUpdateInterval) {
    clearInterval(positionUpdateInterval);
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('seekto', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
    navigator.mediaSession.setActionHandler('seekbackward', null);
  }
}

function handleWheel(e) {
  e.preventDefault();
  const { audio } = musicPlayerState;
  if (!audio) return;

  const delta = e.deltaY > 0 ? -1 : 1;
  const seekAmount = 1;

  audio.currentTime = Math.max(0, Math.min(audio.currentTime + (delta * seekAmount), getEffectiveDuration()));

  updateProgress();
  updateMediaPositionState();

  const { progressHandle } = musicPlayerState;
  if (progressHandle) {
    setTimeout(() => {
      progressHandle.style.transform = '';
    }, 200);
  }
}
