/**
 * Mood check-in (TICKET-158 "Mood 2.0") — 2-tap flow: pick a mood face, then
 * Save. Tags/note are strictly optional (an optional 3rd tap), never
 * required. Multiple check-ins per day are legal now (schema v3 dropped
 * UNIQUE(date)) — this screen no longer prefills from an existing row; it
 * always creates a new check-in. Mood <= 2 renders the crisis banner after
 * save (TICKET-100) — never gated, never delayed.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { FadeSlideIn } from '../src/components/motion';
import { CrisisResourcesBanner } from '../src/components/CrisisResourcesBanner';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { haptic } from '../src/lib/haptics';
import { MOOD_TAGS, MoodTag, TAG_LABELS, addMood, moodsForDay, MoodRow } from '../src/data/mood';
import { MoodFacePicker, MOOD_FACES, TagChipRow } from '../src/components/mood/MoodEntry';

function formatLocalTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function labelForMood(mood: number): string {
  return MOOD_FACES.find((f) => f.value === mood)?.label ?? '';
}

export default function MoodCheckinScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [tags, setTags] = useState<MoodTag[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const [earlierToday, setEarlierToday] = useState<MoodRow[]>([]);

  useEffect(() => {
    void moodsForDay().then(setEarlierToday);
  }, []);

  const save = async (): Promise<void> => {
    if (mood == null || saving) return;
    setSaving(true);
    await addMood({ mood, tags, note: note.trim() || null });
    setSaving(false);
    haptic.success();
    if (mood <= 2) {
      setShowCrisis(true);
      setSaved(true);
    } else {
      router.back();
    }
  };

  const sleepTags: MoodTag[] = ['sleep_good', 'sleep_bad'];
  const otherTags = MOOD_TAGS.filter((t) => !sleepTags.includes(t));

  const sleepOptions = sleepTags.map((t) => ({ key: t, label: TAG_LABELS[t] }));
  const otherOptions = otherTags.map((t) => ({ key: t, label: TAG_LABELS[t] }));

  const toggleSleep = (key: string): void => {
    setTags((prev) => {
      const without = prev.filter((x) => !sleepTags.includes(x));
      const t = key as MoodTag;
      return prev.includes(t) ? without : [...without, t];
    });
  };

  const toggleOther = (key: string): void => {
    setTags((prev) => {
      const t = key as MoodTag;
      return prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
    });
  };

  const earlierCaption =
    earlierToday.length > 0
      ? earlierToday.map((row) => `${formatLocalTime(row.ts)} — ${labelForMood(row.mood)}`).join(' · ')
      : '';

  return (
    <ScreenLayout>
      <FadeSlideIn index={0}>
        <SectionTitle top={spacing.s3}>How are you, really?</SectionTitle>
      </FadeSlideIn>

      {earlierCaption ? (
        <FadeSlideIn index={1}>
          <Text
            accessibilityLabel={`Earlier today: ${earlierCaption}`}
            style={{
              color: c.textTertiary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.caption,
              marginBottom: spacing.s3,
            }}
          >
            Earlier today: {earlierCaption}
          </Text>
        </FadeSlideIn>
      ) : null}

      <FadeSlideIn index={2}>
        <MoodFacePicker value={mood} onChange={setMood} style={{ marginBottom: spacing.s4 }} />
      </FadeSlideIn>

      <FadeSlideIn index={3}>
        <SectionTitle>How was your sleep last night? (optional)</SectionTitle>
        <TagChipRow options={sleepOptions} selected={tags} onToggle={toggleSleep} style={{ marginBottom: spacing.s2 }} />
      </FadeSlideIn>

      <FadeSlideIn index={4}>
        <SectionTitle>Anything else? (optional)</SectionTitle>
        <TagChipRow options={otherOptions} selected={tags} onToggle={toggleOther} style={{ marginBottom: spacing.s2 }} />
      </FadeSlideIn>

      <FadeSlideIn index={5}>
        <PFInput
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="A line for future you"
          helper="Stays on this device. Included in your encrypted backup only."
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.s2 }}
        />
      </FadeSlideIn>

      {showCrisis ? <CrisisResourcesBanner /> : null}

      <FadeSlideIn index={6}>
        <PFButton
          label={saved ? 'Close' : 'Save check-in'}
          onPress={() => (saved ? router.back() : void save())}
          disabled={mood == null}
          loading={saving}
          style={{ marginTop: spacing.s3 }}
        />
      </FadeSlideIn>

      {!saved ? (
        <FadeSlideIn index={7}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View mood history"
            onPress={() => {
              haptic.selection();
              router.push('/mood-history');
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: HIT_TARGET,
              marginTop: spacing.s2,
              borderRadius: radius.md,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>
              View mood history
            </Text>
            <Ionicons name="chevron-forward" size={16} color={c.textSecondary} style={{ marginLeft: spacing.s1 }} />
          </Pressable>
        </FadeSlideIn>
      ) : null}
    </ScreenLayout>
  );
}
