/**
 * i18n — TICKET-146 localization scaffold (i18next + react-i18next).
 * =============================================================================
 * THE RAIL, not the translations: en.json namespaces are the source of truth;
 * translating later is a content task (drop de.json etc. next to en/ and add
 * to SUPPORTED_LANGUAGES). Wired so that:
 *   - init is SYNCHRONOUS and JS-only (bundled resources — nothing async, no
 *     network, nothing on the boot path beyond cheap object wiring; safe per
 *     CLAUDE.md §5).
 *   - device-locale detection via expo-localization (guarded — it can return
 *     an empty array); manual override persisted in appSettings
 *     ('system' | 'en' | 'pseudo') and applied post-boot (applyStoredLanguage).
 *   - the pseudo-locale (āccented, 1.4×) is generated at runtime from EN for
 *     truncation testing — selectable only in __DEV__ builds.
 *   - UNITS ARE NOT LANGUAGE: weight/length stay on constants/units.ts +
 *     constants/locale.ts (region-based), deliberately not entangled here.
 *
 * Key style for contributors: t('<ns>:<dot.path>') with LITERAL keys so the
 * typed-key augmentation (i18next.d.ts) and scripts/pf_i18n_check.js can see
 * them. Dynamic keys are allowed ONLY inside dedicated typed helpers
 * (see ./engine.ts).
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import common from './locales/en/common.json';
import settings from './locales/en/settings.json';
import tabs from './locales/en/tabs.json';
import screens from './locales/en/screens.json';
import screens2 from './locales/en/screens2.json';
import components from './locales/en/components.json';
import logger from './locales/en/logger.json';
import misc from './locales/en/misc.json';
import engine from './locales/en/engine.json';

import { pseudoizeBundle, type Bundle } from './pseudo';
import { getAppLanguage, setAppLanguage, type AppLanguage } from '../data/appSettings';

export const EN_RESOURCES = {
  common,
  settings,
  tabs,
  screens,
  screens2,
  components,
  logger,
  misc,
  engine,
} as const;

export const I18N_NAMESPACES = Object.keys(EN_RESOURCES) as Array<keyof typeof EN_RESOURCES>;

/** Languages with real translations. Grows as content lands (content task). */
export const SUPPORTED_LANGUAGES = ['en'] as const;

/** Device language (BCP-47 primary subtag), guarded like constants/locale.ts. */
export function detectDeviceLanguage(): string {
  try {
    const locales = Localization.getLocales?.() ?? [];
    const code = locales[0]?.languageCode;
    return typeof code === 'string' && code.length > 0 ? code : 'en';
  } catch {
    return 'en';
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: EN_RESOURCES },
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  supportedLngs: undefined, // only EN ships; fallbackLng covers everything else
  defaultNS: 'common',
  ns: I18N_NAMESPACES as unknown as string[],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

let pseudoLoaded = false;

function ensurePseudoBundles(): void {
  if (pseudoLoaded) return;
  for (const ns of I18N_NAMESPACES) {
    i18n.addResourceBundle(
      'pseudo',
      ns,
      pseudoizeBundle(EN_RESOURCES[ns] as Bundle),
      true,
      true,
    );
  }
  pseudoLoaded = true;
}

/** Apply one language choice ('system' follows the device). */
async function applyLanguage(choice: AppLanguage): Promise<void> {
  if (choice === 'pseudo') {
    if (!__DEV__) {
      await i18n.changeLanguage(detectDeviceLanguage());
      return;
    }
    ensurePseudoBundles();
    await i18n.changeLanguage('pseudo');
    return;
  }
  await i18n.changeLanguage(choice === 'system' ? detectDeviceLanguage() : choice);
}

/**
 * Apply the persisted language override. Call ONCE post-boot, deferred (the
 * synchronous init above already rendered the right thing for 'system'/EN
 * users, i.e. everyone until translations ship — so this never blocks paint).
 */
export async function applyStoredLanguage(): Promise<void> {
  try {
    await applyLanguage(await getAppLanguage());
  } catch {
    // Never let a settings read break boot — EN fallback is already live.
  }
}

/** Settings-row entry point: persist + apply in one step. */
export async function setAppLanguageAndApply(choice: AppLanguage): Promise<void> {
  await setAppLanguage(choice);
  await applyLanguage(choice);
}

export default i18n;
