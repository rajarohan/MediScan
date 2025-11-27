import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Import language resources
import en from './locales/en.json';
import hi from './locales/hi.json';
import te from './locales/te.json';
import ta from './locales/ta.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import gu from './locales/gu.json';
import mr from './locales/mr.json';
import bn from './locales/bn.json';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  te: { translation: te },
  ta: { translation: ta },
  kn: { translation: kn },
  ml: { translation: ml },
  gu: { translation: gu },
  mr: { translation: mr },
  bn: { translation: bn },
};

// Get device language
const getDeviceLanguage = () => {
  const deviceLocale = Localization.locale;
  if (deviceLocale) {
    const languageCode = deviceLocale.split('-')[0]; // Extract language code from locale like 'en-US'
    return resources[languageCode] ? languageCode : 'en';
  }
  return 'en';
};

i18next
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18next;