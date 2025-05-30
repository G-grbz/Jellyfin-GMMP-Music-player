import { musicPlayerState, resetShuffle } from "./state.js";
import { getConfig } from "./configLoader.js";
import { getAuthToken } from "./auth.js";
import { shuffleArray } from "../utils/domUtils.js";
import { showNotification } from "../ui/notification.js";
import { updateModernTrackInfo, playTrack } from "../player/playback.js";
import { updatePlaylistModal } from "../ui/playlistModal.js";

const config = getConfig();
const BATCH_SIZE = config.gruplimit;
const EXCLUDED_LISTS_HISTORY = config.historylimit;

let excludedTrackHistory = new Set();

export async function refreshPlaylist() {
  try {
    resetShuffle();
    musicPlayerState.modernTitleEl.textContent = config.languageLabels.loading;
    musicPlayerState.modernArtistEl.textContent = "";

    const token = getAuthToken();
    if (!token) throw new Error(config.languageLabels.noApiToken);

    const genres = musicPlayerState.selectedGenres || [];
    let items = [];

    const headers = { "X-Emby-Token": token };
    const baseQuery = "IncludeItemTypes=Audio&Recursive=true&SortBy=Random";

    const excludeIdsParam = excludedTrackHistory.size > 0
      ? `&ExcludeItemIds=${Array.from(excludedTrackHistory).join(',')}`
      : '';

    if (genres.length > 0) {
      const perGenreLimit = Math.floor(config.muziklimit / genres.length) || 1;
      const initialFetches = genres.map(genre =>
        fetch(
          `/Items?${baseQuery}&Limit=${perGenreLimit}&Genres=${encodeURIComponent(genre)}${excludeIdsParam}`,
          { headers }
        )
        .then(r => {
          if (!r.ok) throw new Error(config.languageLabels.unauthorizedRequest);
          return r.json();
        })
        .then(d => d.Items || [])
        .catch(() => [])
      );

      const initialResults = await Promise.all(initialFetches);
      items = initialResults.flat();

      const seenIds = new Set();
      items = items.filter(it => {
        if (seenIds.has(it.Id) || excludedTrackHistory.has(it.Id)) return false;
        seenIds.add(it.Id);
        return true;
      });

      let remainder = config.muziklimit - items.length;
      while (remainder > 0) {
        let added = false;
        for (const genre of genres) {
          if (remainder <= 0) break;
          const currentExcludeIds = Array.from(new Set([
            ...Array.from(seenIds),
            ...Array.from(excludedTrackHistory)
          ])).join(',');

          const url =
            `/Items?${baseQuery}` +
            `&Limit=1&Genres=${encodeURIComponent(genre)}` +
            (currentExcludeIds ? `&ExcludeItemIds=${encodeURIComponent(currentExcludeIds)}` : '');

          try {
            const resp = await fetch(url, { headers });
            if (!resp.ok) continue;
            const { Items = [] } = await resp.json();
            const [track] = Items;
            if (track && !seenIds.has(track.Id) && !excludedTrackHistory.has(track.Id)) {
              items.push(track);
              seenIds.add(track.Id);
              remainder--;
              added = true;
            }
          } catch (_) { /* atla */ }
        }
        if (!added) break;
      }

      items = items.slice(0, config.muziklimit);

      showNotification(
        `<i class="fas fa-masks-theater"></i> ${genres.length} ${config.languageLabels.genresApplied} ${items.length} ${config.languageLabels.tracks}`,
        2000,
        'tur'
      );
    } else {
      const resp = await fetch(
        `/Items?${baseQuery}&Limit=${config.muziklimit}${excludeIdsParam}`,
        { headers }
      );
      if (!resp.ok) throw new Error(config.languageLabels.unauthorizedRequest);
      const data = await resp.json();
      items = data.Items || [];
    }

    const newTrackIds = items.map(track => track.Id);
    updateExcludedTrackHistory(newTrackIds);

    musicPlayerState.playlist = items;
    musicPlayerState.originalPlaylist = [...items];
    musicPlayerState.effectivePlaylist = [...items];

    if (items.length > 0) {
      playTrack(0);
    } else {
      showNotification(
        `<i class="fas fa-info-circle"></i> ${
          genres.length
            ? config.languageLabels.noTracksForSelectedGenres
            : config.languageLabels.noTracks
        }`,
        2000,
        'info'
      );
    }

  } catch (err) {
    console.error("Liste yenilenirken hata:", err);
    musicPlayerState.modernTitleEl.textContent = config.languageLabels.errorOccurred;
    musicPlayerState.modernArtistEl.textContent = err.message.includes("abort")
      ? config.languageLabels.requestTimeout
      : config.languageLabels.tryRefreshing;
    showNotification(
      `<i class="fas fa-exclamation-triangle"></i> ${
        config.languageLabels.refreshError || "Liste yenilenirken hata oluştu"
      }`,
      3000,
      'error'
    );
  }
}

function updateExcludedTrackHistory(newTrackIds) {
  newTrackIds.forEach(id => excludedTrackHistory.add(id));

  const maxExcludedTracks = EXCLUDED_LISTS_HISTORY * config.muziklimit;

  if (excludedTrackHistory.size > maxExcludedTracks) {
    const allIds = Array.from(excludedTrackHistory);
    const idsToKeep = allIds.slice(allIds.length - maxExcludedTracks);
    excludedTrackHistory = new Set(idsToKeep);
  }
}

