import { getConfig } from "./configLoader.js";
import { updateVolumeIcon } from "../ui/controls.js";

const config = getConfig();

export const musicPlayerState = {
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
  showRemaining: false,
  selectionMode: false,
  selectedItems: [],
  userAddedTracks: [],
  combinedPlaylist: [],
  isUserModified: false,
  effectivePlaylist: [],
  onTrackChanged: [],
  isShuffled: false,
  audio: (() => {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';


  function fadeAudio(audio, fromVolume, toVolume, duration) {
  const steps = 30;
  const interval = duration / steps;
  let currentStep = 0;

  const volumeStep = (toVolume - fromVolume) / steps;
  audio.volume = fromVolume;

  return new Promise(resolve => {
    const fade = setInterval(() => {
      currentStep++;
      audio.volume = Math.min(Math.max(audio.volume + volumeStep, 0), 1);
      if (currentStep >= steps) {
        clearInterval(fade);
        resolve();
      }
    }, interval * 1000);
  });
}


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
      const parsedSettings = JSON.parse(savedSettings);
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (typeof parsedSettings.shuffle === 'string') {
        parsedSettings.shuffle = parsedSettings.shuffle === 'true';
      }

      musicPlayerState.userSettings = {
        ...musicPlayerState.userSettings,
        ...parsedSettings
      };

      if (!['none', 'one', 'all'].includes(musicPlayerState.userSettings.repeatMode)) {
        musicPlayerState.userSettings.repeatMode = 'none';
      }

      musicPlayerState.audio.volume = musicPlayerState.userSettings.volume;
      if (musicPlayerState.volumeSlider) {
        musicPlayerState.volumeSlider.value = musicPlayerState.userSettings.volume;
      }

      updateRepeatButtonUI();
      updateShuffleButtonUI();

    } catch (e) {
      console.error('Ayarlar yüklenirken hata:', e);
    }
  }
  saveUserSettings();
}

function updateRepeatButtonUI() {
  const repeatBtn = document.querySelector('.player-btn .fa-repeat')?.parentElement;
  if (!repeatBtn) return;

  const titles = {
    'none': config.languageLabels?.repeatModOff || 'Tekrar kapalı',
    'one': config.languageLabels?.repeatModOne || 'Tek şarkı tekrarı',
    'all': config.languageLabels?.repeatModAll || 'Tüm liste tekrarı'
  };

  repeatBtn.title = titles[musicPlayerState.userSettings.repeatMode];
  repeatBtn.innerHTML = musicPlayerState.userSettings.repeatMode === 'none' ?
    '<i class="fas fa-repeat"></i>' :
    `<i class="fas fa-repeat" style="color:#e91e63"></i>`;
}

function updateShuffleButtonUI() {
  const shuffleBtn = document.querySelector('.player-btn .fa-random')?.parentElement;
  if (!shuffleBtn) return;

  const titles = {
    true: config.languageLabels?.shuffleOn || 'Karıştırma açık',
    false: config.languageLabels?.shuffleOff || 'Karıştırma kapalı'
  };

  shuffleBtn.title = titles[musicPlayerState.userSettings.shuffle];
  shuffleBtn.innerHTML = musicPlayerState.userSettings.shuffle ?
    '<i class="fas fa-random" style="color:#e91e63"></i>' :
    '<i class="fas fa-random"></i>';
}

export function saveUserSettings() {
  localStorage.setItem('musicPlayerSettings', JSON.stringify(musicPlayerState.userSettings));
}
