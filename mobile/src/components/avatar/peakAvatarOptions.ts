/**
 * peakAvatarOptions — TICKET-096 Phase 2 + cosmetic-unlock expansion
 *
 * The parametric option catalog for the customizable cartoon avatar. Every
 * feature category from the ticket is represented with a generous option count:
 * face/head, skin, hair, hair color, facial hair, eyes, brows, mouth, glasses,
 * headwear, outfits/tops, accessories (headband, wristbands), background/accent themes.
 *
 * BACKWARD COMPATIBILITY: AvatarConfig v:1 is preserved with all original fields.
 * New fields (outfit, wristbands, accentTheme) are OPTIONAL — normalizeAvatar()
 * defaults every new field, so existing saved avatars still load without any
 * migration. v remains 1; a v:2 bump would only be needed for a breaking rename.
 *
 * UNLOCK TIERS: each option id may be tagged in COSMETIC_TIERS with:
 *   'free'         — always available (default, no tag needed)
 *   { streak: N }  — unlocked after N consecutive days (7 / 30 / 100)
 *   'pro'          — requires active Pro subscription
 *
 * We serialize the CONFIG (this small option-set), never a rendered image — so it
 * ships in the TICKET-094 local-first backup and re-renders identically anywhere.
 * `v` is a config schema version for forward-compatible restores.
 */

// ---------------------------------------------------------------------------
// AvatarConfig — the stored selection. Only ADD optional fields; never rename.
// ---------------------------------------------------------------------------

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
  // v1 additions (optional → backward-compatible, defaulted by normalizeAvatar)
  outfit?: string;
  wristbands?: string;
  accentTheme?: string;
}

// ---------------------------------------------------------------------------
// Skin tones — 16 tones ordered light-to-deep with warm/cool/neutral variants.
// ---------------------------------------------------------------------------

export const SKIN: Record<string, string> = {
  // Existing (kept identical)
  porcelain: '#ffe0bd',
  light:     '#f5cfa0',
  tan:       '#e0ac69',
  warm:      '#c68642',
  brown:     '#8d5524',
  deep:      '#5c3a21',
  olive:     '#d8b27a',
  rosy:      '#f1c0a8',
  // New
  ivory:     '#fdecd4',
  peach:     '#f7c89b',
  caramel:   '#c07b47',
  toffee:    '#a0622b',
  espresso:  '#3e1f0f',
  ebony:     '#2a1109',
  ashBrown:  '#aa7752',
  reddish:   '#c4805a',
};
export const SKIN_IDS = [
  'porcelain', 'ivory', 'light', 'peach', 'rosy', 'tan', 'olive', 'warm',
  'caramel', 'toffee', 'brown', 'ashBrown', 'reddish', 'deep', 'espresso', 'ebony',
];

// ---------------------------------------------------------------------------
// Hair colors — 18 colors including bold fashion hues.
// ---------------------------------------------------------------------------

export const HAIR_COLOR: Record<string, string> = {
  // Existing (kept identical)
  black:     '#1b1b1b',
  darkBrown: '#3a2417',
  brown:     '#6b4226',
  chestnut:  '#8d5524',
  blonde:    '#e0b34a',
  sandy:     '#c9a35a',
  red:       '#b5532a',
  gray:      '#b8b8b8',
  teal:      '#0fb5a6',
  pink:      '#e36bae',
  // New
  platinum:  '#e8e4d0',
  ashBlonde: '#d6c48b',
  auburn:    '#9e3d19',
  copper:    '#b85a1e',
  strawberry:'#e07a5f',
  silver:    '#d4d4e3',
  violet:    '#7c3aed',
  skyBlue:   '#38bdf8',
};
export const HAIR_COLOR_IDS = [
  'black', 'darkBrown', 'brown', 'chestnut', 'auburn', 'copper', 'red', 'strawberry',
  'blonde', 'sandy', 'ashBlonde', 'platinum', 'gray', 'silver', 'pink', 'teal',
  'violet', 'skyBlue',
];

// ---------------------------------------------------------------------------
// Backgrounds — 18 options including night-mode and gradient/peaks variants.
// 'gradient_*' and 'animated_*' ids are marked 'pro' in COSMETIC_TIERS.
// ---------------------------------------------------------------------------

