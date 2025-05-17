import { musicPlayerState, saveUserSettings } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { showNotification } from "./notification.js";
import { shuffleArray } from "../utils/domUtils.js";
import { updatePlaylistModal } from "./playlistModal.js";
import { playNext, playPrevious, togglePlayPause } from '../player/playback.js';
import { updateNextTracks } from "./playerUI.js";
import { togglePlayerVisibility } from "../utils/mainIndex.js";

const config = getConfig();

let keyboardControlsActive = false;
let keyboardHandler = null;

function areVolumeControlsReady() {
  return (
    musicPlayerState.audio &&
    musicPlayerState.volumeBtn &&
    musicPlayerState.volumeSlider
  );
}

export function enableKeyboardControls() {
  if (keyboardControlsActive) return;

  keyboardHandler = (e) => handleKeyPress(e);
  document.addEventListener('keydown', keyboardHandler);
  keyboardControlsActive = true;
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

  let icon = '<i class="fas fa-volume-up"></i>';
  if (volume === 0 || musicPlayerState.audio.muted || isMuted) {
    icon = '<i class="fas fa-volume-mute"></i>';
  } else if (volume < 0.5) {
    icon = '<i class="fas fa-volume-down"></i>';
  }

  showNotification(
    `${icon} ${config.languageLabels.volume || 'Ses seviyesi'}: ${Math.round(volume * 100)}%`,
    2000,
    'kontrol'
  );
}

export function toggleMute() {
  const { audio, volumeBtn, volumeSlider } = musicPlayerState;

  if (!audio || !volumeBtn || !volumeSlider) {
    console.error('Ses kontrolleri başlatılamadı');
    showNotification('<i class="fas fa-volume-mute crossed-icon"></i> Ses kontrolleri yüklenemedi', 2000, 'error');
    return;
  }

  audio.muted = !audio.muted;

  if (audio.muted) {
    volumeSlider.dataset.lastVolume = volumeSlider.value;
    volumeBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    showNotification(
      `<i class="fas fa-volume-mute"></i> ${config.languageLabels.volOff || 'Ses kapatıldı'}`,
      2000,
      'kontrol'
    );
  } else {
    const newVolume = parseFloat(volumeSlider.dataset.lastVolume) || 0.7;
    audio.volume = newVolume;
    volumeSlider.value = newVolume;
    updateVolumeUI(newVolume);

    showNotification(
      `<i class="fas fa-volume-up"></i> ${config.languageLabels.volOn || 'Ses açıldı'}`,
      2000,
      'kontrol'
    );
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

  const mode = musicPlayerState.userSettings.repeatMode;

  const titles = {
    'none': config.languageLabels?.repeatModOff || 'Tekrar kapalı',
    'one': config.languageLabels?.repeatModOne || 'Tek şarkı tekrarı',
    'all': config.languageLabels?.repeatModAll || 'Tüm liste tekrarı'
  };

  const iconClass = mode === 'one' ? 'fa-repeat-1' : 'fa-repeat';
  const isActive = mode !== 'none';

  repeatBtn.title = titles[mode];
  repeatBtn.innerHTML = `<i class="fas ${iconClass}" style="${isActive ? 'color:#e91e63' : ''}"></i>`;

  const notificationMessages = {
    'none': `<i class="fas fa-repeat crossed-icon"></i> ${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModOff || 'kapalı'}`,
    'one': `<i class="fas fa-repeat-1"></i> ${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModOne || 'tek şarkı'}`,
    'all': `<i class="fas fa-repeat"></i> ${config.languageLabels?.repeatMod || 'Tekrar modu'}: ${config.languageLabels?.repeatModAll || 'tüm liste'}`
  };

  showNotification(
    notificationMessages[mode],
    2000,
    'kontrol'
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

  showNotification(
    newShuffleState
      ? `<i class="fas fa-random"></i> ${notificationMessages.true}`
      : `<i class="fas fa-random crossed-icon"></i> ${notificationMessages.false}`,
    1500,
    'kontrol'
  );

  updatePlaylistModal();
  saveUserSettings();
  updateNextTracks();
}

function createKeyboardHelpModal() {
  if (document.querySelector('#keyboardHelpModal')) return;

  const modal = document.createElement('div');
  modal.id = 'keyboardHelpModal';
  modal.style.display = 'none';

  modal.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:10px;">🎹 Klavye Kısayolları</h3>
    <ul style="list-style:none;padding-left:0;">
      <li><b>G</b>: Oynatıcıyı göster/gizle</li>
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

export function handleKeyPress(e) {
  if (!musicPlayerState.isPlayerVisible && e.key.toLowerCase() !== 'g') return;

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'g':
      e.preventDefault();
      togglePlayerVisibility();
      break;

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
}

createKeyboardHelpModal();

export function toggleRemoveOnPlayMode() {
  const setting = !musicPlayerState.userSettings.removeOnPlay;
  musicPlayerState.userSettings.removeOnPlay = setting;
  saveUserSettings();

  const btn = document.querySelector('.remove-on-play-btn');
  if (!btn) return;

  const onTitle  = config.languageLabels.removeOnPlayOn  || "Çaldıktan sonra sil: Açık";
  const offTitle = config.languageLabels.removeOnPlayOff || "Çaldıktan sonra sil: Kapalı";
  btn.title = setting ? onTitle : offTitle;

  btn.innerHTML = setting
    ? '<i class="fas fa-trash-list" style="color:#e91e63"></i>'
    : '<i class="fas fa-trash-list"></i>';

  const message = setting
    ? `<i class="fas fa-trash-list"></i> ${config.languageLabels.removeOnPlayOn || "Çaldıktan sonra sil modu açık"}`
    : `<i class="fas fa-trash-list crossed-icon"></i> ${config.languageLabels.removeOnPlayOff || "Çaldıktan sonra sil modu kapalı"}`;

  showNotification(message, 2000, 'kontrol');
}