async function addItemsToPlaylist(playlistId, itemIds, userId) {
  const token = getAuthToken();
  const idsQueryParam = itemIds.join(',');

  try {
    const response = await fetch(
      `/Playlists/${playlistId}/Items?ids=${idsQueryParam}&userId=${userId}`,
      {
        method: 'POST',
        headers: {
          'X-Emby-Token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 204) {
      return { success: true, message: 'Parçalar başarıyla eklendi' };
    }

    if (response.status === 401) {
      throw new Error(config.languageLabels.unauthorizedAccess);
    } else if (response.status === 403) {
      throw new Error(config.languageLabels.accessForbidden);
    } else if (response.status === 404) {
      throw new Error(config.languageLabels.playlistNotFound);
    } else if (!response.ok) {
      throw new Error(
        config.languageLabels.serverError.replace('{0}', response.status)
      );
    }

  } catch (error) {
    console.error('Çalma listesine parça eklenirken hata:', error);
    throw error;
  }
}


 export async function removeItemsFromPlaylist(playlistId, itemIds) {
   const token = getAuthToken();
   const idsParam = itemIds.join(',');
   const url = `/Playlists/${playlistId}/Items?entryIds=${idsParam}`;

   const res = await fetch(url, {
     method: 'DELETE',
     headers: {
       'X-Emby-Token': token,
       'Content-Type': 'application/json'
     }
   });

   if (!res.ok) {
     const details = await res.text().catch(() => '');
     console.error('removeItemsFromPlaylist hata detayı:', details);
     throw new Error(`Silme işlemi başarısız: HTTP ${res.status}${details ? ` – ${details}` : ''}`);
   }

   return { success: true };
 }


async function getPlaylistItems(playlistId) {
  const token = getAuthToken();
  const response = await fetch(`/Playlists/${playlistId}/Items`, {
    headers: {
      'X-Emby-Token': token,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Çalma listesi öğeleri alınamadı');
  }

  const data = await response.json();
  return data.Items || [];
}

export async function saveCurrentPlaylistToJellyfin(
  playlistName,
  makePublic = false,
  tracksToSave = [],
  isNew = true,
  existingPlaylistId = null
) {
  const token = getAuthToken();
  if (!token) {
    showNotification(
      `<i class="fas fa-lock"></i> ${config.languageLabels.noApiToken}`,
      3000,
      'error'
    );
    throw new Error("API anahtarı bulunamadı");
  }

  if (!Array.isArray(tracksToSave) || tracksToSave.length === 0) {
    showNotification(
      `<i class="fas fa-info-circle"></i> ${config.languageLabels.noTracksToSave}`,
      2000,
      'addlist'
    );
    return;
  }

  const itemIds = tracksToSave.map(track => track.Id);
  const userId = window.ApiClient.getCurrentUserId();

  try {
    if (!isNew && existingPlaylistId) {
      const existingItems = await getPlaylistItems(existingPlaylistId);
      const existingItemIds = new Set(existingItems.map(item => item.Id));

      const alreadyInPlaylist = tracksToSave.filter(track => existingItemIds.has(track.Id));
      const tracksToActuallyAdd = tracksToSave.filter(track => !existingItemIds.has(track.Id));

      if (alreadyInPlaylist.length > 0) {
    const names = alreadyInPlaylist.map(track => track.Name);
    let displayNames = "";

    if (names.length > 5) {
      const firstThree = names.slice(0, 3).join(", ");
      const remainingCount = names.length - 3;
      displayNames = `${firstThree} ${config.languageLabels.ayrica} ${remainingCount} ${config.languageLabels.moreTracks}`;
    } else {
      displayNames = names.join(", ");
    }

  showNotification(
      `<i class="fas fa-info-circle"></i> ${
        config.languageLabels.alreadyInPlaylist
      } (${alreadyInPlaylist.length}): ${displayNames}`,
      4000,
      'addlist'
    );
  }

      if (tracksToActuallyAdd.length > 0) {
  const idsToAdd = tracksToActuallyAdd.map(track => track.Id);

  for (let i = 0; i < idsToAdd.length; i += BATCH_SIZE) {
    const batch = idsToAdd.slice(i, i + BATCH_SIZE);
    await addItemsToPlaylist(existingPlaylistId, batch, userId);
  }

        showNotification(
            `<i class="fas fa-check-circle"></i> ${config.languageLabels.addingsuccessful}`,
              2000,
              'addlist'
            );
      } else {
        showNotification(
          `<i class="fas fa-info-circle"></i> ${config.languageLabels.noTracksToSave}`,
          2000,
          'addlist'
        );
      }
      return { success: true };

    } else {
      const createResponse = await fetch("/Playlists", {
        method: "POST",
        headers: {
          "X-Emby-Token": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          Name: playlistName || `Yeni Çalma Listesi ${new Date().toLocaleString()}`,
          Ids: itemIds,
          UserId: userId,
          IsPublic: makePublic
        })
      });

      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({}));
        throw new Error(error.Message || config.languageLabels.playlistCreateFailed);
      }
      const result = await createResponse.json();
      showNotification(
        `<i class="fas fa-check-circle"></i> ${config.languageLabels.playlistCreatedSuccessfully}`,
        2000,
        'addlist'
      );
      return result;
    }
  } catch (err) {
    console.error("Çalma listesi işlemi başarısız:", err);
    showNotification(
        `<i class="fas fa-exclamation-triangle"></i> ${
          err.message
        } ${
          config.languageLabels.playlistSaveError
        }`,
        3000,
        'error'
      );
    throw err;
  }
}
