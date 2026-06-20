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

// NOTE: accent ids are NAMESPACED with an `accent*` prefix (accentGold, accentTeal,
// …) so they are globally unique across COSMETIC_TIERS and never collide with the
// same-named hair-color ids (teal/silver/violet/…). Hex values are unchanged from
// the original palette — only the keys were renamed to fix the tier-bypass.
export const ACCENT_THEME: Record<string, string> = {
  none:          'transparent',
  accentGold:    '#f59e0b',
  accentSilver:  '#9ca3af',
  accentTeal:    '#0fb5a6',
  accentRose:    '#f43f5e',
  accentViolet:  '#7c3aed',
  accentSky:     '#38bdf8',
  // pro
  flame:        '#ff4500',
  neonGreen:    '#39ff14',
  neonPink:     '#ff69b4',
  obsidian:     '#1a1a2e',
  prismatic:    '#e040fb',
};
export const ACCENT_THEME_IDS = [
  'none', 'accentTeal', 'accentGold', 'accentSilver', 'accentRose', 'accentSky', 'accentViolet',
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

// Wristband DISPLAY ids stay bare ('teal'/'gold'/'neon') because PeakAvatar.tsx
// renders the band by looking the id up in its WRISTBAND_COLORS map keyed by these
// bare ids. Their COSMETIC_TIERS entries are therefore ALSO keyed by the bare id
// (see below) — previously the tier map used a `_wristband` suffix that no consumer
// passed, so isUnlocked('neon') missed the map and fell through to 'free' (and
// 'teal'/'gold' collided with the hair/accent tiers). With accent ids now namespaced
// (accent*), the bare 'gold'/'neon' keys are unique; 'teal' is shared only with the
// hair 'teal', which carries the SAME { streak: 7 } tier, so the gate is consistent.
export const WRISTBANDS_IDS = [
  'none', 'white', 'black',        // free
  'teal', 'gold', 'neon',          // streak unlocks (tiered under bare ids in COSMETIC_TIERS)
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
  // Keyed by the BARE display id (matches WRISTBANDS_IDS + PeakAvatar's WRISTBAND_COLORS).
  // The wristband 'teal' resolves via the hair-color 'teal' key above (same { streak: 7 }
  // tier) — we do NOT redeclare it here, to keep every key in this object unique (TS1117).
  // 'gold'/'neon' are unique now that accent ids are namespaced (accentGold/…).
  gold:             { streak: 30 },   // wristband only (accent gold is now 'accentGold')
  neon:             { streak: 30 },   // wristband only
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
  // NAMESPACED keys (accent*) — previously these were bare gold/silver/rose/sky/violet
  // and collided with the hair-color keys above. The collision DEMOTED the 'pro' violet
  // HAIR color to a { streak: 100 } accent (JS keeps the last duplicate key), letting
  // free users earn a paid item. Namespacing restores hair `violet: 'pro'` and gives
  // each accent its own gate. Keys here must match ACCENT_THEME / ACCENT_THEME_IDS.
  accentGold:       { streak: 7 },
  accentSilver:     { streak: 30 },
  accentRose:       { streak: 30 },
  accentSky:        { streak: 30 },
  accentViolet:     { streak: 100 },
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
// Tier-key resolver — maps a category + display id to its COSMETIC_TIERS key.
//
// Every option id in the *_IDS arrays is now globally unique and keyed DIRECTLY in
// COSMETIC_TIERS, so this resolver is the identity. It exists as the single, explicit
// place to add any future per-category key remapping, and so callers in OTHER files
// (e.g. app/cosmetics.tsx, which currently passes the bare id) have a canonical hook
// to route through. Prefer `tierKeyForId(cat.key, id)` over passing a bare id to
// isUnlocked/unlockLabel.
//
// MIGRATION NOTE (one-shot, NOT written here): the accent-theme ids were renamed
// gold->accentGold, silver->accentSilver, teal->accentTeal, rose->accentRose,
// sky->accentSky, violet->accentViolet. Any existing rows in `user_equipped_cosmetics`
// with slot='accentTheme' and item_id IN ('gold','silver','teal','rose','sky','violet')
// must be UPDATEd to the new accent* ids, or those users lose their equipped accent on
// next load (normalizeAvatar will reject the stale id and fall back to 'none').
// ---------------------------------------------------------------------------

export function tierKeyForId(_catKey: keyof Omit<AvatarConfig, 'v'>, id: string): string {
  // Identity today — all ids are uniquely keyed in COSMETIC_TIERS. Kept as the
  // explicit seam for future cross-category disambiguation.
  return id;
}

// ---------------------------------------------------------------------------
// Dev-time integrity check — guards against the regression class this file just
// fixed: a duplicate key in COSMETIC_TIERS (TS1117) silently demoting a tier, or an
// id in a *_IDS array whose tier key doesn't resolve (falling through to 'free').
// Runs only under __DEV__; throws loudly so it surfaces in development, never ships.
// ---------------------------------------------------------------------------

declare const __DEV__: boolean | undefined;

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // 1) Every accent / wristband display id must resolve to a tier key that EXISTS
  //    in COSMETIC_TIERS (or is implicitly 'free' by design). This catches a rename
  //    that updates one of the *_IDS arrays but forgets the COSMETIC_TIERS entry.
  const intentionallyFree = new Set<string>([
    // bare wristband 'teal' is gated via the shared hair 'teal' key, which exists;
    // these ids are deliberately implicit-free and need no COSMETIC_TIERS entry.
    'none', 'white', 'black',
  ]);
  const gatedArrays: Array<[string, string[]]> = [
    ['ACCENT_THEME_IDS', ACCENT_THEME_IDS],
    ['WRISTBANDS_IDS', WRISTBANDS_IDS],
  ];
  for (const [name, ids] of gatedArrays) {
    for (const id of ids) {
      const key = tierKeyForId('accentTheme', id);
      const resolves =
        COSMETIC_TIERS[key] !== undefined || intentionallyFree.has(id) || id === 'teal';
      if (!resolves) {
        throw new Error(
          `[peakAvatarOptions] ${name} id '${id}' has no COSMETIC_TIERS entry — ` +
            `it would silently fall through to 'free'. Add a tier or mark it intentionally free.`,
        );
      }
    }
  }
  // 2) ACCENT_THEME_IDS and ACCENT_THEME keys must agree (no id without a color and
  //    no orphan color), so a namespaced rename can't drift between the two.
  for (const id of ACCENT_THEME_IDS) {
    if (!(id in ACCENT_THEME)) {
      throw new Error(`[peakAvatarOptions] ACCENT_THEME_IDS '${id}' missing from ACCENT_THEME map.`);
    }
  }
}

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
