/**
 * PeakAvatar — TICKET-096 Phase 2 (art direction: "Peak Pals")
 *
 * Pure, layered SVG renderer for the parametric avatar. Given an AvatarConfig it
 * draws (back→front): background → behind-hair → shoulders → head → ears →
 * facial hair → front-hair → brows → eyes → nose → mouth → glasses → headwear.
 *
 * Stateless and side-effect free — the same config always renders identically, on
 * any device (the property the local-first backup relies on). Reusable anywhere
 * an avatar is shown (Profile, rankings rows, groups) by passing `size`.
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
} from './peakAvatarOptions';

const INK = '#23201c';
const SHIRT = '#1f7a8c';
const HEADBAND = '#0fb5a6';

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
  const darkBg = cfg.background === 'night';
  const lineCol = darkBg ? '#e7f3f1' : INK;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* clip to a rounded square via background */}
      <Rect x={0} y={0} width={100} height={100} rx={18} fill={bg} />
      {cfg.background === 'peaks' ? (
        <Path d="M0,100 L0,82 L20,60 L36,76 L54,52 L74,80 L100,66 L100,100 Z" fill="#bfe9e2" />
      ) : null}

      {/* Behind-hair mass */}
      {cfg.hair === 'afro' ? <Circle cx={50} cy={44} r={34} fill={hair} /> : null}
      {cfg.hair === 'long' ? <Ellipse cx={50} cy={52} rx={34} ry={36} fill={hair} /> : null}
      {cfg.hair === 'ponytail' ? <Ellipse cx={78} cy={42} rx={9} ry={17} fill={hair} /> : null}

      {/* Neck + shoulders */}
      <Rect x={43} y={58} width={14} height={22} fill={skin} />
      <Path d="M14,100 C14,80 32,74 50,74 C68,74 86,80 86,100 Z" fill={SHIRT} />

      {/* Head / face shape */}
      {cfg.face === 'round' ? <Circle cx={50} cy={46} r={28} fill={skin} /> : null}
      {cfg.face === 'oval' ? <Ellipse cx={50} cy={46} rx={24} ry={30} fill={skin} /> : null}
      {cfg.face === 'square' ? <Rect x={24} y={20} width={52} height={54} rx={16} fill={skin} /> : null}
      {cfg.face === 'wide' ? <Ellipse cx={50} cy={48} rx={30} ry={26} fill={skin} /> : null}

      {/* Ears */}
      <Ellipse cx={23} cy={48} rx={4} ry={6} fill={skin} />
      <Ellipse cx={77} cy={48} rx={4} ry={6} fill={skin} />

      {/* Facial hair */}
      {cfg.facialHair === 'stubble' ? (
        <Path d="M28,52 Q50,80 72,52 Q66,70 50,72 Q34,70 28,52 Z" fill={hair} opacity={0.3} />
      ) : null}
      {cfg.facialHair === 'fullBeard' ? (
        <Path d="M27,50 Q30,82 50,82 Q70,82 73,50 Q66,72 50,72 Q34,72 27,50 Z" fill={hair} />
      ) : null}
      {cfg.facialHair === 'goatee' ? <Path d="M44,64 Q50,76 56,64 Q50,70 44,64 Z" fill={hair} /> : null}
      {(cfg.facialHair === 'mustache' || cfg.facialHair === 'goatee') ? (
        <Path d="M40,56 Q50,62 60,56 Q50,59 40,56 Z" fill={hair} />
      ) : null}

      {/* Front hair */}
      {cfg.hair === 'short' || cfg.hair === 'sidePart' || cfg.hair === 'long' || cfg.hair === 'ponytail' ? (
        <Path d="M24,40 Q26,18 50,18 Q74,18 76,40 Q70,28 50,28 Q30,28 24,40 Z" fill={hair} />
      ) : null}
      {cfg.hair === 'sidePart' ? <Path d="M50,20 Q44,30 40,40" stroke={bg} strokeWidth={2} fill="none" /> : null}
      {cfg.hair === 'buzz' ? <Path d="M26,40 Q28,24 50,24 Q72,24 74,40 Q68,33 50,33 Q32,33 26,40 Z" fill={hair} opacity={0.85} /> : null}
      {cfg.hair === 'curlyTop' ? (
        <G fill={hair}>
          <Circle cx={34} cy={26} r={8} /><Circle cx={46} cy={20} r={9} />
          <Circle cx={58} cy={20} r={9} /><Circle cx={68} cy={27} r={8} />
        </G>
      ) : null}
      {cfg.hair === 'bun' ? (
        <G fill={hair}>
          <Path d="M26,38 Q28,22 50,22 Q72,22 74,38 Q68,30 50,30 Q32,30 26,38 Z" />
          <Circle cx={50} cy={16} r={7} />
        </G>
      ) : null}
      {cfg.hair === 'mohawk' ? <Path d="M44,12 Q50,10 56,12 L54,34 Q50,30 46,34 Z" fill={hair} /> : null}

      {/* Brows */}
      {cfg.brows === 'flat' ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round">
          <Line x1={34} y1={38} x2={45} y2={38} /><Line x1={55} y1={38} x2={66} y2={38} />
        </G>
      ) : null}
      {cfg.brows === 'raised' ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round" fill="none">
          <Path d="M34,37 Q39,33 45,36" /><Path d="M55,36 Q61,33 66,37" />
        </G>
      ) : null}
      {cfg.brows === 'angry' ? (
        <G stroke={hair} strokeWidth={3} strokeLinecap="round">
          <Line x1={34} y1={36} x2={45} y2={40} /><Line x1={55} y1={40} x2={66} y2={36} />
        </G>
      ) : null}

      {/* Eyes */}
      {cfg.eyes === 'dots' ? (
        <G fill={INK}><Circle cx={40} cy={46} r={2.8} /><Circle cx={60} cy={46} r={2.8} /></G>
      ) : null}
      {cfg.eyes === 'round' ? (
        <G>
          <Circle cx={40} cy={46} r={4.4} fill="#fff" /><Circle cx={60} cy={46} r={4.4} fill="#fff" />
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
      {cfg.eyes === 'sleepy' ? (
        <G stroke={INK} strokeWidth={3} strokeLinecap="round">
          <Line x1={36} y1={46} x2={44} y2={46} /><Line x1={56} y1={46} x2={64} y2={46} />
        </G>
      ) : null}

      {/* Nose */}
      <Path d="M49,50 Q47,55 51,55" stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.5} />

      {/* Mouth */}
      {cfg.mouth === 'smile' ? <Path d="M42,60 Q50,68 58,60" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
      {cfg.mouth === 'grin' ? <Path d="M41,59 Q50,70 59,59 Z" fill="#fff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" /> : null}
      {cfg.mouth === 'smirk' ? <Path d="M44,62 Q52,66 58,60" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
      {cfg.mouth === 'open' ? <Ellipse cx={50} cy={62} rx={5.5} ry={5} fill={INK} /> : null}
      {cfg.mouth === 'flat' ? <Line x1={43} y1={62} x2={57} y2={62} stroke={INK} strokeWidth={3} strokeLinecap="round" /> : null}
      {cfg.mouth === 'tongue' ? (
        <G>
          <Path d="M42,59 Q50,68 58,59" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M47,63 Q50,69 53,63 Z" fill="#ef6f7b" />
        </G>
      ) : null}

      {/* Glasses */}
      {cfg.glasses === 'round' ? (
        <G stroke={lineCol} strokeWidth={2.4} fill="none">
          <Circle cx={40} cy={46} r={7} /><Circle cx={60} cy={46} r={7} /><Line x1={47} y1={46} x2={53} y2={46} />
        </G>
      ) : null}
      {cfg.glasses === 'square' ? (
        <G stroke={lineCol} strokeWidth={2.4} fill="none">
          <Rect x={32} y={40} width={15} height={12} rx={3} /><Rect x={53} y={40} width={15} height={12} rx={3} /><Line x1={47} y1={46} x2={53} y2={46} />
        </G>
      ) : null}
      {cfg.glasses === 'sunglasses' ? (
        <G>
          <Rect x={32} y={40} width={15} height={12} rx={3} fill={INK} />
          <Rect x={53} y={40} width={15} height={12} rx={3} fill={INK} />
          <Line x1={47} y1={45} x2={53} y2={45} stroke={INK} strokeWidth={2.4} />
        </G>
      ) : null}

      {/* Headwear */}
      {cfg.headwear === 'headband' ? (
        <G>
          <Rect x={22} y={33} width={56} height={7} rx={2} fill={HEADBAND} />
          <Path d="M74,36 l7,-3 l-1,6 z" fill={HEADBAND} />
        </G>
      ) : null}
      {cfg.headwear === 'beanie' ? (
        <G>
          <Path d="M24,34 Q26,14 50,14 Q74,14 76,34 Z" fill="#5b8def" />
          <Rect x={24} y={32} width={52} height={6} rx={3} fill="#3f6fd0" />
        </G>
      ) : null}
      {cfg.headwear === 'cap' ? (
        <G>
          <Path d="M26,34 Q28,16 50,16 Q72,16 74,34 Z" fill="#ef476f" />
          <Path d="M50,34 Q74,34 84,40 Q74,30 50,30 Z" fill="#d63a5f" />
        </G>
      ) : null}
      {cfg.headwear === 'visor' ? (
        <G>
          <Rect x={24} y={32} width={52} height={5} rx={2.5} fill="#0a8f84" />
          <Path d="M50,34 Q76,34 86,41 Q74,31 50,31 Z" fill="#0a8f84" />
        </G>
      ) : null}

      {ring ? <Rect x={1} y={1} width={98} height={98} rx={18} fill="none" stroke={ring} strokeWidth={2} /> : null}
    </Svg>
  );
}

export default PeakAvatar;
