import { createPlaylistModal, togglePlaylistModal } from "./playlistModal.js";
import { musicPlayerState, loadUserSettings, saveUserSettings } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { togglePlayPause, playPrevious, playNext, playTrack } from "../player/playback.js";
import { updateProgress, setupProgressControls } from "../player/progress.js";
import { toggleLyrics } from "../lyrics/lyrics.js";
import { toggleRepeatMode, toggleShuffle, toggleMute, toggleRemoveOnPlayMode } from "./controls.js";
import { refreshPlaylist } from "../core/playlist.js";
import { initSettings } from '../core/settings.js';
import { showJellyfinPlaylistsModal } from '../core/jellyfinPlaylists.js';
import { togglePlayerVisibility } from '../utils/mainIndex.js';
import { readID3Tags, arrayBufferToBase64 } from "../lyrics/id3Reader.js";
import { toggleArtistModal, setupArtistClickHandler, checkForNewMusic } from "./artistModal.js";
import { showGenreFilterModal } from "./genreFilterModal.js";
import { showTopTracksModal } from "./topModal.js";


const config = getConfig();
const DEFAULT_ARTWORK = "url('/web/GMMP/src/images/defaultArt.png')";

function createButton({ className, iconClass, title, onClick, id = "" }) {
  const btn = document.createElement("button");
  btn.className = `player-btn ${className || ""}`.trim();
  if (id) btn.id = id;
  btn.innerHTML = `<i class="${iconClass}"></i>`;
  btn.title = title;
  btn.onclick = onClick;
  return btn;
}

