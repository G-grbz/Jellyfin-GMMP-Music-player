import { getLanguageLabels, getDefaultLanguage } from '../language/index.js';

const defaultConfig = {
  showLanguageInfo: true,
  muziklimit: 50,
  albumlimit: 20,
  sarkilimit: 200,
  gruplimit: 200,
  id3limit: 10,
  historylimit: 10,
  playerTheme: 'dark',
  playerStyle: 'player',
  dateLocale: 'tr-TR',
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
    albumlimit: parseInt(localStorage.getItem('albumlimit'), 10) || defaultConfig.albumlimit,
    sarkilimit: parseInt(localStorage.getItem('sarkilimit'), 10) || defaultConfig.sarkilimit,
    gruplimit: parseInt(localStorage.getItem('gruplimit'), 10) || defaultConfig.gruplimit,
    id3limit: parseInt(localStorage.getItem('id3limit'), 10) || defaultConfig.id3limit,
    historylimit: parseInt(localStorage.getItem('historylimit'), 10) || defaultConfig.historylimit,
    playerTheme: localStorage.getItem('playerTheme') || defaultConfig.playerTheme,
    playerStyle: localStorage.getItem('playerStyle') || defaultConfig.playerStyle,
    dateLocale: localStorage.getItem('dateLocale') || 'tr-TR',
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
