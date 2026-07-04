/**
 * exportShareCard — TICKET-131 (shareable workout summary cards)
 *
 * Captures a rendered card view to a PNG and hands it to the OS share sheet.
 * Zero server involvement: `react-native-view-shot` renders the view straight
 * to a local file and `expo-sharing` opens the native share UI — no upload,
 * no analytics event, no auto-post (per spec — sharing is a user-initiated OS
 * action only).
 *
 * DEPENDENCY NOTE (orchestrator — read before merge):
 *   `expo-sharing` is ALREADY in mobile/package.json (~14.0.8). It is used
 *   here directly.
 *   `react-native-view-shot` is NOT yet in mobile/package.json. Per this
 *   ticket's file-ownership rule, this agent may not edit package.json, so
 *   the capture path below resolves the module via a guarded `require(...)`
 *   (same dynamic-optional-dependency pattern already used in
 *   WorkoutLoggerHost.tsx for '../api/alternatives') and reports
 *   `isViewShotAvailable()` for the UI to branch on. Add the dependency with:
 *     npx expo install react-native-view-shot
 *   then rebuild the dev client (native module — see EAS note in the report).
 */

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// Optional native dependency: react-native-view-shot
// ---------------------------------------------------------------------------

/** A view-shot capture target: a host-component instance or a native node handle. */
export type ShareCardViewRef = object | number | null;

type CaptureFn = (
  viewRef: ShareCardViewRef,
  options?: {
    format?: 'png' | 'jpg';
    quality?: number;
    result?: 'tmpfile' | 'base64' | 'data-uri';
    width?: number;
    height?: number;
  },
) => Promise<string>;

let captureRef: CaptureFn | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  captureRef = require('react-native-view-shot').captureRef;
} catch {
  captureRef = null;
}

/** True once `react-native-view-shot` is installed + the native module is linked. */
export function isViewShotAvailable(): boolean {
  return typeof captureRef === 'function';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ShareCardRatio = 'story' | 'square';

/** Pixel dimensions per the spec's two export ratios. */
export const SHARE_CARD_DIMENSIONS: Record<ShareCardRatio, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export interface ExportShareCardResult {
  ok: boolean;
  /** Populated on success — local file URI of the exported PNG. */
  uri?: string;
  /** Populated on failure — human-readable reason (never a raw error/stack for the UI). */
  error?: string;
}

/**
 * Render the given view ref to a 1080-wide PNG at the requested ratio, then
 * open the native share sheet. Returns a result object rather than throwing,
 * so the sheet can show an inline error instead of crashing mid-share.
 *
 * @param viewRef  ref to the on-screen card view (captured pixel-for-pixel).
 * @param ratio    'story' (1080x1920) or 'square' (1080x1080).
 */
export async function exportAndShareCard(
  viewRef: ShareCardViewRef,
  ratio: ShareCardRatio,
): Promise<ExportShareCardResult> {
  if (!captureRef) {
    return {
      ok: false,
      error: 'Sharing needs an app update to enable image export. Please try again after updating.',
    };
  }
  if (!viewRef) {
    return { ok: false, error: 'Card is not ready yet — try again in a moment.' };
  }

  const { width, height } = SHARE_CARD_DIMENSIONS[ratio];

  let uri: string;
  try {
    uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width,
      height,
    });
  } catch {
    return {
      ok: false,
      error: 'Could not render the card image. Please try again.',
    };
  }

  try {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { ok: true, uri }; // captured fine; share sheet just isn't available on this device
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share your workout',
      UTI: 'public.png',
    });
    return { ok: true, uri };
  } catch {
    // User cancelling the share sheet also lands here on some platforms —
    // treat as a soft failure, not a crash. The PNG was still captured.
    return { ok: true, uri };
  } finally {
    // Best-effort cleanup of the temp capture file; never blocks/throws past
    // the caller — a leftover tmp file is harmless (OS tmp dir is reclaimed).
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