export function createModernPlayerUI() {
  const player = Object.assign(document.createElement("div"), {
    id: "modern-music-player",
    role: "region",
    ariaLabel: "Music Player",
    ariaHidden: "true"
  });

  const nextTracksContainer = document.createElement("div");
  nextTracksContainer.className = "next-tracks-container";

  const nextTracksName = document.createElement("div");
  nextTracksName.className = "next-tracks-name hidden";
  nextTracksName.innerText = config.languageLabels.sirada || "Sıradaki Şarkı";

  const nextTracksList = document.createElement("div");
  nextTracksList.className = "next-tracks-list";

  nextTracksContainer.append(nextTracksName, nextTracksList);

  setTimeout(() => {
    nextTracksName.classList.remove('hidden');
  }, 4000);

  const topControlsContainer = document.createElement("div");
  topControlsContainer.className = "top-controls-container";

  const buttonsTop = [
    { className: "playlist-btn", iconClass: "fas fa-list", title: config.languageLabels.playlist, onClick: togglePlaylistModal },
    { className: "jplaylist-btn", iconClass: "fas fa-list-music", title: config.languageLabels.jellyfinPlaylists || "Jellyfin Oynatma Listesi", onClick: showJellyfinPlaylistsModal },
    {
    className: "settingsLink", iconClass: "fas fa-cog", title: config.languageLabels.ayarlar || "Ayarlar", onClick: (e) => {
        e.preventDefault();
        const settings = initSettings();
        settings.open('music');
    }
    },
    { className: "kapat-btn", iconClass: "fas fa-times", title: config.languageLabels.close || "Close", onClick: togglePlayerVisibility },
  ];

  buttonsTop.forEach(btnInfo => {
    const div = document.createElement("div");
    div.className = btnInfo.className;
    div.innerHTML = `<i class="${btnInfo.iconClass}"></i>`;
    div.title = btnInfo.title;
    div.onclick = btnInfo.onClick;
    topControlsContainer.appendChild(div);
  });

  const albumArt = document.createElement("div");
albumArt.id = "player-album-art";
albumArt.addEventListener("click", () => {
    const currentTrack = musicPlayerState.playlist?.[musicPlayerState.currentIndex];
    if (!currentTrack) return;

    const artistName = currentTrack.Artists?.join(", ") ||
                     currentTrack.AlbumArtist ||
                     config.languageLabels.unknownArtist;

    const artistId = currentTrack.ArtistItems?.[0]?.Id ||
                   currentTrack.AlbumArtistId ||
                   currentTrack.ArtistId ||
                   null;

    toggleArtistModal(true, artistName, artistId);
});

  const trackInfo = document.createElement("div");
  trackInfo.className = "player-track-info";

  const titleContainer = document.createElement("div");
  titleContainer.id = "player-track-title";
  titleContainer.className = "marquee-container";

  const titleText = document.createElement("div");
  titleText.className = "marquee-text";
  titleText.textContent = config.languageLabels.noSongSelected;
  titleContainer.appendChild(titleText);

  const artist = document.createElement("div");
  artist.id = "player-track-artist";
  artist.textContent = config.languageLabels.artistUnknown;
  artist.onclick = () => toggleArtistModal(true, config.languageLabels.artistUnknown, null);

  const topTracksBtn = createButton({
  className: "top-tracks-btn",
  iconClass: "fas fa-chart-line",
  title: config.languageLabels.myMusic || "En Çok Dinlenenler",
  onClick: () => {
  showTopTracksModal();
},
});

  trackInfo.append(titleContainer, artist);

  const repeatBtn = createButton({ iconClass: "fas fa-repeat", title: config.languageLabels.repeatModOff, onClick: toggleRepeatMode });
  const shuffleBtn = createButton({ iconClass: "fas fa-random", title: `${config.languageLabels.shuffle}: ${config.languageLabels.shuffleOff}`, onClick: toggleShuffle });
  const removeOnPlayBtn = createButton({
   className: "remove-on-play-btn",
   iconClass: "fas fa-trash-list",
   title: musicPlayerState.userSettings.removeOnPlay
     ? config.languageLabels.removeOnPlayOn || "Çaldıktan sonra sil: Açık"
     : config.languageLabels.removeOnPlayOff || "Çaldıktan sonra sil: Kapalı",
   onClick: toggleRemoveOnPlayMode
 });

 if (musicPlayerState.userSettings.removeOnPlay) {
   removeOnPlayBtn.innerHTML = '<i class="fas fa-trash-list" style="color:#e91e63"></i>';
 }
  const refreshBtn = createButton({ iconClass: "fas fa-sync-alt", title: config.languageLabels.refreshPlaylist, onClick: refreshPlaylist });

  const genreFilterBtn = createButton({
  className: "genre-filter-btn",
  iconClass: "fas fa-filter",
  title: config.languageLabels.filterByGenre || "Türe göre filtrele",
  onClick: showGenreFilterModal
  });
  const prevBtn = createButton({ iconClass: "fas fa-step-backward", title: config.languageLabels.previousTrack, onClick: playPrevious });
  const playPauseBtn = createButton({ className: "main", iconClass: "fas fa-play", title: config.languageLabels.playPause, onClick: togglePlayPause, id: "play-pause-btn" });
  const nextBtn = createButton({ iconClass: "fas fa-step-forward", title: config.languageLabels.nextTrack, onClick: playNext });
  const lyricsBtn = createButton({ iconClass: "fas fa-align-left", title: config.languageLabels.lyrics, onClick: toggleLyrics });
  const volumeBtn = createButton({ iconClass: "fas fa-volume-up", title: config.languageLabels.volume, onClick: toggleMute });

  const volumeSlider = Object.assign(document.createElement("input"), {
    type: "range",
    className: "player-volume-slider",
    min: "0",
    max: "1",
    step: "0.01",
    value: "1",
    title: config.languageLabels.volumeLevel,
  });

  volumeSlider.addEventListener('input', e => {
    const volume = parseFloat(e.target.value);
    const audio = musicPlayerState.audio;
    audio.volume = volume;
    audio.muted = false;
    musicPlayerState.userSettings.volume = volume;
    updateVolumeIcon(volume);
    saveUserSettings();
  });

  function updateVolumeIcon(volume) {
    let icon;
    if (volume === 0) icon = "fas fa-volume-mute";
    else if (volume < 0.5) icon = "fas fa-volume-down";
    else icon = "fas fa-volume-up";
    volumeBtn.innerHTML = `<i class="${icon}"></i>`;
  }

  const controls = document.createElement("div");
  controls.className = "player-controls";

  const controlElements = [prevBtn, playPauseBtn, nextBtn, repeatBtn, shuffleBtn, removeOnPlayBtn, refreshBtn, genreFilterBtn, lyricsBtn, topTracksBtn, volumeBtn];

  controlElements.forEach(btn => controls.appendChild(btn));
  controls.appendChild(volumeSlider);

  const progressContainer = document.createElement("div");
  progressContainer.className = "player-progress-container";

  const progressBar = document.createElement("div");
  progressBar.className = "player-progress-bar";

  const progress = document.createElement("div");
  progress.className = "player-progress";

  const progressHandle = document.createElement("div");
  progressHandle.className = "player-progress-handle";

  const timeContainer = document.createElement("div");
  timeContainer.className = "player-time-container";

  const currentTimeEl = document.createElement("span");
  currentTimeEl.className = "player-current-time";
  currentTimeEl.textContent = "0:00";

  const durationEl = document.createElement("span");
  durationEl.className = "player-duration";
  durationEl.textContent = "0:00";

  progressBar.append(progress, progressHandle);
  timeContainer.append(currentTimeEl, durationEl);
  progressContainer.append(progressBar, timeContainer);

  timeContainer.addEventListener("click", () => {
    musicPlayerState.showRemaining = !musicPlayerState.showRemaining;
    setupProgressControls();
  });

  const lyricsContainer = document.createElement("div");
  lyricsContainer.id = "player-lyrics-container";
  lyricsContainer.className = "lyrics-hidden";

  player.append(lyricsContainer, topControlsContainer, albumArt, nextTracksContainer, trackInfo, progressContainer, controls);
  document.body.appendChild(player);
  createPlaylistModal();

  Object.assign(musicPlayerState, {
    modernPlayer: player,
    albumArtEl: albumArt,
    modernTitleEl: titleText,
    modernArtistEl: artist,
    progressBar,
    progress,
    progressHandle,
    playPauseBtn,
    progressContainer,
    currentTimeEl,
    durationEl,
    lyricsContainer,
    lyricsBtn,
    volumeBtn,
    volumeSlider,
    nextTracksContainer,
    nextTracksList,
  });

  musicPlayerState.audio.volume = musicPlayerState.userSettings.volume || 0.7;
  setupProgressControls();
  loadUserSettings();
  setupArtistClickHandler();

  return { player, albumArt, title: titleContainer, artist, progressBar, progress, playPauseBtn, progressContainer, currentTimeEl, durationEl, volumeSlider, lyricsContainer, lyricsBtn };
}

