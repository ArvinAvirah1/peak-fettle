/**
 * PeakAvatar — TICKET-096 Phase 2 (art direction: "Peak Pals")
 *
 * Pure, layered SVG renderer for the parametric avatar. Given an AvatarConfig it
 * draws (back→front): background → behind-hair → outfit/shoulders → head → ears →
 * facial hair → front-hair → brows → eyes → nose → mouth → glasses → headwear →
 * wristbands → accent glow ring.
 *
 * Stateless and side-effect free — the same config always renders identically, on
 * any device (the property the local-first backup relies on). Reusable anywhere
 * an avatar is shown (Profile, rankings rows, groups) by passing `size`.
 *
 * BACKWARD COMPATIBILITY: every original option id renders exactly as before.
 * The cosmetic-unlock expansion only ADDED ids + three optional layers
 * (outfit, wristbands, accentTheme), each defaulted by normalizeAvatar so a v1
 * saved avatar (no new fields) still renders identically.
 */

import React from 'react';
import Svg, { Path, Circle, Ellipse, Rect, Line, G } from 'react-native-svg';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  normalizeAvatar,
  SKIN,
  HAIR_COLOR,
  BG,
  ACCENT_THEME,
} from './peakAvatarOptions';

const INK = '#23201c';
const SHIRT = '#1f7a8c';
const HEADBAND = '#0fb5a6';

// Outfit palette — kept here (not theme tokens) because these are illustration
// fills baked into the avatar art, not UI chrome.
const OUTFIT_COLORS: Record<string, string> = {
  tank: SHIRT,
  tee: '#3a6ea5',
  racerback: '#6d4c91',
  compression: '#2b2b3a',
  hoodie: '#4a5568',
  zipUp: '#2f6f4f',
  proKit: '#0a8f84',
  eliteCompression: '#1a1a2e',
  teamJersey: '#c0392b',
  goldTrim: '#1c1c1c',
  animatedRainbow: '#ff5e7e',
};

// Wristband fills.
const WRISTBAND_COLORS: Record<string, string> = {
  white: '#f4f4f4',
  black: '#222222',
  teal: '#0fb5a6',
  gold: '#f59e0b',
  neon: '#39ff14',
  proGlitter: '#e040fb',
  animatedPulse: '#ff4500',
};

export interface PeakAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  /** Optional ring border (used on profile). */
  ring?: string;
}

