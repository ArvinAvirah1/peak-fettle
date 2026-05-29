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
});

module.exports = { NOTIFICATION_TYPES };
