import { musicPlayerState, resetShuffle } from "./state.js";
import { getConfig } from "./configLoader.js";
import { getAuthToken } from "./auth.js";
import { shuffleArray } from "../utils/domUtils.js";
import { showNotification } from "../ui/notification.js";
import { updateModernTrackInfo, playTrack } from "../player/playback.js";
import { updatePlaylistModal } from "../ui/playlistModal.js";


const config = getConfig();
const BATCH_SIZE = config.gruplimit;

export async function refreshPlaylist() {
  try {
    resetShuffle();
    musicPlayerState.modernTitleEl.textContent = config.languageLabels.loading;
    musicPlayerState.modernArtistEl.textContent = "";

    const token = getAuthToken();
    if (!token) throw new Error(config.languageLabels.noApiToken);

    const response = await fetch(
      `/Items?IncludeItemTypes=Audio&Recursive=true&Limit=${config.muziklimit}&SortBy=${musicPlayerState.userSettings.shuffle ? 'Random' : 'Random'}`,
      { headers: { "X-Emby-Token": token } }
    );

    if (!response.ok) throw new Error(config.languageLabels.unauthorizedRequest);

    const data = await response.json();
    musicPlayerState.playlist = data.Items || [];
    musicPlayerState.originalPlaylist = [...musicPlayerState.playlist];
    musicPlayerState.effectivePlaylist = [
      ...musicPlayerState.playlist,
      ...musicPlayerState.userAddedTracks
    ];

    if (musicPlayerState.userSettings.shuffle) {
      musicPlayerState.effectivePlaylist = shuffleArray([...musicPlayerState.effectivePlaylist]);
      musicPlayerState.isShuffled = true;
    }

    if (musicPlayerState.playlist.length > 0) {
      musicPlayerState.isPlayerVisible = true;
      musicPlayerState.modernPlayer.classList.add("visible");
      updateModernTrackInfo(musicPlayerState.playlist[0]);
      playTrack(0);
      showNotification(
        config.languageLabels.playlistRefreshed || "Oynatma listesi yenilendi",
        2000
      );
    } else {
      musicPlayerState.modernTitleEl.textContent = config.languageLabels.noMusicFound;
      musicPlayerState.modernArtistEl.textContent = config.languageLabels.tryRefreshing;
      showNotification(
        config.languageLabels.playlistEmpty || "Oynatma listesi boş",
        2000,
        'error'
      );
    }
  } catch (err) {
    console.error(config.languageLabels.refreshError, err);
    musicPlayerState.modernTitleEl.textContent = config.languageLabels.errorOccurred;
    musicPlayerState.modernArtistEl.textContent = err.message.includes("abort")
      ? config.languageLabels.requestTimeout
      : config.languageLabels.tryRefreshing;
    musicPlayerState.isPlayerVisible = true;
    musicPlayerState.modernPlayer.classList.add("visible");

    showNotification(
      config.languageLabels.refreshError || "Liste yenilenirken hata oluştu",
      2000,
      'error'
    );
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
    showNotification(config.languageLabels.noApiToken, "error");
    throw new Error("API anahtarı bulunamadı");
  }

  if (!Array.isArray(tracksToSave) || tracksToSave.length === 0) {
    showNotification(
      `${config.languageLabels.noTracksToSave}`,
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
    `${config.languageLabels.alreadyInPlaylist} (${alreadyInPlaylist.length}): ${displayNames}`,
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
          `${config.languageLabels.addingsuccessful}`,
          2000,
          'addlist'
        );
      } else {
        showNotification(
          `${config.languageLabels.noTracksToSave}`,
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
        `${config.languageLabels.playlistCreatedSuccessfully}`,
        2000,
        'addlist'
      );

      return result;
    }
  } catch (err) {
    console.error("Çalma listesi işlemi başarısız:", err);
    showNotification(
      `${err.message} ${config.languageLabels.playlistSaveError}`,
      2000,
      'addlist'
    );
    throw err;
  }
}
