import { musicPlayerState } from "./state.js";

export async function cacheForOffline(trackId, type, data) {
  if (!musicPlayerState.offlineCache.enabled) return;

  try {
    if (type === 'lyrics') {
      musicPlayerState.offlineCache.lyrics[trackId] = data;
    } else if (type === 'artwork') {
      musicPlayerState.offlineCache.artwork[trackId] = data;
    }
  } catch (err) {
    console.error('Önbellekleme hatası:', err);
  }
}

export async function getFromOfflineCache(trackId, type) {
  if (!musicPlayerState.offlineCache.enabled) return null;

  try {
    if (type === 'lyrics' && musicPlayerState.offlineCache.lyrics[trackId]) {
      return musicPlayerState.offlineCache.lyrics[trackId];
    } else if (type === 'artwork' && musicPlayerState.offlineCache.artwork[trackId]) {
      return musicPlayerState.offlineCache.artwork[trackId];
    }
    return null;
  } catch (err) {
    console.error('Önbellekten okuma hatası:', err);
    return null;
  }
}
