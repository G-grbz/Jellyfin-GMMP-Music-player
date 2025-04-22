import { musicPlayerState } from "./state.js";
import { getConfig } from "./configLoader.js";
import { getAuthToken } from "./auth.js";
import { shuffleArray } from "../utils/domUtils.js";
import { showNotification } from "../ui/notification.js";
import { updateModernTrackInfo, playTrack } from "../player/playback.js";
import { updatePlaylistModal } from "../ui/playlistModal.js";


const config = getConfig();

export async function refreshPlaylist() {
  try {
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
    if (musicPlayerState.userSettings.shuffle) {
      musicPlayerState.playlist = shuffleArray([...musicPlayerState.playlist]);
    }

    if (musicPlayerState.playlist.length > 0) {
      musicPlayerState.isPlayerVisible = true;
      musicPlayerState.modernPlayer.classList.add("visible");
      updateModernTrackInfo(musicPlayerState.playlist[0]);
      playTrack(0);
    } else {
      musicPlayerState.modernTitleEl.textContent = config.languageLabels.noMusicFound;
      musicPlayerState.modernArtistEl.textContent = config.languageLabels.tryRefreshing;
    }
  } catch (err) {
    console.error(config.languageLabels.refreshError, err);
    musicPlayerState.modernTitleEl.textContent = config.languageLabels.errorOccurred;
    musicPlayerState.modernArtistEl.textContent = err.message.includes("abort") ? config.languageLabels.requestTimeout : config.languageLabels.tryRefreshing;
    musicPlayerState.isPlayerVisible = true;
    musicPlayerState.modernPlayer.classList.add("visible");
  }
}

export async function saveCurrentPlaylistToJellyfin(playlistName) {
  try {
    const token = getAuthToken();
    if (!token) throw new Error(config.languageLabels.noApiToken);

    const createResponse = await fetch('/Playlists', {
      method: 'POST',
      headers: {
        "X-Emby-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        Name: playlistName || `Muzik Playlist ${new Date().toLocaleDateString()}`,
        Ids: musicPlayerState.playlist.map(item => item.Id),
        UserId: musicPlayerState.userSettings.userId
      })
    });

    if (!createResponse.ok) throw new Error(config.languageLabels.playlistCreateFailed);

    const result = await createResponse.json();
    showNotification(config.languageLabels.playlistCreatedSuccessfully);
    return result;
  } catch (err) {
    console.error(config.languageLabels.playlistSaveError, err);
    showNotification(err.message, 'error');
    throw err;
  }
}

