// Shared content — features, FAQ, disciplines, pricing. Authored from the
// product brief (INSTRUCTIONS.md). Single source so Home and sub-pages agree.

import type { IconName } from '@/components/Icon';

export type Feature = { icon: IconName; title: string; body: string };

export const FEATURES: Feature[] = [
    {
        icon: 'barbell',
        title: 'Track every set',
        body:
            'Log reps, weight, and effort in seconds. Sets group into workouts automatically, ' +
            'and the app estimates your 1RM from every working set — no spreadsheets.',
    },
    {
        icon: 'score',
        title: 'A strength score, 0–1000',
        body:
            'One honest number from your estimated 1RM. Beginners see fast early gains; ' +
            'advanced lifters see real, asymptotic progress. Or use industry-standard DOTS / Wilks.',
    },
    {
        icon: 'percentile',
        title: 'Percentiles that are fair',
        body:
            'See where you rank against athletes at your level — cohort-matched by sex (with a ' +
            'unisex opt-out), age, and years trained. A beginner is never measured against a veteran.',
    },
    {
        icon: 'ai',
        title: 'AI plans that adapt',
        body:
            'Answer a short survey and get a periodized plan built around your goals, equipment, ' +
            'and schedule. Swap exercises, shift days, adjust volume — it re-plans as you log.',
    },
    {
        icon: 'streak',
        title: 'Streaks you can keep',
        body:
            'Consistency is the whole game. Even a five-minute visit counts. Miss a day? A make-up ' +
            'window and an emergency override keep an honest streak alive when life happens.',
    },
    {
        icon: 'cardio',
        title: 'Lift and cardio, together',
        body:
            'Log a barbell session and a 5K in the same workout. Graphs adapt — splits and pace for ' +
            'cardio, estimated 1RM and score for strength. Every discipline in one place.',
    },
];

export const DISCIPLINES = [
    'Weightlifting', 'Powerlifting', 'Running', 'Cycling', 'Swimming', 'CrossFit', 'Team sports', 'Calisthenics',
];

export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
    {
        q: 'Is Peak Fettle free?',
        a: 'Yes. The free tier includes full progress tracking, competitive percentile rankings, and a ' +
           'library of proven starter templates (Push/Pull/Legs, Upper/Lower). The paid tier unlocks ' +
           'fully personalized, AI-generated plans that adapt to your logged performance.',
    },
    {
        q: 'How is my strength score calculated?',
        a: 'Your strength score is a single 0–1000 number derived from your estimated one-rep max ' +
           '(E1RM), then weighted by training volume, progressive overload, and consistency. It is ' +
           'built to reward steady improvement, so beginners see fast early gains and advanced lifters ' +
           'see honest, slowing progress. Prefer an established standard? Switch to DOTS or Wilks at ' +
           'any time — the same scoring experienced lifters already trust.',
    },
    {
        q: 'How are the percentiles calculated?',
        a: 'Every ranking is cohort-matched by sex (with an opt-out for a unisex scale), age, and total ' +
           'years in the sport — because relative gains naturally slow as you advance. You are compared ' +
           'to people in a genuinely similar situation, never to a 10-year veteran.',
    },
    {
        q: 'Do I have to lift weights to use it?',
        a: 'No. Peak Fettle tracks weightlifting, running, cycling, swimming, team sports and more. ' +
           'For cardio it follows split times, pace trends, and consistency instead of 1RM.',
    },
    {
        q: 'What happens if I miss a workout?',
        a: 'Missed sessions are handled without shame. You get a make-up window within the same week, ' +
           'plus an emergency override for genuine life events. A streak is only lost if two sessions ' +
           'are missed in a week with no make-up and no override.',
    },
    {
        q: 'How do the AI plans handle weight goals?',
        a: 'You set a cut, bulk, or recomp target at any time. The AI assesses feasibility and guides you ' +
           'toward a sustainable target — explaining why aggressive short-term goals tend to relapse. ' +
           'You always have the final say.',
    },
    {
        q: 'Which devices are supported?',
        a: 'iOS and Android. Wearable integration (Apple Watch, Garmin, and more) is on the roadmap; at ' +
           'launch, stats are entered manually or through the in-app session logger.',
    },
    {
        q: 'Is Peak Fettle a substitute for medical or coaching advice?',
        a: 'No. Peak Fettle is a training and tracking tool, not medical advice. Its scores, percentiles, ' +
           'and AI plans are informational. Consult a qualified professional before starting or changing ' +
           'a program, particularly if you have an injury or a medical condition.',
    },
];

export type Plan = {
    name: string;
    price: string;
    cadence: string;
    tagline: string;
    cta: string;
    featured?: boolean;
    features: string[];
};

export const PLANS: Plan[] = [
    {
        name: 'Free',
        price: '£0',
        cadence: 'forever',
        tagline: 'Everything you need to track and rank — already ahead of most paid apps.',
        cta: 'Get started free',
        features: [
            'Unlimited set & workout logging',
            'Estimated 1RM + 0–1000 strength score',
            'DOTS / Wilks scoring',
            'Competitive percentile rankings',
            'Starter templates (PPL, Upper/Lower)',
            'Habit streaks with make-up windows',
            'Lift + cardio in one log',
        ],
    },
    {
        name: 'Pro',
        price: '£6.99',
        cadence: 'per month',
        tagline: 'Personalized, adaptive coaching that re-plans around your real performance.',
        cta: 'Start Pro',
        featured: true,
        features: [
            'Everything in Free',
            'AI-generated personalized plans',
            'Adapts automatically to your logs',
            'Editable: swap exercises, shift days',
            'Feasibility-checked body-comp goals',
            'Multi-discipline programming',
            'Priority support',
        ],
    },
];
