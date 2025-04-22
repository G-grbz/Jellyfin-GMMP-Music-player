import { getLanguageLabels, getDefaultLanguage } from '../language/index.js';

const defaultConfig = {
  showLanguageInfo: true,
  muziklimit: 30,
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
    muziklimit: parseInt(localStorage.getItem('muziklimit'), 10) || defaultConfig.muziklimit
  };
}

export function updateConfig(newConfig) {
  if (newConfig.showLanguageInfo !== undefined) {
    localStorage.setItem('showLanguageInfo', newConfig.showLanguageInfo);
  }

  if (newConfig.muziklimit !== undefined) {
    localStorage.setItem('muziklimit', newConfig.muziklimit);
  }

  if (newConfig.defaultLanguage !== undefined) {
    localStorage.setItem('defaultLanguage', newConfig.defaultLanguage);
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
