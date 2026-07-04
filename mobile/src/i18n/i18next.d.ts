/**
 * i18next.d.ts — TICKET-146 typed keys.
 * The EN bundles are the type source of truth: a t('ns:missing.key') with a
 * literal key is a compile-time error. Dynamic keys live only in dedicated
 * helpers (./engine.ts) behind explicit casts.
 */

import 'i18next';

import type common from './locales/en/common.json';
import type settings from './locales/en/settings.json';
import type tabs from './locales/en/tabs.json';
import type screens from './locales/en/screens.json';
import type screens2 from './locales/en/screens2.json';
import type components from './locales/en/components.json';
import type logger from './locales/en/logger.json';
import type misc from './locales/en/misc.json';
import type engine from './locales/en/engine.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      settings: typeof settings;
      tabs: typeof tabs;
      screens: typeof screens;
      screens2: typeof screens2;
      components: typeof components;
      logger: typeof logger;
      misc: typeof misc;
      engine: typeof engine;
    };
  }
}
