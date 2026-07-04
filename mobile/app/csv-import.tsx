/**
 * CsvImportScreen — PL-2 (Garmin/Strava) + TICKET-135 (Strong/Hevy) CSV import.
 *
 * Two independent import paths, auto-detected by header signature:
 *   1. Garmin Connect / Strava activity exports — unchanged from PL-2: parsed
 *      and validated SERVER-SIDE via POST /import/csv (multipart). Pro-only
 *      (free/local-first accounts have no server to process it — same gate as
 *      before).
 *   2. Strong / Hevy workout exports (TICKET-135) — one row per SET, parsed
 *      ENTIRELY ON-DEVICE (mobile/src/lib/importers/{strongCsv,hevyCsv}.ts) and
 *      written straight to the local-first data layer
 *      (mobile/src/lib/importers/importEngine.ts, which mirrors the exact
 *      write shapes of localWorkouts.ts / usePowerSyncLog.ts). This works for
 *      BOTH tiers with NO network call — the local-first invariant (CLAUDE.md
 *      §1) holds because Strong/Hevy rows land in the same on-device `sets`/
 *      `workouts` tables every other local-first write path uses; a synced
 *      (Pro) user's normal PowerSync upload path picks the new local rows up
 *      the same way it does any other local write.
 *
 * Detection: the file is read once, its header row is matched against
 * isStrongHeader() / isHevyHeader() first (cheap, on-device); if neither
 * matches, we fall back to the original Garmin/Strava server upload flow
 * unchanged (that parser lives server-side and this screen never inspected
 * its header format before this ticket either).
 *
 * Exercise-name resolution: unmatched names open ManualMatchSheet so the user
 * either picks an existing local exercise name or creates a new local-only
 * "custom" exercise (a fresh genId(), remembered in the exercise_names cache —
 * NOT a call to POST /exercises, which is Pro-gated per ExercisePicker.tsx).
 * The resolution is cached for the rest of the file (importEngine.ts).
 *
 * Note: expo-document-picker / expo-file-system must be installed for file
 * picking/reading to work (same fallback-with-clear-error pattern as before).
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
  Alert,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/ThemeContext';
import { apiClient } from '../src/api/client';
import { useAuth } from '../src/hooks/useAuth';
import { isLocalFirst } from '../src/data/backup/tierPolicy';
import { PFButton } from '../src/components/ui/PFButton';
import { PFCard } from '../src/components/ui/PFCard';
import { localDb, genId } from '../src/db/localDb';
import { rememberExerciseName, getExerciseNameMap } from '../src/data/exerciseNames';
import { getEngineExerciseCatalog } from '../src/lib/trainingEngine/exerciseCatalog';
import { isStrongHeader, parseStrongCsv } from '../src/lib/importers/strongCsv';
import { isHevyHeader, parseHevyCsv } from '../src/lib/importers/hevyCsv';
import { parseCsv } from '../src/lib/importers/csvUtil';
import { importParsedFile } from '../src/lib/importers/importEngine';
import { MatchCandidate } from '../src/lib/importers/nameMapping';
import { ImportSummary, ParsedImportFile } from '../src/lib/importers/types';
import { useTranslation } from 'react-i18next';
import i18n from '../src/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  message?: string;
}

/** A resolved manual exercise match, or null when the user skipped it. */
type ManualMatchChoice = { exerciseId: string; exerciseName: string } | null;
/** Resolver callback held while ManualMatchSheet is awaiting a user choice. */
type MatchResolver = (choice: ManualMatchChoice) => void;

