import { getLanguageLabels, getDefaultLanguage } from './index.js';

let translations = getLanguageLabels(getDefaultLanguage());

function applyTranslations() {
  document.querySelectorAll("[data-translate]").forEach(element => {
    const key = element.getAttribute("data-translate");
    const keys = key.split('.');
    let translation = translations;

    keys.forEach(k => {
      if (translation && translation[k]) {
        translation = translation[k];
      } else {
        translation = null;
      }
    });

    if (translation) {
      element.textContent = translation;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
});

document.getElementById('defaultLanguageSelect').addEventListener('change', (event) => {
  const selectedLanguage = event.target.value;
  localStorage.setItem('defaultLanguage', selectedLanguage);
  translations = getLanguageLabels(selectedLanguage);
  applyTranslations();
});