export function PeakAvatar({ config, size = 96, ring }: PeakAvatarProps): React.ReactElement {
  const cfg = normalizeAvatar(config ?? DEFAULT_AVATAR);
  const skin = SKIN[cfg.skin] ?? SKIN.tan;
  const hair = HAIR_COLOR[cfg.hairColor] ?? HAIR_COLOR.brown;
  const bg = BG[cfg.background] ?? BG.mint;
  const darkBg = cfg.background === 'night' || cfg.background === 'dusk'
    || cfg.background === 'charcoal' || cfg.background === 'gradient_aurora'
    || cfg.background === 'animated_sparkles';
  const lineCol = darkBg ? '#e7f3f1' : INK;

  // Outfit + accessory resolution (new optional layers; safe defaults).
  const outfitId = cfg.outfit ?? 'tank';
  const outfitColor = OUTFIT_COLORS[outfitId] ?? SHIRT;
  const wristbandId = cfg.wristbands ?? 'none';
  const wristbandColor = WRISTBAND_COLORS[wristbandId] ?? null;
  const accentId = cfg.accentTheme ?? 'none';
  const accentColor = ACCENT_THEME[accentId] ?? 'transparent';
  const hasAccent = accentId !== 'none' && accentColor !== 'transparent';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* clip to a rounded square via background */}
      <Rect x={0} y={0} width={100} height={100} rx={18} fill={bg} />
      {cfg.background === 'peaks' ? (
        <Path d="M0,100 L0,82 L20,60 L36,76 L54,52 L74,80 L100,66 L100,100 Z" fill="#bfe9e2" />
      ) : null}
      {/* Gradient/animated premium backgrounds get a simple decorative accent
          band so they read as distinct without needing real SVG gradients. */}
      {cfg.background === 'gradient_sunset' ? (
        <Rect x={0} y={0} width={100} height={50} rx={18} fill="#ffd166" opacity={0.55} />
      ) : null}
      {cfg.background === 'gradient_ocean' ? (
        <Rect x={0} y={52} width={100} height={48} fill="#00b4d8" opacity={0.5} />
      ) : null}
      {cfg.background === 'gradient_aurora' ? (
        <Path d="M0,30 Q50,10 100,30 L100,0 L0,0 Z" fill="#7c3aed" opacity={0.5} />
      ) : null}
      {cfg.background === 'animated_confetti' ? (
        <G opacity={0.8}>
          <Rect x={14} y={14} width={5} height={5} rx={1} fill="#ef476f" />
          <Rect x={78} y={20} width={5} height={5} rx={1} fill="#06d6a0" />
          <Rect x={24} y={70} width={5} height={5} rx={1} fill="#ffd166" />
          <Rect x={70} y={66} width={5} height={5} rx={1} fill="#118ab2" />
        </G>
      ) : null}
      {cfg.background === 'animated_sparkles' ? (
        <G fill="#ffe66d">
          <Circle cx={18} cy={20} r={1.8} /><Circle cx={82} cy={26} r={1.4} />
          <Circle cx={30} cy={74} r={1.6} /><Circle cx={74} cy={70} r={1.8} />
        </G>
      ) : null}

      {/* Behind-hair mass */}
      {cfg.hair === 'afro' ? <Circle cx={50} cy={44} r={34} fill={hair} /> : null}
      {(cfg.hair === 'long' || cfg.hair === 'wavyLong') ? <Ellipse cx={50} cy={52} rx={34} ry={36} fill={hair} /> : null}
      {cfg.hair === 'ponytail' ? <Ellipse cx={78} cy={42} rx={9} ry={17} fill={hair} /> : null}
      {/* New behind-hair masses */}
      {cfg.hair === 'dreadlocks' ? (
        <G fill={hair}>
          <Rect x={20} y={36} width={6} height={50} rx={3} /><Rect x={29} y={40} width={6} height={48} rx={3} />
          <Rect x={65} y={40} width={6} height={48} rx={3} /><Rect x={74} y={36} width={6} height={50} rx={3} />
        </G>
      ) : null}
      {cfg.hair === 'cornrows' ? <Ellipse cx={50} cy={50} rx={31} ry={33} fill={hair} /> : null}
      {cfg.hair === 'twoStrandTwists' ? (
        <G fill={hair}>
          <Ellipse cx={24} cy={66} rx={7} ry={16} /><Ellipse cx={76} cy={66} rx={7} ry={16} />
        </G>
      ) : null}
      {cfg.hair === 'ringlets' ? (
        <G fill={hair}>
          <Circle cx={22} cy={54} r={7} /><Circle cx={24} cy={66} r={6} />
          <Circle cx={78} cy={54} r={7} /><Circle cx={76} cy={66} r={6} />
        </G>
      ) : null}

      {/* Neck */}
      <Rect x={43} y={58} width={14} height={22} fill={skin} />

      {/* Outfit / shoulders — replaces the legacy flat shirt with the chosen top.
           Base shoulder mass is always drawn; trims/accents layer on top. */}
      <Path d="M14,100 C14,80 32,74 50,74 C68,74 86,80 86,100 Z" fill={outfitColor} />
      {/* Racerback / tank: cut-in straps shown as lighter neckline notches. */}
      {(outfitId === 'racerback' || outfitId === 'tank') ? (
        <Path d="M40,76 Q50,82 60,76 L60,100 L40,100 Z" fill={bg} opacity={0.18} />
      ) : null}
      {/* Hoodie / zipUp: collar + center seam. */}
      {(outfitId === 'hoodie' || outfitId === 'zipUp') ? (
        <G>
          <Path d="M40,76 Q50,86 60,76" stroke={INK} strokeWidth={2} fill="none" opacity={0.4} />
          <Line x1={50} y1={78} x2={50} y2={100} stroke={INK} strokeWidth={1.6} opacity={0.4} />
        </G>
      ) : null}
      {/* Compression / elite: subtle paneling lines. */}
      {(outfitId === 'compression' || outfitId === 'eliteCompression') ? (
        <G stroke="#ffffff" strokeWidth={1.2} opacity={0.25} fill="none">
          <Path d="M30,80 Q50,86 70,80" /><Line x1={50} y1={80} x2={50} y2={100} />
        </G>
      ) : null}
      {/* Team jersey: number-plate hint. */}
      {outfitId === 'teamJersey' ? (
        <Rect x={44} y={84} width={12} height={12} rx={2} fill="#ffffff" opacity={0.85} />
      ) : null}
      {/* Pro kit: contrast shoulder stripes. */}
      {outfitId === 'proKit' ? (
        <G fill="#ffffff" opacity={0.85}>
          <Path d="M18,98 L24,86 L28,88 L22,100 Z" /><Path d="M82,98 L76,86 L72,88 L78,100 Z" />
        </G>
      ) : null}
      {/* Gold trim: gold collar piping. */}
      {outfitId === 'goldTrim' ? (
        <Path d="M38,77 Q50,87 62,77" stroke="#f5c542" strokeWidth={3} fill="none" />
      ) : null}
      {/* Animated rainbow: stacked bands. */}
      {outfitId === 'animatedRainbow' ? (
        <G opacity={0.9}>
          <Path d="M14,100 C14,92 32,88 50,88 C68,88 86,92 86,100 Z" fill="#ffd166" />
          <Path d="M16,100 C16,95 32,93 50,93 C68,93 84,95 84,100 Z" fill="#06d6a0" />
        </G>
      ) : null}

      {/* Head / face shape */}
      {cfg.face === 'round' ? <Circle cx={50} cy={46} r={28} fill={skin} /> : null}
      {cfg.face === 'oval' ? <Ellipse cx={50} cy={46} rx={24} ry={30} fill={skin} /> : null}
      {cfg.face === 'square' ? <Rect x={24} y={20} width={52} height={54} rx={16} fill={skin} /> : null}
      {cfg.face === 'wide' ? <Ellipse cx={50} cy={48} rx={30} ry={26} fill={skin} /> : null}
      {/* New face shapes */}
      {cfg.face === 'heart' ? <Path d="M22,34 Q22,20 36,20 Q50,20 50,30 Q50,20 64,20 Q78,20 78,34 Q78,58 50,74 Q22,58 22,34 Z" fill={skin} /> : null}
      {cfg.face === 'diamond' ? <Path d="M50,18 L74,46 L50,74 L26,46 Z" fill={skin} /> : null}

      {/* Ears */}
      <Ellipse cx={23} cy={48} rx={4} ry={6} fill={skin} />
      <Ellipse cx={77} cy={48} rx={4} ry={6} fill={skin} />

      {/* Facial hair */}
      {cfg.facialHair === 'stubble' ? (
        <Path d="M28,52 Q50,80 72,52 Q66,70 50,72 Q34,70 28,52 Z" fill={hair} opacity={0.3} />
      ) : null}
      {(cfg.facialHair === 'fullBeard' || cfg.facialHair === 'vikingBeard' || cfg.facialHair === 'shortBoxBeard') ? (
        <Path d="M27,50 Q30,82 50,82 Q70,82 73,50 Q66,72 50,72 Q34,72 27,50 Z" fill={hair} />
      ) : null}
      {/* Viking beard: longer braided point. */}
      {cfg.facialHair === 'vikingBeard' ? <Path d="M44,78 Q50,94 56,78 Q50,84 44,78 Z" fill={hair} /> : null}
      {cfg.facialHair === 'chinStrap' ? (
        <Path d="M27,50 Q28,72 50,74 Q72,72 73,50 Q70,66 50,68 Q30,66 27,50 Z" fill={hair} />
      ) : null}
      {(cfg.facialHair === 'goatee' || cfg.facialHair === 'soul_patch') ? <Path d="M44,64 Q50,76 56,64 Q50,70 44,64 Z" fill={hair} /> : null}
      {(cfg.facialHair === 'mustache' || cfg.facialHair === 'goatee' || cfg.facialHair === 'handlebar') ? (
        <Path d="M40,56 Q50,62 60,56 Q50,59 40,56 Z" fill={hair} />
      ) : null}
      {/* Handlebar: curled tips. */}
      {cfg.facialHair === 'handlebar' ? (
        <G fill={hair}>
          <Path d="M40,56 Q34,54 34,58 Q36,57 40,57 Z" /><Path d="M60,56 Q66,54 66,58 Q64,57 60,57 Z" />
        </G>
      ) : null}

      {/* Front hair */}
      {(cfg.hair === 'short' || cfg.hair === 'sidePart' || cfg.hair === 'long'
        || cfg.hair === 'ponytail' || cfg.hair === 'wavyLong' || cfg.hair === 'bob') ? (
        <Path d="M24,40 Q26,18 50,18 Q74,18 76,40 Q70,28 50,28 Q30,28 24,40 Z" fill={hair} />
      ) : null}
      {cfg.hair === 'sidePart' ? <Path d="M50,20 Q44,30 40,40" stroke={bg} strokeWidth={2} fill="none" /> : null}
      {(cfg.hair === 'buzz' || cfg.hair === 'pixie' || cfg.hair === 'cornrows'
        || cfg.hair === 'undercut') ? (
        <Path d="M26,40 Q28,24 50,24 Q72,24 74,40 Q68,33 50,33 Q32,33 26,40 Z" fill={hair} opacity={cfg.hair === 'buzz' ? 0.85 : 1} />
      ) : null}
      {/* Cornrows: vertical part lines. */}
      {cfg.hair === 'cornrows' ? (
        <G stroke={bg} strokeWidth={1.4} opacity={0.5}>
          <Line x1={38} y1={26} x2={38} y2={40} /><Line x1={50} y1={25} x2={50} y2={40} /><Line x1={62} y1={26} x2={62} y2={40} />
        </G>
      ) : null}
      {/* Undercut: shaved sides hint. */}
      {cfg.hair === 'undercut' ? (
        <Path d="M26,40 Q28,30 36,28 L36,40 Z" fill={skin} opacity={0.9} />
      ) : null}
      {(cfg.hair === 'curlyTop' || cfg.hair === 'ringlets') ? (
        <G fill={hair}>
          <Circle cx={34} cy={26} r={8} /><Circle cx={46} cy={20} r={9} />
          <Circle cx={58} cy={20} r={9} /><Circle cx={68} cy={27} r={8} />
        </G>
      ) : null}
      {(cfg.hair === 'bun' || cfg.hair === 'topKnot') ? (
        <G fill={hair}>
          <Path d="M26,38 Q28,22 50,22 Q72,22 74,38 Q68,30 50,30 Q32,30 26,38 Z" />
          <Circle cx={50} cy={16} r={cfg.hair === 'topKnot' ? 8 : 7} />
        </G>
      ) : null}
      {cfg.hair === 'mohawk' ? <Path d="M44,12 Q50,10 56,12 L54,34 Q50,30 46,34 Z" fill={hair} /> : null}
      {/* Quiff: swept-up front. */}
      {cfg.hair === 'quiff' ? (
        <Path d="M26,40 Q28,22 50,22 Q74,22 76,40 Q72,30 56,28 Q60,18 48,18 Q34,20 26,40 Z" fill={hair} />
      ) : null}
      {/* Slicked back: domed cap with sheen line. */}
      {cfg.hair === 'slickedBack' ? (
        <G>
          <Path d="M26,40 Q28,20 50,20 Q72,20 74,40 Q70,30 50,30 Q30,30 26,40 Z" fill={hair} />
          <Path d="M36,26 Q50,22 64,26" stroke="#ffffff" strokeWidth={1.4} opacity={0.25} fill="none" />
        </G>
      ) : null}
      {/* Messy: tufts. */}
      {cfg.hair === 'messy' ? (
        <G fill={hair}>
          <Path d="M24,40 Q26,18 50,18 Q74,18 76,40 Q70,26 60,30 Q64,20 52,24 Q56,16 44,22 Q40,18 36,28 Q30,26 24,40 Z" />
        </G>
      ) : null}
      {/* Pixie: short side-swept fringe accent. */}
      {cfg.hair === 'pixie' ? <Path d="M50,24 Q40,30 34,40 Q44,30 56,30 Q50,26 50,24 Z" fill={hair} /> : null}

      {/* Brows */}
      {cfg.brows === 'flat' ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round">
          <Line x1={34} y1={38} x2={45} y2={38} /><Line x1={55} y1={38} x2={66} y2={38} />
        </G>
      ) : null}
      {(cfg.brows === 'raised' || cfg.brows === 'arched') ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round" fill="none">
          <Path d="M34,37 Q39,33 45,36" /><Path d="M55,36 Q61,33 66,37" />
        </G>
      ) : null}
      {cfg.brows === 'angry' ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round">
          <Line x1={34} y1={36} x2={45} y2={40} /><Line x1={55} y1={40} x2={66} y2={36} />
        </G>
      ) : null}
      {/* New brows */}
      {cfg.brows === 'bushy' ? (
        <G stroke={hair} strokeWidth={5} strokeLinecap="round">
          <Line x1={34} y1={38} x2={45} y2={38} /><Line x1={55} y1={38} x2={66} y2={38} />
        </G>
      ) : null}
      {cfg.brows === 'thin' ? (
        <G stroke={hair} strokeWidth={1.6} strokeLinecap="round">
          <Line x1={35} y1={38} x2={45} y2={38} /><Line x1={55} y1={38} x2={65} y2={38} />
        </G>
      ) : null}
      {cfg.brows === 'worried' ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round">
          <Line x1={34} y1={40} x2={45} y2={36} /><Line x1={55} y1={36} x2={66} y2={40} />
        </G>
      ) : null}

      {/* Eyes */}
      {cfg.eyes === 'dots' ? (
        <G fill={INK}><Circle cx={40} cy={46} r={2.8} /><Circle cx={60} cy={46} r={2.8} /></G>
      ) : null}
      {(cfg.eyes === 'round' || cfg.eyes === 'surprised') ? (
        <G>
          <Circle cx={40} cy={46} r={cfg.eyes === 'surprised' ? 5.4 : 4.4} fill="#fff" />
          <Circle cx={60} cy={46} r={cfg.eyes === 'surprised' ? 5.4 : 4.4} fill="#fff" />
          <Circle cx={41} cy={46} r={2.3} fill={INK} /><Circle cx={61} cy={46} r={2.3} fill={INK} />
        </G>
      ) : null}
      {cfg.eyes === 'happy' ? (
        <G stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round">
          <Path d="M36,47 Q40,42 44,47" /><Path d="M56,47 Q60,42 64,47" />
        </G>
      ) : null}
      {cfg.eyes === 'wink' ? (
        <G stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round">
          <Path d="M36,46 Q40,42 44,46" /><Circle cx={60} cy={46} r={2.8} fill={INK} stroke="none" />
        </G>
      ) : null}
      {(cfg.eyes === 'sleepy' || cfg.eyes === 'halfLid') ? (
        <G stroke={INK} strokeWidth={3} strokeLinecap="round">
          <Line x1={36} y1={46} x2={44} y2={46} /><Line x1={56} y1={46} x2={64} y2={46} />
        </G>
      ) : null}
      {/* New eyes */}
      {cfg.eyes === 'stars' ? (
        <G fill="#f5c542" stroke={INK} strokeWidth={0.8}>
          <Path d="M40,42 L41.5,45 L44.8,45.2 L42.2,47.3 L43.2,50.5 L40,48.6 L36.8,50.5 L37.8,47.3 L35.2,45.2 L38.5,45 Z" />
          <Path d="M60,42 L61.5,45 L64.8,45.2 L62.2,47.3 L63.2,50.5 L60,48.6 L56.8,50.5 L57.8,47.3 L55.2,45.2 L58.5,45 Z" />
        </G>
      ) : null}
      {cfg.eyes === 'determined' ? (
        <G fill={INK}>
          <Path d="M36,44 L45,46 L45,48 L36,47 Z" /><Path d="M64,44 L55,46 L55,48 L64,47 Z" />
        </G>
      ) : null}
      {cfg.eyes === 'catEye' ? (
        <G>
          <Path d="M35,46 Q40,42 45,45 Q40,49 35,46 Z" fill="#fff" stroke={INK} strokeWidth={1.4} />
          <Path d="M55,45 Q60,42 65,46 Q60,49 55,45 Z" fill="#fff" stroke={INK} strokeWidth={1.4} />
          <Circle cx={40} cy={46} r={1.8} fill={INK} /><Circle cx={60} cy={46} r={1.8} fill={INK} />
        </G>
      ) : null}
      {cfg.eyes === 'fire' ? (
        <G>
          <Path d="M37,49 Q36,43 40,41 Q39,45 42,46 Q43,43 41,48 Z" fill="#ff6b35" />
          <Path d="M57,49 Q56,43 60,41 Q59,45 62,46 Q63,43 61,48 Z" fill="#ff6b35" />
          <Circle cx={40} cy={47} r={1.6} fill={INK} /><Circle cx={60} cy={47} r={1.6} fill={INK} />
        </G>
      ) : null}

      {/* Nose */}
      <Path d="M49,50 Q47,55 51,55" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.5} />

      {/* Mouth */}
      {cfg.mouth === 'smile' ? <Path d="M42,60 Q50,68 58,60" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
      {(cfg.mouth === 'grin' || cfg.mouth === 'bigSmile') ? <Path d="M41,59 Q50,70 59,59 Z" fill="#fff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" /> : null}
      {cfg.mouth === 'bigSmile' ? <Line x1={43} y1={62} x2={57} y2={62} stroke={INK} strokeWidth={1.4} opacity={0.5} /> : null}
      {(cfg.mouth === 'smirk' || cfg.mouth === 'cheeky') ? <Path d="M44,62 Q52,66 58,60" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
      {cfg.mouth === 'open' ? <Ellipse cx={50} cy={62} rx={5.5} ry={5} fill={INK} /> : null}
      {(cfg.mouth === 'flat' || cfg.mouth === 'determined') ? <Line x1={43} y1={62} x2={57} y2={62} stroke={INK} strokeWidth={3} strokeLinecap="round" /> : null}
      {cfg.mouth === 'pursed' ? <Ellipse cx={50} cy={62} rx={3} ry={2.4} fill={INK} /> : null}
      {cfg.mouth === 'whistle' ? <Circle cx={50} cy={62} r={3} fill="none" stroke={INK} strokeWidth={2.4} /> : null}
      {cfg.mouth === 'tongue' ? (
        <G>
          <Path d="M42,59 Q50,68 58,59" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M47,63 Q50,69 53,63 Z" fill="#ef6f7b" />
        </G>
      ) : null}
      {cfg.mouth === 'cheeky' ? <Path d="M52,64 Q55,67 57,64 Z" fill="#ef6f7b" /> : null}

      {/* Glasses */}
      {(cfg.glasses === 'round' || cfg.glasses === 'monocle') ? (
        <G stroke={lineCol} strokeWidth={2.4} fill="none">
          <Circle cx={40} cy={46} r={7} />
          {cfg.glasses === 'round' ? <Circle cx={60} cy={46} r={7} /> : null}
          {cfg.glasses === 'round' ? <Line x1={47} y1={46} x2={53} y2={46} /> : null}
          {cfg.glasses === 'monocle' ? <Line x1={40} y1={53} x2={40} y2={62} /> : null}
        </G>
      ) : null}
      {(cfg.glasses === 'square' || cfg.glasses === 'catEye') ? (
        <G stroke={lineCol} strokeWidth={2.4} fill="none">
          <Rect x={32} y={40} width={15} height={12} rx={cfg.glasses === 'catEye' ? 1 : 3} />
          <Rect x={53} y={40} width={15} height={12} rx={cfg.glasses === 'catEye' ? 1 : 3} />
          <Line x1={47} y1={46} x2={53} y2={46} />
          {cfg.glasses === 'catEye' ? <Path d="M32,40 L28,37" stroke={lineCol} strokeWidth={2.4} /> : null}
          {cfg.glasses === 'catEye' ? <Path d="M68,40 L72,37" stroke={lineCol} strokeWidth={2.4} /> : null}
        </G>
      ) : null}
      {cfg.glasses === 'sunglasses' ? (
        <G>
          <Rect x={32} y={40} width={15} height={12} rx={3} fill={INK} />
          <Rect x={53} y={40} width={15} height={12} rx={3} fill={INK} />
          <Line x1={47} y1={45} x2={53} y2={45} stroke={INK} strokeWidth={2.4} />
        </G>
      ) : null}
      {cfg.glasses === 'aviator' ? (
        <G>
          <Path d="M32,41 Q32,53 40,53 Q47,53 47,43 L32,41 Z" fill={INK} opacity={0.85} />
          <Path d="M68,41 Q68,53 60,53 Q53,53 53,43 L68,41 Z" fill={INK} opacity={0.85} />
          <Line x1={47} y1={44} x2={53} y2={44} stroke={INK} strokeWidth={2.2} />
        </G>
      ) : null}
      {cfg.glasses === 'sport' ? (
        <Path d="M30,42 Q30,52 42,51 Q50,50 58,51 Q70,52 70,42 Q50,46 30,42 Z" fill={INK} opacity={0.85} />
      ) : null}

      {/* Headwear */}
      {(cfg.headwear === 'headband' || cfg.headwear === 'sweatband') ? (
        <G>
          <Rect x={22} y={33} width={56} height={7} rx={2} fill={cfg.headwear === 'sweatband' ? '#ef476f' : HEADBAND} />
          {cfg.headwear === 'headband' ? <Path d="M74,36 l7,-3 l-1,6 z" fill={HEADBAND} /> : null}
          {cfg.headwear === 'sweatband' ? <Line x1={30} y1={36} x2={70} y2={36} stroke="#ffffff" strokeWidth={1.4} opacity={0.5} /> : null}
        </G>
      ) : null}
      {cfg.headwear === 'beanie' ? (
        <G>
          <Path d="M24,34 Q26,14 50,14 Q74,14 76,34 Z" fill="#5b8def" />
          <Rect x={24} y={32} width={52} height={6} rx={3} fill="#3f6fd0" />
        </G>
      ) : null}
      {(cfg.headwear === 'cap' || cfg.headwear === 'snapback') ? (
        <G>
          <Path d="M26,34 Q28,16 50,16 Q72,16 74,34 Z" fill={cfg.headwear === 'snapback' ? '#222a3a' : '#ef476f'} />
          <Path d="M50,34 Q74,34 84,40 Q74,30 50,30 Z" fill={cfg.headwear === 'snapback' ? '#161c28' : '#d63a5f'} />
          {cfg.headwear === 'snapback' ? <Rect x={40} y={20} width={20} height={8} rx={1} fill="#ffffff" opacity={0.85} /> : null}
        </G>
      ) : null}
      {cfg.headwear === 'visor' ? (
        <G>
          <Rect x={24} y={32} width={52} height={5} rx={2.5} fill="#0a8f84" />
          <Path d="M50,34 Q76,34 86,41 Q74,31 50,31 Z" fill="#0a8f84" />
        </G>
      ) : null}
      {/* New headwear */}
      {cfg.headwear === 'beretFlat' ? (
        <G>
          <Ellipse cx={50} cy={26} rx={26} ry={11} fill="#6d4c91" />
          <Circle cx={50} cy={16} r={2.4} fill="#6d4c91" />
        </G>
      ) : null}
      {cfg.headwear === 'cowboy' ? (
        <G>
          <Path d="M18,34 Q50,42 82,34 Q70,30 50,30 Q30,30 18,34 Z" fill="#8a5a2b" />
          <Path d="M30,32 Q32,16 50,16 Q68,16 70,32 Z" fill="#a06a33" />
          <Rect x={30} y={28} width={40} height={4} rx={1} fill="#5c3a18" />
        </G>
      ) : null}
      {cfg.headwear === 'crownGold' ? (
        <G fill="#f5c542" stroke="#caa12f" strokeWidth={1}>
          <Path d="M28,30 L28,16 L36,24 L44,14 L50,24 L56,14 L64,24 L72,16 L72,30 Z" />
          <Circle cx={36} cy={16} r={1.6} fill="#ef476f" stroke="none" />
          <Circle cx={50} cy={14} r={1.8} fill="#06d6a0" stroke="none" />
          <Circle cx={64} cy={16} r={1.6} fill="#118ab2" stroke="none" />
        </G>
      ) : null}

      {/* Wristbands — small bands at the lower shoulder/arm edges. */}
      {wristbandColor ? (
        <G fill={wristbandColor} stroke={INK} strokeWidth={0.6}>
          <Rect x={13} y={90} width={9} height={6} rx={2} />
          <Rect x={78} y={90} width={9} height={6} rx={2} />
          {(wristbandId === 'proGlitter' || wristbandId === 'animatedPulse') ? (
            <G fill="#ffffff" stroke="none" opacity={0.7}>
              <Circle cx={16} cy={93} r={0.9} /><Circle cx={20} cy={92} r={0.7} />
              <Circle cx={81} cy={93} r={0.9} /><Circle cx={85} cy={92} r={0.7} />
            </G>
          ) : null}
        </G>
      ) : null}

      {/* Profile ring (caller-supplied) */}
      {ring ? <Rect x={1} y={1} width={98} height={98} rx={18} fill="none" stroke={ring} strokeWidth={2} /> : null}

      {/* Accent glow ring — premium/streak highlight drawn on top so it reads as
          a glow around the whole avatar. Theme-adjacent: the color comes from the
          ACCENT_THEME catalog the customizer also uses. */}
      {hasAccent ? (
        <Rect x={2.5} y={2.5} width={95} height={95} rx={17} fill="none" stroke={accentColor} strokeWidth={3} />
      ) : null}
    </Svg>
  );
}

export default PeakAvatar;
