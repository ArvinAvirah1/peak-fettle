/**
 * CsvImportScreen — PL-2: CSV Import UI
 * Lets users upload a Garmin Connect or Strava CSV activity export.
 * Uses expo-document-picker to select a .csv file, then POSTs it to
 * /import/csv as multipart/form-data.
 *
 * Note: expo-document-picker must be installed for file picking to work.
 * Install with: npx expo install expo-document-picker
 * If it is not installed, file picking falls back to a clear error message.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { apiClient } from '../src/api/client';
import { PFButton } from '../src/components/ui/PFButton';
import { PFCard } from '../src/components/ui/PFCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  message?: string;
}

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
      Alert.alert('Wrong file type', 'Please select a .csv file exported from Garmin Connect or Strava.');
      return null;
    }

    return { name: asset.name, uri: asset.uri, mimeType: asset.mimeType, size: asset.size };
  } catch (e: any) {
    if (e?.code === 'MODULE_NOT_FOUND' || e?.message?.includes("Cannot find module 'expo-document-picker'")) {
      Alert.alert(
        'Package not installed',
        'expo-document-picker is required for file picking.\n\nRun:\n  npx expo install expo-document-picker\nthen rebuild the app.',
      );
    } else {
      Alert.alert('Error', 'Could not open the file picker. Please try again.');
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CsvImportScreen(): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { colors } = theme;

  const [file, setFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handlePickFile = useCallback(async () => {
    setResult(null);
    setUploadError(null);
    const picked = await pickCsvFile();
    if (picked) setFile(picked);
  }, []);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setResult(null);

    try {
      const formData = new FormData();
      // React Native FormData accepts a blob-like object with uri/name/type
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
        'Upload failed. Check your connection and try again.';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [file]);

  const handleReset = () => {
    setFile(null);
    setResult(null);
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
              Import your activity history
            </Text>
            <Text style={{ fontSize: fontSize.bodyMd, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.s4 }}>
              Export your activity history from Garmin Connect or Strava as a CSV, then upload it here. Peak Fettle will import your sessions, skip any duplicates, and flag anything it could not parse.
            </Text>

            {/* Garmin instructions */}
            <View style={[styles.instructionBlock, { backgroundColor: colors.bgTertiary, borderRadius: radius.md, padding: spacing.s3, marginBottom: spacing.s3 }]}>
              <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.accentDefault, marginBottom: 6 }}>
                Garmin Connect export steps
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 }}>
                {'1. Open Garmin Connect on desktop (connect.garmin.com)\n2. Go to Activities → All Activities\n3. Click the export icon (top right) → Export to CSV\n4. Save the file and upload it here.'}
              </Text>
            </View>

            {/* Strava instructions */}
            <View style={[styles.instructionBlock, { backgroundColor: colors.bgTertiary, borderRadius: radius.md, padding: spacing.s3 }]}>
              <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.accentDefault, marginBottom: 6 }}>
                Strava export steps
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 }}>
                {'1. Go to strava.com → Settings → My Account\n2. Scroll to "Download or Delete Your Account"\n3. Click "Get Started" → Request Your Archive\n4. Strava emails you a zip. Extract it and find activities.csv\n5. Upload activities.csv here.'}
              </Text>
            </View>
          </View>
        </PFCard>

        {/* File picker */}
        <View style={{ marginTop: spacing.s6 }}>
          <PFButton
            label={file ? 'Change file' : 'Choose file'}
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
              label={uploading ? 'Uploading…' : 'Import'}
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
              Import failed
            </Text>
            <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
              {uploadError}
            </Text>
            <View style={{ marginTop: spacing.s4 }}>
              <PFButton label="Try again" onPress={handleReset} variant="secondary" />
            </View>
          </View>
        )}

        {/* Result */}
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
              Import complete
            </Text>
            <View style={styles.statRow}>
              <StatBox label="Imported" value={result.imported} color={colors.statusSuccess} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label="Skipped" value={result.skipped} color={colors.statusWarning} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
              <StatBox label="Errors" value={result.errors} color={result.errors > 0 ? colors.statusError : colors.textSecondary} fontSize={fontSize} fontWeight={fontWeight} colors={colors} />
            </View>
            {result.message && (
              <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, marginTop: spacing.s3, lineHeight: 20 }}>
                {result.message}
              </Text>
            )}
            <View style={{ marginTop: spacing.s4 }}>
              <PFButton label="Import another file" onPress={handleReset} variant="ghost" />
            </View>
          </View>
        )}
      </ScrollView>
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
      <Text style={{ fontSize: 28, fontWeight: fontWeight.bold, color, fontVariant: ['tabular-nums'] }}>
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
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center', flex: 1 },
});
