import { musicPlayerState, saveUserSettings } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { showNotification } from "./notification.js";
import { shuffleArray } from "../utils/domUtils.js";
import { updatePlaylistModal } from "./playlistModal.js";
import { playNext, playPrevious, togglePlayPause } from '../player/playback.js';

const config = getConfig();

function areVolumeControlsReady() {
  return (
    musicPlayerState.audio &&
    musicPlayerState.volumeBtn &&
    musicPlayerState.volumeSlider
  );
}

export function updateVolumeIcon(volume) {
  if (!musicPlayerState.volumeBtn) return;

  let icon;
  if (volume === 0 || musicPlayerState.audio.muted) {
    icon = '<i class="fas fa-volume-mute"></i>';
  } else if (volume < 0.5) {
    icon = '<i class="fas fa-volume-down"></i>';
  } else {
    icon = '<i class="fas fa-volume-up"></i>';
  }
  musicPlayerState.volumeBtn.innerHTML = icon;
}

function updateVolumeUI(volume, isMuted = false) {
  if (!areVolumeControlsReady()) {
    console.warn('Ses kontrolleri güncelleme için hazır değil');
    return;
  }

  updateVolumeIcon(volume);
  musicPlayerState.volumeSlider.value = volume;

  showNotification(
  `${config.languageLabels.volume || 'Ses seviyesi'}: ${Math.round(volume * 100)}%`,
  1500,
  'volume'
);
}

export function toggleMute() {
  const { audio, volumeBtn, volumeSlider } = musicPlayerState;

  if (!audio || !volumeBtn || !volumeSlider) {
    console.error('Ses kontrolleri başlatılamadı');
    showNotification('Ses kontrolleri yüklenemedi');
    return;
  }

  audio.muted = !audio.muted;

  if (audio.muted) {
    volumeSlider.dataset.lastVolume = volumeSlider.value;
    volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    showNotification(config.languageLabels.volOff || 'Ses kapatıldı', 1500, 'volume');
  } else {
    const newVolume = parseFloat(volumeSlider.dataset.lastVolume) || 0.7;
    audio.volume = newVolume;
    volumeSlider.value = newVolume;
    updateVolumeUI(newVolume);
  }

  saveUserSettings();
}

export function changeVolume(delta) {
  if (!areVolumeControlsReady()) {
    console.error('Ses kontrolleri başlatılamadı');
    return;
  }

  const { audio, volumeSlider } = musicPlayerState;
  const currentVolume = audio.volume;
  const newVolume = Math.min(1, Math.max(0, currentVolume + delta));

  audio.volume = newVolume;
  musicPlayerState.userSettings.volume = newVolume;

  if (newVolume > 0 && audio.muted) {
    audio.muted = false;
  }

  updateVolumeUI(newVolume);
  saveUserSettings();
}

export function setupVolumeControls() {
  if (!musicPlayerState.volumeSlider) {
    console.warn('Ses kaydırıcısı bulunamadı');
    return;
  }

  musicPlayerState.volumeSlider.addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value);
    musicPlayerState.audio.volume = volume;
    musicPlayerState.userSettings.volume = volume;
    musicPlayerState.audio.muted = false;

    updateVolumeUI(volume);
    saveUserSettings();
  });
}

