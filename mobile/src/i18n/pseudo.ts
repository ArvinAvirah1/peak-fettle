/**
 * pseudo.ts — TICKET-146 pseudo-locale generator.
 * =============================================================================
 * Turns the English bundles into an "āccented, ~1.4× length" pseudo-locale at
 * runtime (dev tool — never shipped as a user-visible language outside __DEV__).
 * Purpose: truncation/overflow verification on real screens without waiting
 * for real translations. Interpolation placeholders ({{param}}) and the
 * nesting/format syntax are preserved untouched so i18next still interpolates.
 */

const ACCENT_MAP: Record<string, string> = {
  a: 'ā', b: 'ƀ', c: 'ç', d: 'đ', e: 'ē', f: 'ƒ', g: 'ğ', h: 'ħ', i: 'ī',
  j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ō', p: 'þ', q: 'ʠ', r: 'ŕ',
  s: 'š', t: 'ŧ', u: 'ū', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ȳ', z: 'ž',
  A: 'Ā', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'Ē', F: 'Ƒ', G: 'Ğ', H: 'Ħ', I: 'Ī',
  J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ō', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Š', T: 'Ŧ', U: 'Ū', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ȳ', Z: 'Ž',
};

/** Length multiplier — German/Finnish-class expansion per the ticket. */
export const PSEUDO_EXPANSION = 1.4;

/** Accent + pad ONE string, leaving {{interpolations}} intact. */
export function pseudoizeString(value: string): string {
  const parts = value.split(/(\{\{[^}]*\}\})/g);
  const accented = parts
    .map((part) =>
      part.startsWith('{{') ? part : part.replace(/[A-Za-z]/g, (ch) => ACCENT_MAP[ch] ?? ch),
    )
    .join('');
  const letters = value.replace(/\{\{[^}]*\}\}/g, '').length;
  const padCount = Math.max(0, Math.round(letters * (PSEUDO_EXPANSION - 1)));
  return padCount > 0 ? `[${accented}${'~'.repeat(padCount)}]` : `[${accented}]`;
}

export type Bundle = { [key: string]: string | Bundle };

/** Deep-transform a whole namespace bundle. */
export function pseudoizeBundle(bundle: Bundle): Bundle {
  const out: Bundle = {};
  for (const key of Object.keys(bundle)) {
    const v = bundle[key];
    out[key] = typeof v === 'string' ? pseudoizeString(v) : pseudoizeBundle(v as Bundle);
  }
  return out;
}