interface PickedFile {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pickCsvFile(): Promise<PickedFile | null> {
  try {
    // Dynamically import so the screen renders even if the package is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentPicker = require('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'android' ? 'text/csv' : '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];

    // Validate extension client-side
    if (!asset.name.toLowerCase().endsWith('.csv')) {
      Alert.alert(i18n.t('screens:csvImport.wrongFileTypeTitle'), i18n.t('screens:csvImport.wrongFileTypeMessage'));
      return null;
    }

    return { name: asset.name, uri: asset.uri, mimeType: asset.mimeType, size: asset.size };
  } catch (e: any) {
    if (e?.code === 'MODULE_NOT_FOUND' || e?.message?.includes("Cannot find module 'expo-document-picker'")) {
      Alert.alert(
        i18n.t('screens:csvImport.packageNotInstalledTitle'),
        i18n.t('screens:csvImport.docPickerMissingMessage'),
      );
    } else {
      Alert.alert(i18n.t('screens:csvImport.errorTitle'), i18n.t('screens:csvImport.pickerErrorMessage'));
    }
    return null;
  }
}

/** Read the picked file's full text content via expo-file-system, with the
 * same graceful "package missing" fallback as the picker above. */
async function readCsvText(uri: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system');
    return await FileSystem.readAsStringAsync(uri);
  } catch (e: any) {
    if (e?.code === 'MODULE_NOT_FOUND' || e?.message?.includes("Cannot find module 'expo-file-system'")) {
      Alert.alert(
        i18n.t('screens:csvImport.packageNotInstalledTitle'),
        i18n.t('screens:csvImport.fileSystemMissingMessage'),
      );
    } else {
      Alert.alert(i18n.t('screens:csvImport.errorTitle'), i18n.t('screens:csvImport.readErrorMessage'));
    }
    return null;
  }
}

/** Detect which importer a file belongs to from just its header row. Cheap —
 * only parses the header, not the whole file, so this can run before we
 * decide which (if any) local parser to hand the full text to. */
type DetectedFormat = 'strong' | 'hevy' | 'garmin_strava' | 'unknown';

function detectFormat(text: string): DetectedFormat {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const header = parseCsv(firstLine)[0] ?? [];
  if (header.length === 0) return 'unknown';
  if (isStrongHeader(header)) return 'strong';
  if (isHevyHeader(header)) return 'hevy';
  // Anything else falls back to the existing server-side Garmin/Strava path,
  // which does its own (server-side) validation — this screen never gated on
  // header shape for that path before this ticket.
  return 'garmin_strava';
}

// ---------------------------------------------------------------------------
// Manual match sheet — resolve one unmatched exercise name
// ---------------------------------------------------------------------------

interface ManualMatchSheetProps {
  visible: boolean;
  rawName: string | null;
  candidates: MatchCandidate[];
  onResolve: MatchResolver;
}

