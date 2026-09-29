import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import type { I18nDictionary, SupportedLanguage } from "./types.js";

export * from "./types.js";
export { enUS } from "./locales/en-US.js";
export { zhCN } from "./locales/zh-CN.js";

export const DICTIONARIES: Record<SupportedLanguage, I18nDictionary> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const STORAGE_KEY = "localbridge_language";

export function detectInitialLanguage(): SupportedLanguage {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "zh-CN" || saved === "en-US") {
        return saved;
      }
    }

    if (typeof navigator !== "undefined") {
      const browserLangs = navigator.languages ? [...navigator.languages] : [navigator.language || ""];
      for (const lang of browserLangs) {
        if (lang && typeof lang === "string" && lang.toLowerCase().startsWith("zh")) {
          return "zh-CN";
        }
      }
    }
  } catch {
    // Fallback if localStorage or navigator is inaccessible
  }
  return "zh-CN";
}

export function persistLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore storage write failures
  }
}

export function getTranslatedError(
  code: string | undefined | null,
  lang: SupportedLanguage,
  fallbackMessage?: string
): string {
  if (!code) return fallbackMessage || DICTIONARIES[lang].errors.unknown;
  const dict = DICTIONARIES[lang];
  const translated = (dict.errors as Record<string, string>)[code];
  if (translated) {
    return translated;
  }
  return fallbackMessage ? `${fallbackMessage} (${code})` : `${dict.errors.unknown} (${code})`;
}

export function formatBackendStatus(
  status: string | undefined | null,
  lang: SupportedLanguage
): string {
  if (!status) return "";
  const dict = DICTIONARIES[lang]?.statusMap;
  if (!dict) return status;
  const normalized = status.toLowerCase().replace(/[-_]/g, "");
  for (const [k, v] of Object.entries(dict)) {
    if (k.toLowerCase() === normalized) {
      return v;
    }
  }
  return status;
}

