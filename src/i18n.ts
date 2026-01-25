import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';
import es from './locales/es.json';
import id from './locales/id.json';
import fa from './locales/fa.json';
import uk from './locales/uk.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      ar: { translation: ar },
      es: { translation: es },
      id: { translation: id },
      fa: { translation: fa },
      uk: { translation: uk }
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
