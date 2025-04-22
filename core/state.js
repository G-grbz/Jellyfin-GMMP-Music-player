import { getConfig } from "./configLoader.js";
import { updateVolumeIcon } from "../ui/controls.js";

const config = getConfig();

export const musicPlayerState = {
  audio: new Audio(),
  playlist: [],
  originalPlaylist: [],
  currentIndex: 0,
  isPlayerVisible: false,
  modernPlayer: null,
  albumArtEl: document.querySelector('#player-album-art'),
  currentArtwork: null,
  volumeBtn: null,
  modernTitleEl: null,
  modernArtistEl: null,
  playPauseBtn: null,
  progressContainer: null,
  progressBar: null,
  currentTrackName: null,
  progress: null,
  currentTimeEl: null,
  durationEl: null,
  playlistSource: null,
  currentPlaylistId: null,
  volumeSlider: null,
  playlistModal: null,
  playlistItemsContainer: null,
  lyricsContainer: null,
  lyricsBtn: null,
  lyricsActive: false,
  currentLyrics: [],
  lyricsCache: {},
  metaWrapper: null,
  metaContainer: null,
  mediaSession: null,
  id3TagsCache: {},
  audio: (() => {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';

  audio.addEventListener('play', () => {
    if (musicPlayerState.playPauseBtn) {
      musicPlayerState.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
  });

  audio.addEventListener('pause', () => {
    if (musicPlayerState.playPauseBtn) {
      musicPlayerState.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  });

  audio.addEventListener('volumechange', () => {
    if (musicPlayerState.volumeBtn && musicPlayerState.volumeSlider) {
      const volume = audio.muted ? 0 : audio.volume;
      musicPlayerState.volumeSlider.value = volume;
      updateVolumeIcon(volume);
    }
  });

  return audio;
})(),
  userSettings: {
    volume: 0.7,
    repeatMode: 'none',
    shuffle: false,
    crossfade: false
  },
  syncedLyrics: {
    lines: [],
    currentLine: -1
  },
  offlineCache: {
    enabled: true,
    lyrics: {},
    artwork: {}
  }
};

export function loadUserSettings() {
  const savedSettings = localStorage.getItem('musicPlayerSettings');
  if (savedSettings) {
    try {
      musicPlayerState.userSettings = {
        ...musicPlayerState.userSettings,
        ...JSON.parse(savedSettings)
      };
      musicPlayerState.audio.volume = musicPlayerState.userSettings.volume;
      if (musicPlayerState.volumeSlider) {
        musicPlayerState.volumeSlider.value = musicPlayerState.userSettings.volume;
      }
    } catch (e) {
      console.error('Ayarlar yüklenirken hata:', e);
    }
  }
}

export function saveUserSettings() {
  localStorage.setItem('musicPlayerSettings', JSON.stringify(musicPlayerState.userSettings));
}
