'use strict';

/**
 * Canonical notification type strings for notification_queue.type.
 *
 * Use these constants in any code that INSERTs into notification_queue
 * so a typo in one writer can't create rows the dispatcher or client
 * can't recognise.
 *
 * Current writers:
 *   cohort-graduation.js  → COHORT_GRADUATION
 * Future writers (add constants here before implementing):
 *   group-streaks.js      → STREAK_MILESTONE  (not yet wiring pushes)
 *   plans route           → PLAN_READY        (not yet implemented)
 */
const NOTIFICATION_TYPES = Object.freeze({
    STREAK_MILESTONE:  'streak_milestone',
    COHORT_GRADUATION: 'cohort_graduation',
    PLAN_READY:        'plan_ready',
    // LIFEOS TICKET-110 — all opt-in, default OFF, max 2/day across LO_* types,
    // copy never references missed days (lifeos/CONTENT_SAFETY.md §6).
    LO_STACK_REMINDER: 'lo_stack_reminder',
    LO_WEEKLY_RECAP:   'lo_weekly_recap',
    LO_MOOD_PROMPT:    'lo_mood_prompt',
    LO_WEEKLY_REVIEW:  'lo_weekly_review',
    LO_MICRO_CHECK:    'lo_micro_check',
    // TICKET-123/124 — identity affirmations (local notification, opt-in,
    // copy never references missed days; CONTENT_SAFETY.md §6).
    LO_AFFIRMATION:    'lo_affirmation',
});

module.exports = { NOTIFICATION_TYPES };
