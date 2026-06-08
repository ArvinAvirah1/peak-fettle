/**
 * peakAvatarOptions — TICKET-096 Phase 2 (art direction: "Peak Pals", founder pick 2026-06-06)
 *
 * The parametric option catalog for the customizable cartoon avatar. Every
 * feature category from the ticket is represented with a generous option count:
 * face/head, skin, hair, hair color, facial hair, eyes, brows, mouth, glasses,
 * headwear, background.
 *
 * We serialize the CONFIG (this small option-set), never a rendered image — so it
 * ships in the TICKET-094 local-first backup and re-renders identically anywhere.
 * `v` is a config schema version for forward-compatible restores.
 */

export interface AvatarConfig {
  v: 1;
  background: string;
  face: string;
  skin: string;
  hair: string;
  hairColor: string;
  facialHair: string;
  eyes: string;
  brows: string;
  mouth: string;
  glasses: string;
  headwear: string;
}

// ---------------------------------------------------------------------------
// Color palettes (ordered id lists + id→hex). Used for swatch pickers.
// ---------------------------------------------------------------------------

export const SKIN: Record<string, string> = {
  porcelain: '#ffe0bd', light: '#f5cfa0', tan: '#e0ac69', warm: '#c68642',
  brown: '#8d5524', deep: '#5c3a21', olive: '#d8b27a', rosy: '#f1c0a8',
};
export const SKIN_IDS = ['porcelain', 'light', 'tan', 'warm', 'brown', 'deep', 'olive', 'rosy'];

export const HAIR_COLOR: Record<string, string> = {
  black: '#1b1b1b', darkBrown: '#3a2417', brown: '#6b4226', chestnut: '#8d5524',
  blonde: '#e0b34a', sandy: '#c9a35a', red: '#b5532a', gray: '#b8b8b8',
  teal: '#0fb5a6', pink: '#e36bae',
};
export const HAIR_COLOR_IDS = ['black', 'darkBrown', 'brown', 'chestnut', 'blonde', 'sandy', 'red', 'gray', 'teal', 'pink'];

// Background base colors. 'peaks' draws a mountain silhouette over a base.
export const BG: Record<string, string> = {
  mint: '#eaf7f5', sky: '#cdeafe', peach: '#ffe3d3', lavender: '#ece7ff',
  sand: '#fff1d6', rose: '#fde2e4', slate: '#d7dee8', teal: '#bfe9e2',
  night: '#13343b', peaks: '#eaf7f5',
};
export const BG_IDS = ['mint', 'sky', 'peach', 'lavender', 'sand', 'rose', 'slate', 'teal', 'night', 'peaks'];

// ---------------------------------------------------------------------------
// Shape option id lists.
// ---------------------------------------------------------------------------

export const FACE_IDS = ['round', 'oval', 'square', 'wide'];
export const HAIR_IDS = ['none', 'short', 'buzz', 'curlyTop', 'bun', 'ponytail', 'mohawk', 'long', 'afro', 'sidePart'];
export const FACIAL_HAIR_IDS = ['none', 'stubble', 'mustache', 'goatee', 'fullBeard'];
export const EYES_IDS = ['dots', 'round', 'happy', 'wink', 'sleepy'];
export const BROWS_IDS = ['none', 'flat', 'raised', 'angry'];
export const MOUTH_IDS = ['smile', 'grin', 'smirk', 'open', 'flat', 'tongue'];
export const GLASSES_IDS = ['none', 'round', 'square', 'sunglasses'];
export const HEADWEAR_IDS = ['none', 'headband', 'beanie', 'cap', 'visor'];

// ---------------------------------------------------------------------------
// Category descriptor — drives the customizer UI generically.
// ---------------------------------------------------------------------------

export type CategoryKind = 'options' | 'color';