function ManualMatchSheet({ visible, rawName, candidates, onResolve }: ManualMatchSheetProps): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 50);
    return candidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [candidates, query]);

  const handleCreateCustom = () => {
    const name = query.trim() || rawName || '';
    if (!name) return;
    onResolve({ exerciseId: genId(), exerciseName: name });
    setQuery('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onResolve(null)} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={() => onResolve(null)} accessibilityLabel={t('screens:csvImport.dismissMatchSheet')} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bgSecondary,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s2,
            paddingHorizontal: spacing.s5,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderDefault }]} />
        <Text style={{ fontSize: fontSize.heading3, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: spacing.s3 }}>
          {t('screens:csvImport.matchTitle', { rawName })}
        </Text>
        <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, marginTop: spacing.s2, marginBottom: spacing.s3, lineHeight: 20 }}>
          {t('screens:csvImport.matchBody')}
        </Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('screens:csvImport.searchOrTypeName')}
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              backgroundColor: colors.bgTertiary,
              borderRadius: radius.md,
              color: colors.textPrimary,
              fontSize: fontSize.bodyMd,
              marginBottom: spacing.s3,
            },
          ]}
          accessibilityLabel={t('screens:csvImport.searchExercisesLabel')}
        />

        <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
          {filtered.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.matchRow, { borderBottomColor: colors.borderDefault }]}
              onPress={() => onResolve({ exerciseId: c.id, exerciseName: c.name })}
              accessibilityRole="button"
              accessibilityLabel={t('screens:csvImport.matchTo', { name: c.name })}
            >
              <Text style={{ fontSize: fontSize.bodyMd, color: colors.textPrimary }}>{c.name}</Text>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text style={{ fontSize: fontSize.bodySm, color: colors.textTertiary, paddingVertical: spacing.s3 }}>
              {t('screens:csvImport.noMatches')}
            </Text>
          )}
        </ScrollView>

        <View style={{ marginTop: spacing.s4, flexDirection: 'row' }}>
          <View style={{ flex: 1, marginRight: spacing.s2 }}>
            <PFButton label={t('screens:csvImport.skipExercise')} onPress={() => onResolve(null)} variant="secondary" fullWidth />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.s2 }}>
            <PFButton
              label={t('screens:csvImport.createCustom')}
              onPress={handleCreateCustom}
              variant="primary"
              fullWidth
              disabled={!query.trim() && !rawName}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CsvImportScreen(): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);
  const unitPref = user?.unit_pref ?? 'kg';
  const userId = user?.id ?? '';

  const [file, setFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [localSummary, setLocalSummary] = useState<ImportSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual-match sheet state — one pending resolution at a time.
  const [pendingMatch, setPendingMatch] = useState<string | null>(null);
  const matchResolverRef = useRef<MatchResolver | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);

  const handlePickFile = useCallback(async () => {
    setResult(null);
    setLocalSummary(null);
    setUploadError(null);
    const picked = await pickCsvFile();
    if (picked) setFile(picked);
  }, []);

  /** Presents the manual-match sheet and resolves once the user picks/creates/skips. */
  const requestManualMatch = useCallback(
    (rawName: string, candidates: MatchCandidate[]): Promise<ManualMatchChoice> => {
      return new Promise((resolve) => {
        setMatchCandidates(candidates);
        setPendingMatch(rawName);
        matchResolverRef.current = (choice) => {
          setPendingMatch(null);
          matchResolverRef.current = null;
          resolve(choice);
        };
      });
    },
    [],
  );

  const handleManualResolve = useCallback((choice: ManualMatchChoice) => {
    matchResolverRef.current?.(choice);
  }, []);

  /** Strong/Hevy local-first import path — no network. */
  const runLocalImport = useCallback(
    async (parsed: ParsedImportFile) => {
      await localDb.init();
      const cachedNames = await getExerciseNameMap();
      const candidates: MatchCandidate[] = [
        ...getEngineExerciseCatalog().map((e) => ({ id: e.id, name: e.name })),
        ...Array.from(cachedNames.entries()).map(([id, name]) => ({ id, name })),
      ];

      const summary = await importParsedFile(parsed, {
        userId,
        unitPref,
        nowIso: new Date().toISOString(),
        candidates,
        onUnmatched: async (rawName) => {
          const choice = await requestManualMatch(rawName, candidates);
          if (choice) {
            // Remember immediately so a SECOND unmatched name later in the same
            // file that happens to match this new custom exercise resolves too
            // (candidates list is a snapshot from before this import started).
            candidates.push({ id: choice.exerciseId, name: choice.exerciseName });
            await rememberExerciseName(choice.exerciseId, choice.exerciseName);
          }
          return choice;
        },
      });

      setLocalSummary(summary);
      setFile(null);
    },
    [userId, unitPref, requestManualMatch],
  );

  const handleImport = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setResult(null);
    setLocalSummary(null);

    try {
      const text = await readCsvText(file.uri);
      if (text == null) {
        setUploading(false);
        return;
      }

      const format = detectFormat(text);

      if (format === 'strong' || format === 'hevy') {
        // Strong/Hevy: on-device parse + local-first write for BOTH tiers — no
        // network call at all, so there is no Pro gate here (unlike Garmin/Strava).
        const parsed = format === 'strong' ? parseStrongCsv(text) : parseHevyCsv(text);
        if (!parsed) {
          setUploadError(t('screens:csvImport.notParsedError'));
          return;
        }
        await runLocalImport(parsed);
        return;
      }

      // ── Garmin/Strava — unchanged server-side path ───────────────────────
      if (localFirst) {
        setUploadError(t('screens:csvImport.needsProAccount'));
        return;
      }

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'text/csv',
      } as any);

      const res = await apiClient.post<ImportResult>('/import/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(res.data);
      setFile(null);
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ??
        e?.message ??
        t('screens:csvImport.importFailedGeneric');
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [file, localFirst, runLocalImport]);

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setLocalSummary(null);
    setUploadError(null);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.s6 }}>

        {/* Explanation */}
        <PFCard>
          <View style={{ padding: spacing.s4 }}>
            <Text
              style={{
                fontSize: fontSize.heading3,
                fontWeight: fontWeight.semibold,
                color: colors.textPrimary,
                marginBottom: spacing.s3,
              }}
            >
              {t('screens:csvImport.importHistoryTitle')}
            </Text>
            <Text style={{ fontSize: fontSize.bodyMd, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.s4 }}>
              {t('screens:csvImport.importHistoryBody')}
            </Text>

            {/* Strong instructions */}
            <View style={[styles.instructionBlock, { backgroundColor: colors.bgTertiary, borderRadius: radius.md, padding: spacing.s3, marginBottom: spacing.s3 }]}>
              <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.accentDefault, marginBottom: 6 }}>
                {t('screens:csvImport.strongStepsTitle')}
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 }}>
                {t('screens:csvImport.strongSteps')}
              </Text>
            </View>

            {/* Hevy instructions */}
            <View style={[styles.instructionBlock, { backgroundColor: colors.bgTertiary, borderRadius: radius.md, padding: spacing.s3, marginBottom: spacing.s3 }]}>
              <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.accentDefault, marginBottom: 6 }}>
                {t('screens:csvImport.hevyStepsTitle')}
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 }}>
                {t('screens:csvImport.hevySteps')}
              </Text>
            </View>

            {/* Garmin instructions */}
            <View style={[styles.instructionBlock, { backgroundColor: colors.bgTertiary, borderRadius: radius.md, padding: spacing.s3, marginBottom: spacing.s3 }]}>
              <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.accentDefault, marginBottom: 6 }}>
                {t('screens:csvImport.garminStepsTitle')}
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 }}>
                {t('screens:csvImport.garminSteps')}
              </Text>
            </View>

            {/* Strava instructions */}
            <View style={[styles.instructionBlock, { backgroundColor: colors.bgTertiary, borderRadius: radius.md, padding: spacing.s3 }]}>
              <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.accentDefault, marginBottom: 6 }}>
                {t('screens:csvImport.stravaStepsTitle')}
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 }}>
                {t('screens:csvImport.stravaSteps')}
              </Text>
            </View>
          </View>
        </PFCard>

        {/* File picker */}
        <View style={{ marginTop: spacing.s6 }}>
          <PFButton
            label={file ? t('screens:csvImport.changeFile') : t('screens:csvImport.chooseFile')}
            onPress={handlePickFile}
            variant="secondary"
            fullWidth
          />

          {file && (
            <View
              style={[
                styles.fileNameRow,
                {
                  backgroundColor: colors.bgTertiary,
                  borderRadius: radius.md,
                  padding: spacing.s3,
                  marginTop: spacing.s3,
                },
              ]}
            >
              <Text style={{ fontSize: fontSize.bodySm, color: colors.accentDefault, fontWeight: fontWeight.medium, marginRight: 8 }}>
                📄
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: fontSize.bodySm, color: colors.textPrimary, fontWeight: fontWeight.medium }}
                  numberOfLines={1}
                >
                  {file.name}
                </Text>
                {file.size !== undefined && (
                  <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Import button */}
        {file && (
          <View style={{ marginTop: spacing.s4 }}>
            <PFButton
              label={uploading ? t('screens:csvImport.importing') : t('screens:csvImport.importAction')}
              onPress={handleImport}
              variant="primary"
              fullWidth
              disabled={uploading}
            />
          </View>
        )}

        {/* Error */}
        {uploadError && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.statusError,
                padding: spacing.s4,
                marginTop: spacing.s5,
              },
            ]}
          >
            <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: colors.statusError, marginBottom: spacing.s2 }}>
              {t('screens:csvImport.importFailed')}
            </Text>
            <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
              {uploadError}
            </Text>
            <View style={{ marginTop: spacing.s4 }}>
              <PFButton label={t('screens:csvImport.tryAgain')} onPress={handleReset} variant="secondary" />
            </View>
          </View>
        )}

        {/* Result — Garmin/Strava (server) */}
        {result && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.statusSuccess,
                padding: spacing.s4,
                marginTop: spacing.s5,
              },
            ]}
          >
            <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: colors.statusSuccess, marginBottom: spacing.s4 }}>
              {t('screens:csvImport.importComplete')}
            </Text>
            <View style={styles.statRow}>
              <StatBox label={t('screens:csvImport.imported')} value={result.imported} color={colors.statusSuccess} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label={t('screens:csvImport.skipped')} value={result.skipped} color={colors.statusWarning} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label={t('screens:csvImport.errors')} value={result.errors} color={result.errors > 0 ? colors.statusError : colors.textSecondary} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
            </View>
            {result.message && (
              <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, marginTop: spacing.s3, lineHeight: 20 }}>
                {result.message}
              </Text>
            )}
            <View style={{ marginTop: spacing.s4 }}>
              <PFButton label={t('screens:csvImport.importAnotherFile')} onPress={handleReset} variant="ghost" />
            </View>
          </View>
        )}

        {/* Result — Strong/Hevy (local-first) */}
        {localSummary && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.statusSuccess,
                padding: spacing.s4,
                marginTop: spacing.s5,
              },
            ]}
          >
            <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: colors.statusSuccess, marginBottom: spacing.s4 }}>
              {t('screens:csvImport.importComplete')}
            </Text>
            <View style={styles.statRow}>
              <StatBox label={t('screens:csvImport.workouts')} value={localSummary.workoutsImported} color={colors.statusSuccess} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label={t('screens:csvImport.setsImported')} value={localSummary.setsImported} color={colors.statusSuccess} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label={t('screens:csvImport.skipped')} value={localSummary.setsSkipped} color={colors.statusWarning} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label={t('screens:csvImport.unmatched')} value={localSummary.setsUnmatched} color={localSummary.setsUnmatched > 0 ? colors.statusError : colors.textSecondary} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
            </View>
            {localSummary.unmatchedNames.length > 0 && (
              <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, marginTop: spacing.s3, lineHeight: 20 }}>
                {t('screens:csvImport.skippedExercises', { names: localSummary.unmatchedNames.join(', ') })}
              </Text>
            )}
            <Text style={{ fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.s3 }}>
              {t('screens:csvImport.storedOnDevice')}
            </Text>
            <View style={{ marginTop: spacing.s4 }}>
              <PFButton label={t('screens:csvImport.importAnotherFile')} onPress={handleReset} variant="ghost" />
            </View>
          </View>
        )}
      </ScrollView>

      <ManualMatchSheet
        visible={pendingMatch != null}
        rawName={pendingMatch}
        candidates={matchCandidates}
        onResolve={handleManualResolve}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Stat box sub-component
// ---------------------------------------------------------------------------

function StatBox({
  label,
  value,
  color,
  fontSize,
  fontWeight,
  colors,
}: {
  label: string;
  value: number;
  color: string;
  fontSize: any;
  fontWeight: any;
  colors: any;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={{ fontSize: 24, fontWeight: fontWeight.bold, color, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  instructionBlock: {},
  fileNameRow: { flexDirection: 'row', alignItems: 'center' },
  resultCard: {},
  statRow: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' },
  statBox: { alignItems: 'center', flex: 1, minWidth: 70, marginBottom: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
  input: { paddingHorizontal: 14, paddingVertical: 12 },
  matchRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