export function toggleRepeatMode() {
  const modes = ['none', 'one', 'all'];
  const currentIndex = modes.indexOf(musicPlayerState.userSettings.repeatMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  musicPlayerState.userSettings.repeatMode = modes[nextIndex];

  const repeatBtn = document.querySelector('.player-btn .fa-repeat, .player-btn .fa-repeat-1')?.parentElement;
  if (!repeatBtn) {
    console.warn('Tekrar butonu bulunamadı');
    return;
  }

  const titles = {
    'none': config.languageLabels?.repeatModOff || 'Tekrar kapalı',
    'one': config.languageLabels?.repeatModOne || 'Tek şarkı tekrarı',
    'all': config.languageLabels?.repeatModAll || 'Tüm liste tekrarı'
  };

  const notificationMessages = {
    'none': `${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModOff || 'kapalı'}`,
    'one': `${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModOne || 'tek şarkı'}`,
    'all': `${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModAll || 'tüm liste'}`,
  };

  let iconClass = 'fa-repeat';
  if (musicPlayerState.userSettings.repeatMode === 'one') {
    iconClass = 'fa-repeat-1';
  }

  const isActive = musicPlayerState.userSettings.repeatMode !== 'none';
  repeatBtn.title = titles[musicPlayerState.userSettings.repeatMode];
  repeatBtn.innerHTML = `<i class="fas ${iconClass}" style="${isActive ? 'color:#e91e63' : ''}"></i>`;

  showNotification(
    notificationMessages[musicPlayerState.userSettings.repeatMode],
    1500,
    'repeat'
  );
  saveUserSettings();
}


export function toggleShuffle() {
  if (!musicPlayerState || !musicPlayerState.userSettings) {
    console.error('Müzik çalar durumu veya kullanıcı ayarları yüklenmedi');
    return;
  }

  const newShuffleState = !musicPlayerState.userSettings.shuffle;
  musicPlayerState.userSettings.shuffle = newShuffleState;

  const shuffleBtn = document.querySelector('.player-btn .fa-random')?.parentElement;
  if (!shuffleBtn) {
    console.warn('Karıştırma butonu bulunamadı');
    return;
  }

  const titles = {
    true: config.languageLabels?.shuffleOn || 'Karıştırma açık',
    false: config.languageLabels?.shuffleOff || 'Karıştırma kapalı'
  };

  const notificationMessages = {
    true: `${config.languageLabels?.shuffle || 'Karıştırma'}: ${config.languageLabels?.shuffleOn || 'açık'}`,
    false: `${config.languageLabels?.shuffle || 'Karıştırma'}: ${config.languageLabels?.shuffleOff || 'kapalı'}`
  };

  shuffleBtn.title = titles[newShuffleState];
  shuffleBtn.innerHTML = newShuffleState
    ? '<i class="fas fa-random" style="color:#e91e63"></i>'
    : '<i class="fas fa-random"></i>';

  const currentTrackId = musicPlayerState.currentIndex !== -1
    ? musicPlayerState.playlist[musicPlayerState.currentIndex]?.Id
    : null;

  if (newShuffleState) {
    musicPlayerState.playlist = shuffleArray([...musicPlayerState.originalPlaylist]);
  } else {
    musicPlayerState.playlist = [...musicPlayerState.originalPlaylist];
    if (currentTrackId) {
      const originalIndex = musicPlayerState.originalPlaylist.findIndex(track => track.Id === currentTrackId);
      if (originalIndex !== -1) {
        musicPlayerState.currentIndex = originalIndex;
      }
    }
  }

  if (newShuffleState && currentTrackId) {
    const newIndex = musicPlayerState.playlist.findIndex(track => track.Id === currentTrackId);
    if (newIndex !== -1) {
      musicPlayerState.currentIndex = newIndex;
    }
  }

  showNotification(
  notificationMessages[newShuffleState],
  1500,
  'shuffle'
);
  updatePlaylistModal();
  saveUserSettings();
}

function createKeyboardHelpModal() {
  if (document.querySelector('#keyboardHelpModal')) return;

  const modal = document.createElement('div');
  modal.id = 'keyboardHelpModal';
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.background = '#222';
  modal.style.color = '#fff';
  modal.style.padding = '20px';
  modal.style.borderRadius = '10px';
  modal.style.zIndex = '9999';
  modal.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
  modal.style.fontSize = '14px';
  modal.style.maxWidth = '400px';
  modal.style.lineHeight = '1.6';
  modal.style.display = 'none';

  modal.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:10px;">🎹 Klavye Kısayolları</h3>
    <ul style="list-style:none;padding-left:0;">
      <li><b>↑</b> veya <b>+</b>: Sesi artır</li>
      <li><b>↓</b> veya <b>-</b>: Sesi azalt</li>
      <li><b>M</b>: Sesi aç/kapat</li>
      <li><b>S</b>: Karıştırma modunu değiştir</li>
      <li><b>R</b>: Tekrar modunu değiştir</li>
      <li><b>←</b>: Önceki parça</li>
      <li><b>→</b>: Sonraki parça</li>
      <li><b>?</b>: Yardımı aç/kapat</li>
      <li><b>Esc</b>: Yardımı kapat</li>
    </ul>
  `;
  document.body.appendChild(modal);
}

function toggleKeyboardHelpModal() {
  const modal = document.querySelector('#keyboardHelpModal');
  if (!modal) return;

  const isVisible = modal.style.display === 'block';
  modal.style.display = isVisible ? 'none' : 'block';
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'arrowup':
    case '+':
      e.preventDefault();
      changeVolume(0.05);
      break;

    case 'arrowdown':
    case '-':
      e.preventDefault();
      changeVolume(-0.05);
      break;

    case '?':
      e.preventDefault();
      toggleKeyboardHelpModal();
      break;

    case 'escape':
      e.preventDefault();
      const modal = document.querySelector('#keyboardHelpModal');
      if (modal) modal.style.display = 'none';
      break;

    case 'm':
      e.preventDefault();
      toggleMute();
      break;

    case 's':
      e.preventDefault();
      toggleShuffle();
      break;

    case 'r':
      e.preventDefault();
      toggleRepeatMode();
      break;

    case 'arrowright':
      e.preventDefault();
      playNext();
      break;

    case 'arrowleft':
      e.preventDefault();
      playPrevious();
      break;

    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;

    default:
      break;
  }
});

createKeyboardHelpModal();

