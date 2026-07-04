/**
 * Glossary term data — the single source of truth for every fitness term the
 * app explains to users.
 *
 * TICKET-043 / ROADMAP 1.1.
 *
 * This is intentionally a typed local constant rather than an API call:
 *  - the term set changes at the speed of product copy, not user data
 *  - offline-first is a project rule; definitions must be available with no
 *    connectivity
 *
 * To add a term: append an entry to GLOSSARY_TERMS. Keep `slug` lowercase,
 * hyphen-free where possible, and stable — it is the AsyncStorage key suffix
 * for first-encounter tracking and the `?term=` deep-link value.
 *
 * Definitions are deliberately ONE plain-English sentence. If a term needs more
 * than a sentence, that belongs in a "learn more" article, not here.
 */

export type GlossaryCategory =
  | 'logging'
  | 'strength'
  | 'rankings'
  | 'programming'
  | 'cardio';

export interface GlossaryTermEntry {
  /** Stable identifier — AsyncStorage key suffix + deep-link value. */
  slug: string;
  /** Display term, e.g. "1RM". */
  term: string;
  /** One plain-English sentence. No jargon inside the definition itself. */
  definition: string;
  /** Grouping tag — drives the category chip in the glossary list. */
  category: GlossaryCategory;
  /** Optional alternate spellings/expansions to widen search matches. */
  aliases?: string[];
}

export const GLOSSARY_TERMS: readonly GlossaryTermEntry[] = [
  {
    slug: 'set',
    term: 'Set',
    definition:
      'A group of repetitions performed back-to-back before you rest — for example, 8 push-ups in a row is one set.',
    category: 'logging',
  },
  {
    slug: 'rep',
    term: 'Rep',
    definition:
      'One single repetition of an exercise — lowering and lifting the weight once.',
    category: 'logging',
    aliases: ['repetition'],
  },
  {
    slug: 'pr',
    term: 'PR',
    definition:
      'Personal Record — the best you have ever done on an exercise, whether the heaviest weight or the most reps.',
    category: 'logging',
    aliases: ['personal record', 'personal best'],
  },
  {
    slug: '1rm',
    term: '1RM',
    definition:
      'One-Rep Max — the most weight you can lift for a single repetition; the app can estimate it from your heavier sets.',
    category: 'strength',
    aliases: ['one rep max', 'one-rep max', 'max'],
  },
  {
    slug: 'rpe',
    term: 'RPE',
    definition:
      'Rate of Perceived Exertion — a 1-to-10 score of how hard a set felt, where 10 means you could not have done another rep. Peak Fettle logs RIR and can display it as RPE (10 − RIR) — switch this in Settings.',
    category: 'logging',
    aliases: ['rate of perceived exertion'],
  },
  {
    slug: 'rir',
    term: 'RIR',
    definition:
      'Reps In Reserve — how many more reps you could have done at the end of a set before failing. This is what Peak Fettle stores; you can display it as RPE instead in Settings (RPE = 10 − RIR).',
    category: 'logging',
    aliases: ['reps in reserve'],
  },
  {
    slug: 'progressive-overload',
    term: 'Progressive Overload',
    definition:
      'Gradually doing a little more over time — more weight, reps, or sets — so your body keeps adapting and getting stronger.',
    category: 'programming',
  },
  {
    slug: 'wilks',
    term: 'Wilks Score',
    definition:
      'A number that lets lifters of different bodyweights compare their strength fairly; available in Peak Fettle as a display option.',
    category: 'rankings',
    aliases: ['wilks score'],
  },
  {
    slug: 'dots',
    term: 'DOTS Score',
    definition:
      'A bodyweight-adjusted strength score — this is the number Peak Fettle uses to calculate your percentile ranking.',
    category: 'rankings',
    aliases: ['dots score'],
  },
  {
    slug: 'percentile',
    term: 'Percentile',
    definition:
      'Where you rank compared with similar athletes — a 70th percentile means you are stronger than about 70% of your cohort.',
    category: 'rankings',
  },
  {
    slug: 'normalized-strength-score',
    term: 'Normalized Strength Score',
    definition:
      'A single strength number that accounts for your bodyweight, age, and sex so progress is comparable over time.',
    category: 'rankings',
    aliases: ['normalised strength score', 'peak fettle score'],
  },
  {
    slug: 'deload',
    term: 'Deload',
    definition:
      'A planned easier week of training that lets your body recover so you can keep making progress without burning out.',
    category: 'programming',
  },
  {
    slug: 'periodization',
    term: 'Periodization',
    definition:
      'Organising your training into phases — building volume, then intensity, then recovery — instead of doing the same thing every week.',
    category: 'programming',
    aliases: ['periodisation'],
  },
  {
    slug: 'amrap',
    term: 'AMRAP',
    definition:
      'As Many Reps As Possible — a set where you do as many good reps as you can rather than stopping at a fixed number.',
    category: 'logging',
    aliases: ['as many reps as possible'],
  },
  {
    slug: 'cohort',
    term: 'Cohort',
    definition:
      'The group of Peak Fettle athletes you are ranked against — matched by age, sex, experience, and sport.',
    category: 'rankings',
  },
  {
    slug: 'make-up-window',
    term: 'Make-up Window',
    definition:
      'A short grace period after a missed day during which a logged session still keeps your streak alive.',
    category: 'programming',
    aliases: ['makeup window', 'make up window'],
  },
] as const;

/** Category → human label for the chip shown next to each entry. */
export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  logging: 'Logging',
  strength: 'Strength',
  rankings: 'Rankings',
  programming: 'Training',
  cardio: 'Cardio',
};

/**
 * Look up a single term by slug. Returns `undefined` if the slug is unknown,
 * which callers (e.g. GlossaryTerm) should treat as "render plain text, no
 * tooltip" rather than throwing.
 */
export function getGlossaryTerm(slug: string): GlossaryTermEntry | undefined {
  return GLOSSARY_TERMS.find((t) => t.slug === slug);
}

/**
 * Case-insensitive search over term, definition, and aliases. Returns the full
 * list when the query is empty/whitespace.
 */
export function searchGlossary(query: string): readonly GlossaryTermEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return GLOSSARY_TERMS;
  return GLOSSARY_TERMS.filter((t) => {
    if (t.term.toLowerCase().includes(q)) return true;
    if (t.definition.toLowerCase().includes(q)) return true;
    if (t.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}