export const BG: Record<string, string> = {
  // Existing (kept identical)
  mint:            '#eaf7f5',
  sky:             '#cdeafe',
  peach:           '#ffe3d3',
  lavender:        '#ece7ff',
  sand:            '#fff1d6',
  rose:            '#fde2e4',
  slate:           '#d7dee8',
  teal:            '#bfe9e2',
  night:           '#13343b',
  peaks:           '#eaf7f5',
  // New – standard
  dusk:            '#2d3561',
  forest:          '#d4edda',
  sunsetOrange:    '#ffe0b2',
  indigo:          '#e8eaf6',
  charcoal:        '#2c2c2c',
  snowfield:       '#eef4fb',
  // New – gradient/premium (pro)
  gradient_aurora: '#1a1a2e',
  gradient_sunset: '#ff6b6b',
  gradient_ocean:  '#0077b6',
  // New – animated (pro)
  animated_confetti: '#f8f9fa',
  animated_sparkles: '#0a0a23',
};
export const BG_IDS = [
  'mint', 'sky', 'peach', 'lavender', 'sand', 'rose', 'slate', 'teal',
  'night', 'dusk', 'charcoal', 'forest', 'sunsetOrange', 'indigo', 'snowfield', 'peaks',
  'gradient_aurora', 'gradient_sunset', 'gradient_ocean',
  'animated_confetti', 'animated_sparkles',
];

// ---------------------------------------------------------------------------
// Accent themes — color used for glow/highlight ring around the avatar.
// 'pro' items are premium palette entries.
// ---------------------------------------------------------------------------

export const ACCENT_THEME: Record<string, string> = {
  none:         'transparent',
  gold:         '#f59e0b',
  silver:       '#9ca3af',
  teal:         '#0fb5a6',
  rose:         '#f43f5e',
  violet:       '#7c3aed',
  sky:          '#38bdf8',
  // pro
  flame:        '#ff4500',
  neonGreen:    '#39ff14',
  neonPink:     '#ff69b4',
  obsidian:     '#1a1a2e',
  prismatic:    '#e040fb',
};
export const ACCENT_THEME_IDS = [
  'none', 'teal', 'gold', 'silver', 'rose', 'sky', 'violet',
  'flame', 'neonGreen', 'neonPink', 'obsidian', 'prismatic',
];

// ---------------------------------------------------------------------------
// Shape option id lists — all original ids preserved in same position.
// ---------------------------------------------------------------------------

export const FACE_IDS = ['round', 'oval', 'square', 'wide', 'heart', 'diamond'];

export const HAIR_IDS = [
  // Existing (in original order)
  'none', 'short', 'buzz', 'curlyTop', 'bun', 'ponytail', 'mohawk', 'long', 'afro', 'sidePart',
  // New
  'pixie', 'bob', 'wavyLong', 'dreadlocks', 'cornrows', 'twoStrandTwists',
  'undercut', 'quiff', 'slickedBack', 'messy', 'ringlets', 'topKnot',
];

export const FACIAL_HAIR_IDS = [
  // Existing
  'none', 'stubble', 'mustache', 'goatee', 'fullBeard',
  // New
  'chinStrap', 'handlebar', 'soul_patch', 'shortBoxBeard', 'vikingBeard',
];

export const EYES_IDS = [
  // Existing
  'dots', 'round', 'happy', 'wink', 'sleepy',
  // New
  'stars', 'determined', 'surprised', 'catEye', 'halfLid', 'fire',
];

export const BROWS_IDS = [
  // Existing
  'none', 'flat', 'raised', 'angry',
  // New
  'arched', 'bushy', 'thin', 'worried',
];

export const MOUTH_IDS = [
  // Existing
  'smile', 'grin', 'smirk', 'open', 'flat', 'tongue',
  // New
  'bigSmile', 'pursed', 'whistle', 'determined', 'cheeky',
];

export const GLASSES_IDS = [
  // Existing
  'none', 'round', 'square', 'sunglasses',
  // New
  'aviator', 'catEye', 'sport', 'monocle',
];

export const HEADWEAR_IDS = [
  // Existing
  'none', 'headband', 'beanie', 'cap', 'visor',
  // New
  'beretFlat', 'sweatband', 'snapback', 'cowboy', 'crownGold',
];

// ---------------------------------------------------------------------------
// Outfits / tops — new category.
// ---------------------------------------------------------------------------

export const OUTFIT_IDS = [
  // Free basics
  'none', 'tank', 'tee', 'racerback',
  // Streak unlocks
  'compression', 'hoodie', 'zipUp',
  // Pro
  'proKit', 'eliteCompression', 'teamJersey', 'goldTrim', 'animatedRainbow',
];

// ---------------------------------------------------------------------------
// Wristbands — new accessory category.
// ---------------------------------------------------------------------------

export const WRISTBANDS_IDS = [
  'none', 'white', 'black',        // free
  'teal', 'gold', 'neon',          // streak unlocks
  'proGlitter', 'animatedPulse',   // pro
];

