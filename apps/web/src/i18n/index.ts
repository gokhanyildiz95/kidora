import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './tr';
import en from './en';

function savedLanguage(): string {
  try {
    return localStorage.getItem('kidora.lang') ?? 'tr';
  } catch {
    return 'tr';
  }
}

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: savedLanguage(),
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'tr' | 'en') {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('kidora.lang', lang);
  } catch {
    // storage may be unavailable (private mode); the choice just won't persist
  }
}

export default i18n;
