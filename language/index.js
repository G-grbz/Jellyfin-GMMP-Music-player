import { languageLabels as turLabels } from './tur.js';
import { languageLabels as engLabels } from './eng.js';
import { languageLabels as deuLabels } from './deu.js';
import { languageLabels as fraLabels } from './fre.js';
import { languageLabels as rusLabels } from './rus.js';

export function getLanguageLabels(lang) {
  switch (lang) {
    case 'eng':
      return engLabels;
    case 'deu':
      return deuLabels;
    case 'fre':
      return fraLabels;
    case 'rus':
      return rusLabels;
    case 'tur':
    default:
      return turLabels;
  }
}

export function getDefaultLanguage() {
  return localStorage.getItem('defaultLanguage') || 'tur';
}