export interface AvatarCategory {
  key: keyof Omit<AvatarConfig, 'v'>;
  label: string;
  kind: CategoryKind;
  ids: string[];
  /** id→hex for color kinds (undefined for option kinds). */
  colors?: Record<string, string>;
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  { key: 'background', label: 'Background', kind: 'color', ids: BG_IDS, colors: BG },
  { key: 'face', label: 'Face shape', kind: 'options', ids: FACE_IDS },
  { key: 'skin', label: 'Skin', kind: 'color', ids: SKIN_IDS, colors: SKIN },
  { key: 'hair', label: 'Hair', kind: 'options', ids: HAIR_IDS },
  { key: 'hairColor', label: 'Hair color', kind: 'color', ids: HAIR_COLOR_IDS, colors: HAIR_COLOR },
  { key: 'facialHair', label: 'Facial hair', kind: 'options', ids: FACIAL_HAIR_IDS },
  { key: 'eyes', label: 'Eyes', kind: 'options', ids: EYES_IDS },
  { key: 'brows', label: 'Brows', kind: 'options', ids: BROWS_IDS },
  { key: 'mouth', label: 'Mouth', kind: 'options', ids: MOUTH_IDS },
  { key: 'glasses', label: 'Glasses', kind: 'options', ids: GLASSES_IDS },
  { key: 'headwear', label: 'Headwear', kind: 'options', ids: HEADWEAR_IDS },
];

// ---------------------------------------------------------------------------
// Default + validation + randomize.
// ---------------------------------------------------------------------------

export const DEFAULT_AVATAR: AvatarConfig = {
  v: 1,
  background: 'mint',
  face: 'round',
  skin: 'tan',
  hair: 'short',
  hairColor: 'brown',
  facialHair: 'none',
  eyes: 'round',
  brows: 'flat',
  mouth: 'smile',
  glasses: 'none',
  headwear: 'headband', // the Peak Pals signature, on by default
};

function pick<T>(arr: T[], i: number): T {
  // arr is always non-empty in this module; fall back to index 0 defensively.
  return arr[((i % arr.length) + arr.length) % arr.length] ?? arr[0] as T;
}

/** Coerce any partial/unknown object into a valid AvatarConfig (every field known). */
export function normalizeAvatar(raw: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  if (!raw) return { ...DEFAULT_AVATAR };
  const valid = (ids: string[], val: unknown, def: string): string =>
    typeof val === 'string' && ids.includes(val) ? val : def;
  return {
    v: 1,
    background: valid(BG_IDS, raw.background, DEFAULT_AVATAR.background),
    face: valid(FACE_IDS, raw.face, DEFAULT_AVATAR.face),
    skin: valid(SKIN_IDS, raw.skin, DEFAULT_AVATAR.skin),
    hair: valid(HAIR_IDS, raw.hair, DEFAULT_AVATAR.hair),
    hairColor: valid(HAIR_COLOR_IDS, raw.hairColor, DEFAULT_AVATAR.hairColor),
    facialHair: valid(FACIAL_HAIR_IDS, raw.facialHair, DEFAULT_AVATAR.facialHair),
    eyes: valid(EYES_IDS, raw.eyes, DEFAULT_AVATAR.eyes),
    brows: valid(BROWS_IDS, raw.brows, DEFAULT_AVATAR.brows),
    mouth: valid(MOUTH_IDS, raw.mouth, DEFAULT_AVATAR.mouth),
    glasses: valid(GLASSES_IDS, raw.glasses, DEFAULT_AVATAR.glasses),
    headwear: valid(HEADWEAR_IDS, raw.headwear, DEFAULT_AVATAR.headwear),
  };
}

/** Always returns a valid, fully-populated config. */
export function randomizeAvatar(): AvatarConfig {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    v: 1,
    background: pick(BG_IDS, r(BG_IDS.length)),
    face: pick(FACE_IDS, r(FACE_IDS.length)),
    skin: pick(SKIN_IDS, r(SKIN_IDS.length)),
    hair: pick(HAIR_IDS, r(HAIR_IDS.length)),
    hairColor: pick(HAIR_COLOR_IDS, r(HAIR_COLOR_IDS.length)),
    facialHair: pick(FACIAL_HAIR_IDS, r(FACIAL_HAIR_IDS.length)),
    eyes: pick(EYES_IDS, r(EYES_IDS.length)),
    brows: pick(BROWS_IDS, r(BROWS_IDS.length)),
    mouth: pick(MOUTH_IDS, r(MOUTH_IDS.length)),
    glasses: pick(GLASSES_IDS, r(GLASSES_IDS.length)),
    headwear: pick(HEADWEAR_IDS, r(HEADWEAR_IDS.length)),
  };
}

/** A stable swatch color to represent an option category in the picker. */
export function categorySwatch(cat: AvatarCategory, id: string): string | null {
  if (cat.kind === 'color' && cat.colors) return cat.colors[id] ?? null;
  return null;
}
