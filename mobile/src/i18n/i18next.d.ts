/**
 * i18next.d.ts — TICKET-146 type augmentation.
 *
 * DELIBERATELY MINIMAL. The codebase uses the runtime `t('ns:dot.path')`
 * call style everywhere; i18next v26's typed-resources mode does not type
 * that form (it only types bare defaultNS keys / useTranslation('ns')),
 * so a full `resources` augmentation turns every prefixed call into a
 * TS2345 (~2k errors — violates the tsc-delta rule, roadmap criterion 4,
 * which explicitly outranks: "typed keys must not add errors").
 *
 * Key integrity is instead enforced STATICALLY by scripts/pf_i18n_check.js
 * (runs in the verification gate + CI-able): every literal `t('ns:key')`
 * under mobile/app + mobile/src must exist in the EN bundles (plural-aware),
 * and raw JSX string literals are linted. If a future i18next release types
 * ns-prefixed keys, restore the full augmentation:
 *   resources: { common: typeof common; settings: ...; tabs: ...; screens: ...;
 *                screens2: ...; components: ...; logger: ...; misc: ...; engine: ... }
 */

import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    returnNull: false;
  }
}
