/**
 * Crisis resources — locale-aware lookup (TICKET-100 #1).
 *
 * ⚠️ PENDING FOUNDER REVIEW (Q9): a human must verify every number/copy line
 * below before any build ships. Do not edit without re-flagging for review.
 * Sign-off is recorded in lifeos/CONTENT_SAFETY.md.
 *
 * Copy rules: plain, non-clinical, never promises outcomes, never gates the
 * resource behind any interaction.
 */

export interface CrisisResource {
  locale: string;
  name: string;
  action: string;
  /** tel: or sms: URL */
  url: string;
}

const RESOURCES: Record<string, CrisisResource[]> = {
  US: [
    {
      locale: 'US',
      name: '988 Suicide & Crisis Lifeline',
      action: 'Call or text 988',
      url: 'tel:988',
    },
    {
      locale: 'US',
      name: 'Crisis Text Line',
      action: 'Text HOME to 741741',
      url: 'sms:741741',
    },
  ],
  GB: [
    {
      locale: 'GB',
      name: 'Samaritans',
      action: 'Call 116 123',
      url: 'tel:116123',
    },
  ],
};

const DEFAULT_REGION = 'US';

export function getCrisisResources(region?: string): CrisisResource[] {
  const key = (region ?? DEFAULT_REGION).toUpperCase();
  return RESOURCES[key] ?? RESOURCES[DEFAULT_REGION];
}

export const CRISIS_LEAD_COPY =
  'If things feel heavy right now, you deserve support from a real person.';