// ---------------------------------------------------------------------------
// COSMETIC_TIERS — single source of truth for unlock assignments.
//
// Any option id NOT listed here is implicitly 'free'.
// Adjustable: change a tier assignment in ONE place here to affect all UI.
// ---------------------------------------------------------------------------

export type UnlockTier = 'free' | { streak: number } | 'pro';

export type CosmeticTiersMap = Record<string, UnlockTier>;

/** Complete adjustable tier assignment map. */
export const COSMETIC_TIERS: CosmeticTiersMap = {
  // ── Skin tones ──────────────────────────────────────────────────────────
  // All skin tones are free (no barriers to representation).

  // ── Hair styles ─────────────────────────────────────────────────────────
  dreadlocks:       { streak: 7 },
  cornrows:         { streak: 7 },
  twoStrandTwists:  { streak: 7 },
  ringlets:         { streak: 30 },
  topKnot:          { streak: 30 },
  wavyLong:         { streak: 30 },
  undercut:         { streak: 100 },
  quiff:            { streak: 100 },
  slickedBack:      { streak: 100 },

  // ── Hair colors ─────────────────────────────────────────────────────────
  teal:             { streak: 7 },
  pink:             { streak: 7 },
  silver:           { streak: 30 },
  platinum:         { streak: 30 },
  violet:           'pro',
  skyBlue:          'pro',

  // ── Facial hair ─────────────────────────────────────────────────────────
  handlebar:        { streak: 7 },
  vikingBeard:      { streak: 30 },

  // ── Eyes ────────────────────────────────────────────────────────────────
  stars:            { streak: 7 },
  fire:             { streak: 30 },
  catEye:           { streak: 30 },

  // ── Glasses ─────────────────────────────────────────────────────────────
  aviator:          { streak: 7 },
  sport:            { streak: 30 },
  monocle:          'pro',

  // ── Headwear ────────────────────────────────────────────────────────────
  sweatband:        { streak: 7 },
  snapback:         { streak: 30 },
  cowboy:           { streak: 30 },
  crownGold:        'pro',

  // ── Outfits ─────────────────────────────────────────────────────────────
  compression:      { streak: 7 },
  hoodie:           { streak: 30 },
  zipUp:            { streak: 30 },
  proKit:           'pro',
  eliteCompression: 'pro',
  teamJersey:       'pro',
  goldTrim:         'pro',
  animatedRainbow:  'pro',

  // ── Wristbands ──────────────────────────────────────────────────────────
  teal_wristband:   { streak: 7 },    // keyed with suffix to avoid clash with hair
  gold_wristband:   { streak: 30 },
  neon_wristband:   { streak: 30 },
  proGlitter:       'pro',
  animatedPulse:    'pro',

  // ── Backgrounds ─────────────────────────────────────────────────────────
  night:            { streak: 7 },
  dusk:             { streak: 7 },
  charcoal:         { streak: 7 },
  forest:           { streak: 30 },
  sunsetOrange:     { streak: 30 },
  snowfield:        { streak: 30 },
  indigo:           { streak: 30 },
  peaks:            { streak: 100 },
  gradient_aurora:  'pro',
  gradient_sunset:  'pro',
  gradient_ocean:   'pro',
  animated_confetti:'pro',
  animated_sparkles:'pro',

  // ── Accent themes ────────────────────────────────────────────────────────
  gold:             { streak: 7 },
  silver:           { streak: 30 },
  rose:             { streak: 30 },
  sky:              { streak: 30 },
  violet:           { streak: 100 },
  flame:            'pro',
  neonGreen:        'pro',
  neonPink:         'pro',
  obsidian:         'pro',
  prismatic:        'pro',
};

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
  { key: 'background',   label: 'Background',   kind: 'color',   ids: BG_IDS,           colors: BG },
  { key: 'accentTheme',  label: 'Accent',        kind: 'color',   ids: ACCENT_THEME_IDS, colors: ACCENT_THEME },
  { key: 'face',         label: 'Face shape',    kind: 'options', ids: FACE_IDS },
  { key: 'skin',         label: 'Skin',          kind: 'color',   ids: SKIN_IDS,         colors: SKIN },
  { key: 'hair',         label: 'Hair',          kind: 'options', ids: HAIR_IDS },
  { key: 'hairColor',    label: 'Hair color',    kind: 'color',   ids: HAIR_COLOR_IDS,   colors: HAIR_COLOR },
  { key: 'facialHair',   label: 'Facial hair',   kind: 'options', ids: FACIAL_HAIR_IDS },
  { key: 'eyes',         label: 'Eyes',          kind: 'options', ids: EYES_IDS },
  { key: 'brows',        label: 'Brows',         kind: 'options', ids: BROWS_IDS },
  { key: 'mouth',        label: 'Mouth',         kind: 'options', ids: MOUTH_IDS },
  { key: 'glasses',      label: 'Glasses',       kind: 'options', ids: GLASSES_IDS },
  { key: 'headwear',     label: 'Headwear',      kind: 'options', ids: HEADWEAR_IDS },
  { key: 'outfit',       label: 'Outfit',        kind: 'options', ids: OUTFIT_IDS },
  { key: 'wristbands',   label: 'Wristbands',    kind: 'options', ids: WRISTBANDS_IDS },
];

