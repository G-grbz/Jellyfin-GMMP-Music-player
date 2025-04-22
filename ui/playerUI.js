import { createPlaylistModal } from "./playlistModal.js";
import { musicPlayerState, loadUserSettings, saveUserSettings } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { togglePlayPause, playPrevious, playNext } from "../player/playback.js";
import { updateProgress, setupProgressControls } from "../player/progress.js";
import { toggleLyrics } from "../lyrics/lyrics.js";
import { toggleMute, changeVolume } from "./controls.js";
import { togglePlaylistModal } from "./playlistModal.js";
import { toggleRepeatMode, toggleShuffle } from "./controls.js";
import { showNotification } from "./notification.js";
import { refreshPlaylist } from "../core/playlist.js";
import { initSettings } from '../core/settings.js';
import { showJellyfinPlaylistsModal } from '../core/jellyfinPlaylists.js';
import { togglePlayerVisibility } from '../utils/mainIndex.js';

const config = getConfig();

export function createModernPlayerUI() {
  const player = document.createElement("div");
  player.id = "modern-music-player";
  player.setAttribute('role', 'region');
  player.setAttribute('aria-label', 'Music Player');
  player.setAttribute('aria-hidden', 'true');

  const topControlsContainer = document.createElement("div");
  topControlsContainer.className = "top-controls-container";

  const jellyfinPlaylistBtn = document.createElement("div");
  jellyfinPlaylistBtn.className = "jplaylist-btn";
  jellyfinPlaylistBtn.innerHTML = '<i class="fas fa-list-music"></i>';
  jellyfinPlaylistBtn.title = config.languageLabels.jellyfinPlaylists || "Jellyfin Oynatma Listesi";
  jellyfinPlaylistBtn.onclick = showJellyfinPlaylistsModal;

  const playlistBtn = document.createElement("div");
  playlistBtn.className = "playlist-btn";
  playlistBtn.innerHTML = '<i class="fas fa-list"></i>';
  playlistBtn.title = config.languageLabels.playlist;
  playlistBtn.onclick = togglePlaylistModal;

  const settingsLink = document.createElement("div");
  settingsLink.className = "settingsLink";
  settingsLink.innerHTML = '<i class="fas fa-cog"></i>';
  settingsLink.title = config.languageLabels.settings || "Settings";
  settingsLink.href = "#";
  settingsLink.onclick = (e) => {
    e.preventDefault();
    const settings = initSettings();
    settings.open();
  };

  const closeBtn = document.createElement("div");
  closeBtn.className = "kapat-buton";
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.title = config.languageLabels.close || "Close";
  closeBtn.onclick = togglePlayerVisibility;

  topControlsContainer.appendChild(playlistBtn);
  topControlsContainer.appendChild(jellyfinPlaylistBtn);
  topControlsContainer.appendChild(settingsLink);
  topControlsContainer.appendChild(closeBtn);


  const albumArt = document.createElement("div");
  albumArt.id = "player-album-art";

  const trackInfo = document.createElement("div");
  trackInfo.className = "player-track-info";

  const title = document.createElement("div");
  title.id = "player-track-title";
  title.textContent = config.languageLabels.noSongSelected;

  const artist = document.createElement("div");
  artist.id = "player-track-artist";
  artist.textContent = config.languageLabels.artistUnknown;

  trackInfo.appendChild(title);
  trackInfo.appendChild(artist);


  const repeatBtn = document.createElement("button");
  repeatBtn.className = "player-btn";
  repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
  repeatBtn.title = config.languageLabels.repeatModOff;
  repeatBtn.onclick = toggleRepeatMode;

  const shuffleBtn = document.createElement("button");
  shuffleBtn.className = "player-btn";
  shuffleBtn.innerHTML = '<i class="fas fa-random"></i>';
  shuffleBtn.title = `${config.languageLabels.repeatMod}: ${config.languageLabels.shuffleOne}`;
  shuffleBtn.onclick = toggleShuffle;

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "player-btn";
  refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
  refreshBtn.title = config.languageLabels.refreshPlaylist;
  refreshBtn.onclick = refreshPlaylist;

  const prevBtn = document.createElement("button");
  prevBtn.className = "player-btn";
  prevBtn.innerHTML = '<i class="fas fa-step-backward"></i>';
  prevBtn.title = config.languageLabels.previousTrack;
  prevBtn.onclick = playPrevious;

  const playPauseBtn = document.createElement("button");
  playPauseBtn.className = "player-btn main";
  playPauseBtn.id = "play-pause-btn";
  playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
  playPauseBtn.title = config.languageLabels.playPause;
  playPauseBtn.onclick = togglePlayPause;

  const nextBtn = document.createElement("button");
  nextBtn.className = "player-btn";
  nextBtn.innerHTML = '<i class="fas fa-step-forward"></i>';
  nextBtn.title = config.languageLabels.nextTrack;
  nextBtn.onclick = playNext;

  const lyricsBtn = document.createElement("button");
  lyricsBtn.className = "player-btn";
  lyricsBtn.innerHTML = '<i class="fas fa-align-left"></i>';
  lyricsBtn.title = config.languageLabels.lyrics;
  lyricsBtn.onclick = toggleLyrics;

  const volumeBtn = document.createElement("button");
  volumeBtn.className = "player-btn";
  volumeBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
  volumeBtn.title = config.languageLabels.volume;
  volumeBtn.addEventListener("click", toggleMute);

  const volumeSlider = document.createElement("input");
  volumeSlider.type = "range";
  volumeSlider.className = "player-volume-slider";
  volumeSlider.min = "0";
  volumeSlider.max = "1";
  volumeSlider.step = "0.01";
  volumeSlider.value = "1";
  volumeSlider.title = config.languageLabels.volumeLevel;
  volumeSlider.addEventListener('input', (e) => {
  const volume = parseFloat(e.target.value);
  musicPlayerState.audio.volume = volume;
  musicPlayerState.userSettings.volume = volume;
  musicPlayerState.audio.muted = false;
  updateVolumeIcon(volume);
  saveUserSettings();
});

  function updateVolumeIcon(volume) {
  let icon;
  if (volume === 0) {
    icon = '<i class="fas fa-volume-mute"></i>';
  } else if (volume < 0.5) {
    icon = '<i class="fas fa-volume-down"></i>';
  } else {
    icon = '<i class="fas fa-volume-up"></i>';
  }
  musicPlayerState.volumeBtn.innerHTML = icon;
}

  const controls = document.createElement("div");
  controls.className = "player-controls";

  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  if (isMobile) {
    controls.style.gridColumn = "1 / -1";
    controls.style.overflowX = "auto";
    controls.style.padding = "5px 0";
    controls.style.scrollSnapType = "x mandatory";
    controls.style.webkitOverflowScrolling = "touch";

    const scrollableControls = document.createElement("div");
    scrollableControls.style.display = "flex";
    scrollableControls.style.gap = "5px";
    scrollableControls.style.padding = "0 10px";

    [
      repeatBtn,
      shuffleBtn,
      refreshBtn,
      prevBtn,
      playPauseBtn,
      nextBtn,
      lyricsBtn,
      volumeBtn,
    ].forEach(btn => {
      btn.style.flexShrink = "0";
      btn.style.scrollSnapAlign = "center";
      scrollableControls.appendChild(btn);
    });

    volumeSlider.style.display = "none";
    controls.appendChild(scrollableControls);
  } else {
    controls.appendChild(repeatBtn);
    controls.appendChild(shuffleBtn);
    controls.appendChild(refreshBtn);
    controls.appendChild(prevBtn);
    controls.appendChild(playPauseBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(lyricsBtn);
    controls.appendChild(volumeBtn);
    controls.appendChild(volumeSlider);
  }

  const progressContainer = document.createElement("div");
  progressContainer.className = "player-progress-container";

  const progressBar = document.createElement("div");
  progressBar.className = "player-progress-bar";

  const progress = document.createElement("div");
  progress.className = "player-progress";

  const timeContainer = document.createElement("div");
  timeContainer.className = "player-time-container";

  const progressHandle = document.createElement('div');
  progressHandle.className = 'player-progress-handle';

  const currentTimeEl = document.createElement("span");
  currentTimeEl.className = "player-current-time";
  currentTimeEl.textContent = "0:00";

  const durationEl = document.createElement("span");
  durationEl.className = "player-duration";
  durationEl.textContent = "0:00";

  progressBar.appendChild(progress);
  progressBar.appendChild(progressHandle);
  timeContainer.appendChild(currentTimeEl);
  timeContainer.appendChild(durationEl);
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(timeContainer);

  const lyricsContainer = document.createElement("div");
  lyricsContainer.id = "player-lyrics-container";
  lyricsContainer.className = "lyrics-hidden";

  player.appendChild(lyricsContainer);
  player.appendChild(topControlsContainer);
  player.appendChild(albumArt);
  player.appendChild(trackInfo);
  player.appendChild(progressContainer);
  player.appendChild(controls);
  document.body.appendChild(player);
  createPlaylistModal();

  musicPlayerState.modernPlayer = player;
  musicPlayerState.albumArtEl = albumArt;
  musicPlayerState.modernTitleEl = title;
  musicPlayerState.modernArtistEl = artist;
  musicPlayerState.progressBar = progressBar;
  musicPlayerState.progress = progress;
  musicPlayerState.progressHandle = progressHandle;
  musicPlayerState.playPauseBtn = playPauseBtn;
  musicPlayerState.progressContainer = progressContainer;
  musicPlayerState.currentTimeEl = currentTimeEl;
  musicPlayerState.durationEl = durationEl;
  musicPlayerState.lyricsContainer = lyricsContainer;
  musicPlayerState.lyricsBtn = lyricsBtn;
  musicPlayerState.volumeBtn = volumeBtn;
  musicPlayerState.volumeSlider = volumeSlider;
  musicPlayerState.audio.volume = musicPlayerState.userSettings.volume || 0.7;

  setupProgressControls();
  loadUserSettings();

    function updateProgress(currentTime, duration) {
  const percent = (currentTime / duration) * 100;
  progress.style.width = `${percent}%`;
  progressHandle.style.left = `${percent}%`;
}

  return {
    player,
    albumArt,
    title,
    artist,
    progressBar,
    progress,
    playPauseBtn,
    progressContainer,
    currentTimeEl,
    durationEl,
    volumeSlider,
    lyricsContainer,
    lyricsBtn
  };
}