export async function updateNextTracks() {
  const {
    nextTracksList,
    playlist,
    currentIndex,
    userSettings,
    nextTracksContainer,
    id3ImageCache = {},
    effectivePlaylist
  } = musicPlayerState;

  if (!nextTracksList || !playlist) return;

  nextTracksList.innerHTML = '';
  const nextTracksName = nextTracksContainer.querySelector('.next-tracks-name');

  if (userSettings.shuffle) {
    nextTracksName.textContent = config.languageLabels.rastgele || "Rastgele";
  } else {
    nextTracksName.textContent = config.languageLabels.sirada || "Sıradakiler";
  }

  nextTracksName?.classList.add('hidden');

  const maxNextTracks = 3;
  const nextIndices = [];

  if (userSettings.shuffle) {
    const availableIndices = [...Array(playlist.length).keys()]
      .filter(i => i !== currentIndex);

    while (nextIndices.length < Math.min(maxNextTracks, availableIndices.length)) {
      const randomIndex = Math.floor(Math.random() * availableIndices.length);
      const candidate = availableIndices[randomIndex];

      if (!nextIndices.includes(candidate)) {
        nextIndices.push(candidate);
      }
    }
  }
  else {
    for (let offset = 1; offset <= maxNextTracks; offset++) {
      if (playlist.length === 0) break;
      const idx = (currentIndex + offset) % playlist.length;
      nextIndices.push(idx);
    }
  }

  let addedCount = 0;
  for (const nextIndex of nextIndices) {
    const track = playlist[nextIndex];
    if (!track) continue;

    try {
      const trackElement = document.createElement('div');
      trackElement.className = 'next-track-item hidden';
      trackElement.dataset.trackId = track.Id;
      trackElement.dataset.trackIndex = nextIndex;
      trackElement.title = track.Name || config.languageLabels.unknownTrack;

      const coverElement = document.createElement('div');
      coverElement.className = 'next-track-cover';
      coverElement.style.backgroundImage = DEFAULT_ARTWORK;

      const imageUri = await getTrackImage(track, id3ImageCache);
      if (imageUri) {
        coverElement.style.backgroundImage = `url('${imageUri}')`;
      }
      coverElement.onclick = () => playTrack(nextIndex);

      const titleElement = document.createElement('div');
      titleElement.className = 'next-track-title';
      titleElement.textContent = track.Name || config.languageLabels.unknownTrack;
      titleElement.onclick = () => playTrack(nextIndex);

      trackElement.append(coverElement, titleElement);
      nextTracksList.appendChild(trackElement);

      setTimeout(() => {
        trackElement.classList.remove('hidden');
        trackElement.classList.add('visible');
      }, (addedCount + 1) * 200);

      addedCount++;
    } catch (error) {
      console.error(`Track #${nextIndex} yüklenirken hata:`, error);
    }
  }

  if (addedCount > 0) {
    setTimeout(() => {
      nextTracksName?.classList.remove('hidden');
      nextTracksName?.classList.add('visible');
    }, (addedCount + 1) * 200);
  }

  musicPlayerState.id3ImageCache = id3ImageCache;
}

async function getTrackImage(track, cache) {
  const trackId = track.Id;
  if (cache[trackId]) return cache[trackId];

  try {
    const tags = await readID3Tags(trackId);

    if (tags?.pictureUri) {
      cache[trackId] = tags.pictureUri;
      return tags.pictureUri;
    }
  } catch (e) {
    console.warn(`ID3 etiketi okunamadı (ID: ${trackId})`, e);
  }
  const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
  const imageId = track.AlbumId || trackId;
  if (imageTag) {
    return `/Items/${imageId}/Images/Primary?fillHeight=100&fillWidth=100&quality=80&tag=${imageTag}`;
  }

  return null;
}