// ---------------------------------------------------------------------------
// Default + validation + randomize.
// ---------------------------------------------------------------------------

export const DEFAULT_AVATAR: AvatarConfig = {
  v: 1,
  background:  'mint',
  face:        'round',
  skin:        'tan',
  hair:        'short',
  hairColor:   'brown',
  facialHair:  'none',
  eyes:        'round',
  brows:       'flat',
  mouth:       'smile',
  glasses:     'none',
  headwear:    'headband', // the Peak Pals signature, on by default
  // new optional fields — free defaults
  outfit:      'tank',
  wristbands:  'none',
  accentTheme: 'none',
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
    background:  valid(BG_IDS,           raw.background,  DEFAULT_AVATAR.background),
    face:        valid(FACE_IDS,          raw.face,        DEFAULT_AVATAR.face),
    skin:        valid(SKIN_IDS,          raw.skin,        DEFAULT_AVATAR.skin),
    hair:        valid(HAIR_IDS,          raw.hair,        DEFAULT_AVATAR.hair),
    hairColor:   valid(HAIR_COLOR_IDS,    raw.hairColor,   DEFAULT_AVATAR.hairColor),
    facialHair:  valid(FACIAL_HAIR_IDS,   raw.facialHair,  DEFAULT_AVATAR.facialHair),
    eyes:        valid(EYES_IDS,          raw.eyes,        DEFAULT_AVATAR.eyes),
    brows:       valid(BROWS_IDS,         raw.brows,       DEFAULT_AVATAR.brows),
    mouth:       valid(MOUTH_IDS,         raw.mouth,       DEFAULT_AVATAR.mouth),
    glasses:     valid(GLASSES_IDS,       raw.glasses,     DEFAULT_AVATAR.glasses),
    headwear:    valid(HEADWEAR_IDS,      raw.headwear,    DEFAULT_AVATAR.headwear),
    // new optional fields — safe defaults if absent
    outfit:      valid(OUTFIT_IDS,        raw.outfit,      DEFAULT_AVATAR.outfit!),
    wristbands:  valid(WRISTBANDS_IDS,    raw.wristbands,  DEFAULT_AVATAR.wristbands!),
    accentTheme: valid(ACCENT_THEME_IDS,  raw.accentTheme, DEFAULT_AVATAR.accentTheme!),
  };
}

/** Always returns a valid, fully-populated config. */
export function randomizeAvatar(): AvatarConfig {
  // Exclude pro/streak items from randomization so a new user always gets a
  // legal free config. Filter to ids that have no tier tag or are 'free'.
  const freePick = (ids: string[]): string => {
    const freeIds = ids.filter(id => {
      const t = COSMETIC_TIERS[id];
      return t === undefined || t === 'free';
    });
    const pool = freeIds.length > 0 ? freeIds : ids;
    const i = Math.floor(Math.random() * pool.length);
    return pick(pool, i);
  };
  return {
    v: 1,
    background:  freePick(BG_IDS),
    face:        freePick(FACE_IDS),
    skin:        freePick(SKIN_IDS),
    hair:        freePick(HAIR_IDS),
    hairColor:   freePick(HAIR_COLOR_IDS),
    facialHair:  freePick(FACIAL_HAIR_IDS),
    eyes:        freePick(EYES_IDS),
    brows:       freePick(BROWS_IDS),
    mouth:       freePick(MOUTH_IDS),
    glasses:     freePick(GLASSES_IDS),
    headwear:    freePick(HEADWEAR_IDS),
    outfit:      freePick(OUTFIT_IDS),
    wristbands:  freePick(WRISTBANDS_IDS),
    accentTheme: freePick(ACCENT_THEME_IDS),
  };
}

/** A stable swatch color to represent an option category in the picker. */
export function categorySwatch(cat: AvatarCategory, id: string): string | null {
  if (cat.kind === 'color' && cat.colors) return cat.colors[id] ?? null;
  return null;
}
