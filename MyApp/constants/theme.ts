/**
 * Peak Fettle brand color system.
 * Palette: dark navy · turquoise · slate grey
 */

import { Platform } from 'react-native';

// ── Brand primitives ────────────────────────────────────────────────────────
export const Brand = {
  // Backgrounds
  navyDeep:    '#09151F', // darkest bg (dark mode bg)
  navyMid:     '#0D2137', // card / surface
  navySurface: '#152D42', // slightly lifted surface
  navyLight:   '#1A3A52', // header / elevated card

  // Accent
  turquoise:   '#00C9B8', // primary brand accent
  turquoiseHi: '#1ADDD0', // lighter highlight
  skyBlue:     '#0EA5C9', // secondary accent

  // Grey scale
  slateDeep:   '#3D5268', // muted elements
  slateMid:    '#64788A', // icons, inactive tabs
  slateLight:  '#8BA0B4', // secondary text
  offWhite:    '#E2ECF4', // primary text on dark
  iceWhite:    '#F0F6FA', // bg on light mode

  // Light-mode specifics
  lightBg:     '#F0F5FA',
  lightSurface:'#E2EAF2',
  lightText:   '#0D2137',
  lightMuted:  '#64788A',
};

const tintColorLight = Brand.skyBlue;
const tintColorDark  = Brand.turquoise;

export const Colors = {
  light: {
    text:            Brand.lightText,
    background:      Brand.lightBg,
    surface:         Brand.lightSurface,
    tint:            tintColorLight,
    accent:          Brand.turquoise,
    icon:            Brand.lightMuted,
    tabIconDefault:  Brand.slateMid,
    tabIconSelected: tintColorLight,
    tabBar:          '#FFFFFF',
    header:          Brand.navyMid,
  },
  dark: {
    text:            Brand.offWhite,
    background:      Brand.navyDeep,
    surface:         Brand.navyMid,
    tint:            tintColorDark,
    accent:          Brand.turquoise,
    icon:            Brand.slateLight,
    tabIconDefault:  Brand.slateMid,
    tabIconSelected: tintColorDark,
    tabBar:          Brand.navyMid,
    header:          Brand.navyLight,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
