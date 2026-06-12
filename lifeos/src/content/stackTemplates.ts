/**
 * Seeded stack templates (TICKET-103) — double as direction-engine protocol
 * building blocks (TICKET-106). Human-reviewable content; no string assembly.
 */

import type { AnchorType } from '../data/habits';

export interface StackTemplateStep {
  name: string;
  icon: string;
  estDurationSec?: number;
}

export interface StackTemplate {
  key: string;
  name: string;
  anchorType: AnchorType;
  anchorValue: string;
  steps: StackTemplateStep[];
}

export const STACK_TEMPLATES: StackTemplate[] = [
  {
    key: 'morning',
    name: 'Morning Stack',
    anchorType: 'time',
    anchorValue: '07:00',
    steps: [
      { name: 'Wake up on time', icon: 'sunny-outline' },
      { name: 'Read 10 pages', icon: 'book-outline', estDurationSec: 900 },
      { name: 'Stretch', icon: 'body-outline', estDurationSec: 300 },
      { name: 'Brush teeth', icon: 'sparkles-outline', estDurationSec: 120 },
      { name: 'Wash face', icon: 'water-outline', estDurationSec: 60 },
    ],
  },
  {
    key: 'shutdown',
    name: 'Work Shutdown',
    anchorType: 'time',
    anchorValue: '17:30',
    steps: [
      { name: 'Write tomorrow’s top 3', icon: 'list-outline', estDurationSec: 300 },
      { name: 'Clear inbox to zero-ish', icon: 'mail-open-outline', estDurationSec: 600 },
      { name: 'Close the laptop — say "done"', icon: 'checkmark-circle-outline' },
    ],
  },
  {
    key: 'pre-workout',
    name: 'Pre-Workout Prime',
    anchorType: 'event',
    anchorValue: 'workout_logged',
    steps: [
      { name: '30-second grounding', icon: 'fitness-outline', estDurationSec: 30 },
      { name: 'Review session plan', icon: 'clipboard-outline', estDurationSec: 120 },
    ],
  },
  {
    key: 'wind-down',
    name: 'Wind-Down',
    anchorType: 'time',
    anchorValue: '21:30',
    steps: [
      { name: 'Phone on charger — outside bedroom', icon: 'battery-charging-outline' },
      { name: 'One line of gratitude', icon: 'heart-outline', estDurationSec: 120 },
      { name: 'Lights low, read', icon: 'moon-outline', estDurationSec: 900 },
    ],
  },
];
