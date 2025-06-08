import { getLanguageLabels, getDefaultLanguage } from '../language/index.js';

const defaultConfig = {
  showLanguageInfo: true,
  muziklimit: 50,
  nextTrack: 50,
  albumlimit: 20,
  sarkilimit: 200,
  gruplimit: 200,
  id3limit: 10,
  historylimit: 10,
  playerTheme: 'dark',
  playerStyle: 'player',
  dateLocale: 'tr-TR',
  notificationsEnabled: 'false',
  maxExcludeIdsForUri: 100,
  useAlbumArtAsBackground: 'false',
  albumArtBackgroundBlur: 10,
  albumArtBackgroundOpacity: 0.5,
  defaultLanguage: getDefaultLanguage(),
  get languageLabels() {
    return getLanguageLabels(this.defaultLanguage);
  }
};

export function getConfig() {
  return {
    ...defaultConfig,
    showLanguageInfo: localStorage.getItem('showLanguageInfo') !== 'false',
    defaultLanguage: localStorage.getItem('defaultLanguage') || defaultConfig.defaultLanguage,
    muziklimit: parseInt(localStorage.getItem('muziklimit'), 10) || defaultConfig.muziklimit,
    nextTrack: parseInt(localStorage.getItem('nextTrack'), 10) || defaultConfig.nextTrack,
    albumlimit: parseInt(localStorage.getItem('albumlimit'), 10) || defaultConfig.albumlimit,
    sarkilimit: parseInt(localStorage.getItem('sarkilimit'), 10) || defaultConfig.sarkilimit,
    gruplimit: parseInt(localStorage.getItem('gruplimit'), 10) || defaultConfig.gruplimit,
    id3limit: parseInt(localStorage.getItem('id3limit'), 10) || defaultConfig.id3limit,
    historylimit: parseInt(localStorage.getItem('historylimit'), 10) || defaultConfig.historylimit,
    playerTheme: localStorage.getItem('playerTheme') || defaultConfig.playerTheme,
    playerStyle: localStorage.getItem('playerStyle') || defaultConfig.playerStyle,
    dateLocale: localStorage.getItem('dateLocale') || 'tr-TR',
    maxExcludeIdsForUri: parseInt(localStorage.getItem('maxExcludeIdsForUri'), 10) || defaultConfig.maxExcludeIdsForUri,
    notificationsEnabled: localStorage.getItem('notificationsEnabled') !== 'false',
    useAlbumArtAsBackground: localStorage.getItem('useAlbumArtAsBackground') === 'true',
    albumArtBackgroundBlur: (() => {
      const v = localStorage.getItem('albumArtBackgroundBlur');
      return v !== null ? parseInt(v, 10) : 10;
    })(),
    albumArtBackgroundOpacity: (() => {
      const v = localStorage.getItem('albumArtBackgroundOpacity');
      return v !== null ? parseFloat(v) : 0.5;
    })(),
  };
}

export function updateConfig(newConfig) {
  if (newConfig.showLanguageInfo !== undefined) {
    localStorage.setItem('showLanguageInfo', newConfig.showLanguageInfo);
  }

  if (newConfig.muziklimit !== undefined) {
    localStorage.setItem('muziklimit', newConfig.muziklimit);
  }

  if (newConfig.albumlimit !== undefined) {
    localStorage.setItem('albumlimit', newConfig.albumlimit);
  }

  if (newConfig.nextTrack !== undefined) {
    localStorage.setItem('nextTrack', newConfig.nextTrack);
  }

  if (newConfig.sarkilimit !== undefined) {
    localStorage.setItem('sarkilimit', newConfig.sarkilimit);
  }

  if (newConfig.gruplimit !== undefined) {
    localStorage.setItem('gruplimit', newConfig.gruplimit);
  }

  if (newConfig.id3limit !== undefined) {
    localStorage.setItem('id3limit', newConfig.id3limit);
  }

  if (newConfig.historylimit !== undefined) {
    localStorage.setItem('historylimit', newConfig.historylimit);
  }

  if (newConfig.defaultLanguage !== undefined) {
    localStorage.setItem('defaultLanguage', newConfig.defaultLanguage);
  }

  if (newConfig.playerTheme !== undefined) {
    localStorage.setItem('playerTheme', newConfig.playerTheme);
  }

  if (newConfig.playerStyle !== undefined) {
    localStorage.setItem('playerStyle', newConfig.playerStyle);
  }

  if (newConfig.dateLocale !== undefined) {
    localStorage.setItem('dateLocale', newConfig.dateLocale);
  }

   if (newConfig.maxExcludeIdsForUri !== undefined) {
    localStorage.setItem('maxExcludeIdsForUri', newConfig.maxExcludeIdsForUri);
  }

  if (newConfig.notificationsEnabled !== undefined) {
    localStorage.setItem('notificationsEnabled', newConfig.notificationsEnabled);
  }

  if (newConfig.useAlbumArtAsBackground !== undefined) {
    localStorage.setItem('useAlbumArtAsBackground', newConfig.useAlbumArtAsBackground);
  }

  if (newConfig.albumArtBackgroundBlur !== undefined) {
    localStorage.setItem('albumArtBackgroundBlur', newConfig.albumArtBackgroundBlur);
  }

  if (newConfig.albumArtBackgroundOpacity !== undefined) {
    localStorage.setItem('albumArtBackgroundOpacity', newConfig.albumArtBackgroundOpacity);
  }

  const configUpdatedEvent = new CustomEvent('configUpdated', {
    detail: getConfig()
  });
  window.dispatchEvent(configUpdatedEvent);
}

window.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('configUpdated', (e) => {
    console.log('Config güncellendi:', e.detail);
  });
});
