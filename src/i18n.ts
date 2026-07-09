import type { Language } from "@/types";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

export const supportedLanguages = [
  "en",
  "zh",
  "ar",
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
] as const satisfies readonly Language[];

export const languageAutonyms: Record<Language, string> = {
  en: "English",
  zh: "中文",
  ar: "العربية",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  pt: "Português",
  ru: "Русский",
};

export const isSupportedLanguage = (value: string): value is Language =>
  supportedLanguages.includes(value as Language);

const initialLanguage = localStorage.getItem("language") || "en";

const resources = {
  ar: {
    translation: ar,
  },
  de: {
    translation: de,
  },
  en: {
    translation: en,
  },
  es: {
    translation: es,
  },
  fr: {
    translation: fr,
  },
  it: {
    translation: it,
  },
  ja: {
    translation: ja,
  },
  ko: {
    translation: ko,
  },
  pt: {
    translation: pt,
  },
  ru: {
    translation: ru,
  },
  zh: {
    translation: zh,
  },
};

i18n.use(initReactI18next).init({
  resources,
  supportedLngs: supportedLanguages,
  lng: isSupportedLanguage(initialLanguage) ? initialLanguage : "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
