/**
 * Peak Fettle UI Component Library
 * Phase E — E-004: Component Library Rebuild
 *
 * Barrel export for all design-system components.
 * Import from this file — not from individual component files — to keep
 * imports clean and to allow internal restructuring without touching consumers.
 *
 * Usage:
 *   import { PFButton, PFCard, PFInput, PFProgressBar, PFProgressRing } from '../components/ui';
 *   import { ScreenLayout, PressableCard } from '../components/ui';
 */

export { PFButton } from './PFButton';
export type { PFButtonProps, PFButtonVariant, PFButtonSize } from './PFButton';

export { PFCard } from './PFCard';
export type { PFCardProps, PFCardVariant, PFCardPadding } from './PFCard';

export { PFInput } from './PFInput';
export type { PFInputProps } from './PFInput';

export { PFProgressBar, PFProgressRing } from './PFProgress';
export type { PFProgressBarProps, PFProgressRingProps } from './PFProgress';

export { ScreenLayout } from './ScreenLayout';
export type { ScreenLayoutProps } from './ScreenLayout';

export { PressableCard } from './PressableCard';
export type { PressableCardProps } from './PressableCard';
