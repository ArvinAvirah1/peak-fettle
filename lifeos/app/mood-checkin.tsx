/**
 * Mood check-in (TICKET-108) — 5-point calm scale, optional tags + sleep
 * step, optional note (on-device only). Mood ≤ 2 renders the crisis banner
 * after save (TICKET-100) — never gated, never delayed.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { CrisisResourcesBanner } from '../src/components/CrisisResourcesBanner';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { MOOD_TAGS, MoodTag, TAG_LABELS, moodForDay, upsertMood } from '../src/data/mood';

const MOOD_FACES: { value: 1 | 2 | 3 | 4 | 5; icon: string; label: string }[] = [
  { value: 1, icon: 'rainy-outline', label: 'Heavy' },
  { value: 2, icon: 'cloudy-outline', label: 'Low' },
  { value: 3, icon: 'partly-sunny-outline', label: 'Okay' },
  { value: 4, icon: 'sunny-outline', label: 'Good' },
  { value: 5, icon: 'star-outline', label: 'Great' },
];

export default function MoodCheckinScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [tags, setTags] = useState<MoodTag[]>([]);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);

  useEffect(() => {
    void moodForDay().then((row) => {
      if (row) {
        setMood(row.mood as 1 | 2 | 3 | 4 | 5);
        setTags(JSON.parse(row.tags_json) as MoodTag[]);
        setNote(row.note ?? '');
      }
    });
  }, []);

  const save = async (): Promise<void> => {
    if (mood == null) return;
    await upsertMood({ mood, tags, note: note.trim() || null });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (mood <= 2) {
      setShowCrisis(true);
      setSaved(true);
    } else {
      router.back();
    }
  };

  const sleepTags: MoodTag[] = ['sleep_good', 'sleep_bad'];
  const otherTags = MOOD_TAGS.filter((t) => !sleepTags.includes(t));

  return (
    <ScreenLayout>
      <SectionTitle top={spacing.s3}>How are you, really?</SectionTitle>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.s4 }}>
        {MOOD_FACES.map((f) => (
          <Pressable
            key={f.value}
            accessibilityRole="button"
            accessibilityLabel={`${f.label}, ${f.value} out of 5`}
            accessibilityState={{ selected: mood === f.value }}
            onPress={() => setMood(f.value)}
            style={({ pressed }) => ({
              alignItems: 'center',
              minWidth: HIT_TARGET + 12,
              minHeight: HIT_TARGET + 16,
              justifyContent: 'center',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: mood === f.value ? c.accentDefault : c.borderDefault,
              backgroundColor: mood === f.value ? c.accentMuted : 'transparent',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name={f.icon} size={26} color={mood === f.value ? c.accentDefault : c.textSecondary} />
            <Text style={{ color: mood === f.value ? c.textPrimary : c.textTertiary, fontFamily: fontFamily.medium, fontSize: fontSize.caption, marginTop: spacing.s1 }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>How was your sleep last night?</SectionTitle>
      <View style={{ flexDirection: 'row', marginBottom: spacing.s2 }}>
        {sleepTags.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityState={{ selected: tags.includes(t) }}
            onPress={() =>
              setTags((prev) => {
                const without = prev.filter((x) => !sleepTags.includes(x));
                return prev.includes(t) ? without : [...without, t];
              })
            }
            style={{
              minHeight: HIT_TARGET,
              paddingHorizontal: spacing.s4,
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: tags.includes(t) ? c.accentDefault : c.borderDefault,
              backgroundColor: tags.includes(t) ? c.accentMuted : 'transparent',
              marginRight: spacing.s2,
            }}
          >
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>{TAG_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>Anything else? (optional)</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.s2 }}>
        {otherTags.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityState={{ selected: tags.includes(t) }}
            onPress={() => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
            style={{
              minHeight: HIT_TARGET - 6,
              paddingHorizontal: spacing.s3,
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: tags.includes(t) ? c.accentDefault : c.borderDefault,
              backgroundColor: tags.includes(t) ? c.accentMuted : 'transparent',
              marginRight: spacing.s2,
              marginBottom: spacing.s2,
            }}
          >
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>{TAG_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>

      <PFInput
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="A line for future you"
        helper="Stays on this device. Included in your encrypted backup only."
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.s2 }}
      />

      {showCrisis ? <CrisisResourcesBanner /> : null}

      <PFButton
        label={saved ? 'Close' : 'Save check-in'}
        onPress={() => (saved ? router.back() : void save())}
        disabled={mood == null}
        style={{ marginTop: spacing.s3 }}
      />
    </ScreenLayout>
  );
}
