import { musicPlayerState } from "./state.js";

export async function cacheForOffline(trackId, type, data) {
  if (!musicPlayerState.offlineCache.enabled) return;

  try {
    if (!musicPlayerState.offlineCache[trackId]) {
      musicPlayerState.offlineCache[trackId] = { lyrics: {}, artwork: {} };
    }

    if (type === 'lyrics') {
      musicPlayerState.offlineCache[trackId].lyrics = data;
    } else if (type === 'artwork') {
      musicPlayerState.offlineCache[trackId].artwork = data;
    }
  } catch (err) {
    console.error('Önbellekleme hatası:', err);
  }
}

export async function getFromOfflineCache(trackId, type) {
  if (!musicPlayerState.offlineCache.enabled) return null;

  try {
    if (musicPlayerState.offlineCache[trackId]) {
      if (type === 'lyrics' && musicPlayerState.offlineCache[trackId].lyrics) {
        return musicPlayerState.offlineCache[trackId].lyrics;
      } else if (type === 'artwork' && musicPlayerState.offlineCache[trackId].artwork) {
        return musicPlayerState.offlineCache[trackId].artwork;
      }
    }

    return null;
  } catch (err) {
    console.error('Önbellekten okuma hatası:', err);
    return null;
  }
}
