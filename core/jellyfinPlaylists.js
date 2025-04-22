import { getAuthToken } from "./auth.js";
import { showNotification } from "../ui/notification.js";
import { musicPlayerState } from "./state.js";
import { getConfig } from "./configLoader.js";
import { playTrack } from "../player/playback.js";
import { updatePlaylistModal } from "../ui/playlistModal.js";

const config = getConfig();
let isPlaylistModalOpen = false;
let modalElement = null;
let backdropElement = null;
let handleEsc = null;
let handleDocClick = null;

function closeModal() {
  if (!modalElement && !backdropElement) return;
  modalElement?.classList.add("jellyfin-playlist-modal--closing");
  backdropElement?.classList.add("jellyfin-playlist-modal__backdrop--closing");

  setTimeout(() => {
    if (modalElement && modalElement.parentNode) {
      modalElement.parentNode.removeChild(modalElement);
    }
    if (backdropElement && backdropElement.parentNode) {
      backdropElement.parentNode.removeChild(backdropElement);
    }
    document.removeEventListener("keydown", handleEsc);
    document.removeEventListener("click", handleDocClick);
    isPlaylistModalOpen = false;
    modalElement = null;
    backdropElement = null;
    handleEsc = null;
    handleDocClick = null;
  }, 300);
}

export async function fetchJellyfinPlaylists() {
  const authToken = getAuthToken();
  if (!authToken) {
    showNotification(config.languageLabels.authRequired);
    return [];
  }

  try {
    const userId = window.ApiClient.getCurrentUserId();
    const response = await fetch(
      `/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Playlist&Fields=PrimaryImageAspectRatio&StartIndex=0`,
      { headers: { "X-Emby-Token": authToken } }
    );

    if (!response.ok) {
      throw new Error(`HTTP hata durumu: ${response.status}`);
    }

    const data = await response.json();
    return (data.Items || []).map(item => ({
      id: item.Id,
      name: item.Name,
      childCount: item.ChildCount || 0,
      imageTag: item.ImageTags?.Primary || null
    }));
  } catch (error) {
    console.error("Çalma listesi getirme hatası:", error);
    showNotification(config.languageLabels.playlistFetchError);
    return [];
  }
}

function getStreamUrl(itemId) {
  const authToken = getAuthToken();
  return `/Audio/${itemId}/stream.mp3?Static=true&api_key=${authToken}`;
}

export async function playJellyfinPlaylist(playlistId) {
  const authToken = getAuthToken();
  if (!authToken) {
    showNotification(config.languageLabels.authRequired);
    return;
  }

  try {
    const userId = window.ApiClient.getCurrentUserId();
    const playlistResponse = await fetch(
      `/Playlists/${playlistId}/Items?UserId=${userId}&Fields=PrimaryImageAspectRatio,MediaSources,Chapters,ArtistItems,AlbumArtist,Album,Genres`,
      { headers: { "X-Emby-Token": authToken } }
    );

    if (!playlistResponse.ok) throw new Error(`HTTP error! status: ${playlistResponse.status}`);

    const data = await playlistResponse.json();
    const items = data.Items || [];

    if (!items.length) {
      showNotification(config.languageLabels.emptyPlaylist);
      return;
    }

    const playlist = items.map(item => ({
      Id: item.Id,
      Name: item.Name,
      Artists: item.ArtistItems?.map(a => a.Name) || [item.AlbumArtist] || [],
      AlbumArtist: item.AlbumArtist,
      Album: item.Album,
      AlbumId: item.AlbumId,
      IndexNumber: item.IndexNumber,
      ProductionYear: item.ProductionYear,
      RunTimeTicks: item.RunTimeTicks,
      AlbumPrimaryImageTag: item.AlbumPrimaryImageTag || item.ImageTags?.Primary,
      PrimaryImageTag: item.ImageTags?.Primary,
      mediaSource: getStreamUrl(item.Id),
      jellyfinItem: item
    }));

    musicPlayerState.playlist = playlist;
    musicPlayerState.currentIndex = 0;
    musicPlayerState.playlistSource = 'jellyfin';
    musicPlayerState.currentPlaylistId = playlistId;
    musicPlayerState.originalPlaylist = [...playlist];
    musicPlayerState.currentAlbumName = playlist[0]?.Album || "Bilinmeyen Albüm";
    musicPlayerState.currentTrackName = playlist[0]?.Name || "Bilinmeyen Şarkı";

    updatePlaylistModal();
    showNotification(`${items.length} ${config.languageLabels.tracks}`);
    playTrack(0);

  } catch (error) {
    console.error("Çalma listesi oynatma hatası:", error);
    showNotification(config.languageLabels.playlistPlayError);
  }
}

export async function showJellyfinPlaylistsModal() {
  if (isPlaylistModalOpen) {
    closeModal();
    return;
  }

  const playlists = await fetchJellyfinPlaylists();
  if (!playlists.length) {
    showNotification(config.languageLabels.noPlaylistsFound);
    return;
  }

  isPlaylistModalOpen = true;
  modalElement = document.createElement("div");
  modalElement.className = "jellyfin-playlist-modal";
  backdropElement = document.createElement("div");
  backdropElement.className = "jellyfin-playlist-modal__backdrop";

  handleEsc = e => { if (e.key === "Escape") closeModal(); };
  handleDocClick = e => { if (modalElement && !modalElement.contains(e.target)) closeModal(); };

  const title = document.createElement('h3');
  title.className = 'jellyfin-playlist-modal__title';
  title.textContent = config.languageLabels.selectPlaylist;
  modalElement.appendChild(title);

  const list = document.createElement('div');
  list.className = 'jellyfin-playlist-modal__list';
  playlists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'jellyfin-playlist-item';
    if (pl.imageTag) {
      const img = document.createElement('img');
      img.className = 'jellyfin-playlist-item__image';
      img.src = `${window.ApiClient.serverAddress()}/Items/${pl.id}/Images/Primary?maxHeight=50`;
      item.appendChild(img);
    }
    const info = document.createElement('div');
    info.className = 'jellyfin-playlist-item__info';
    const name = document.createElement('div');
    name.className = 'jellyfin-playlist-item__name';
    name.textContent = pl.name;
    const count = document.createElement('div');
    count.className = 'jellyfin-playlist-item__count';
    count.textContent = `${pl.childCount} ${config.languageLabels.tracks}`;
    info.append(name, count);
    item.appendChild(info);
    item.addEventListener('click', () => { closeModal(); setTimeout(() => playJellyfinPlaylist(pl.id), 350); });
    list.appendChild(item);
  });
  modalElement.appendChild(list);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'jellyfin-playlist-modal__close-btn';
  closeBtn.textContent = config.languageLabels.close;
  closeBtn.addEventListener('click', closeModal);

  modalElement.appendChild(closeBtn);
  backdropElement.addEventListener('click', e => { if (e.target === backdropElement) closeModal(); });
  modalElement.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('keydown', handleEsc);
  document.addEventListener('click', handleDocClick);
  document.body.appendChild(backdropElement);
  document.body.appendChild(modalElement);
  modalElement.tabIndex = -1;
  modalElement.focus();
}
