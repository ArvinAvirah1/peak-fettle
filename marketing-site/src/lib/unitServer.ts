import { headers } from 'next/headers';
import { unitForCountry, type Unit } from './units';

/**
 * The visitor's weight unit, resolved server-side from Vercel's geo header so
 * the very first paint is already correct — no kilos flashing to pounds after
 * hydration, and no unit stored per visitor.
 *
 * Reading a header opts the calling route out of static rendering. That is the
 * deliberate trade: the pages are small and cheap to render, and a marketing
 * site that shows an American 104 kg is worse than one that renders per request.
 */
export function getUnit(): Unit {
    return unitForCountry(headers().get('x-vercel-ip-country'));
}
