/**
 * progressPhotos — TICKET-133: progress photos (private, on-device).
 *
 * TIER POLICY (explicit, mirrors the tierPolicy.ts comment convention even
 * though this module has no isLocalFirst() branch):
 *   FREE tier — photos are captured/imported and stored ENTIRELY on-device.
 *     They never touch the server, full stop.
 *   PRO tier  — photos are STILL local-only in v1. There is no photo-sync
 *     server route, no photo upload path, and no plan to add one this wave.
 *     A Pro user's photos live only on the device that captured/imported them.
 *   Both tiers therefore share ONE code path below (no isLocalFirst branch is
 *   needed) — this is simpler than most local-first modules specifically
 *   BECAUSE both tiers behave identically here.
 *
 * STORAGE MODEL
 *   - Metadata (schema v13, `progress_photos`: id, file_name, taken_at, pose,
 *     note) lives in the local SQLite DB and IS in BACKUP_TABLES — it always
 *     round-trips through the JSON export/import (mobile/src/data/backup/
 *     exportEngine.ts), same as any other local table.
 *   - Image FILES live under the app's private document directory, in a
 *     dedicated sub-directory (PHOTOS_DIR_NAME), never in the camera roll
 *     (the picker is invoked in a mode that does NOT save to Photos) and
 *     never uploaded anywhere. Each file is stored as an EXIF-stripped COPY —
 *     never the original asset handed back by the picker/camera — because
 *     EXIF can carry GPS + device metadata the user did not choose to keep.
 *   - Image files are deliberately EXCLUDED from the default E2E JSON backup
 *     blob (that blob only ever contained JSON-safe rows, never binary/base64
 *     image data). A separate, explicit "include photos" bundle is offered
 *     here as a pure, opt-in API (estimatePhotosBundleSize / exportPhotoFiles)
 *     for a future export screen to wire a toggle to — see the file-by-file
 *     note in this ticket's final report for what still needs a UI home.
 *
 * NATIVE DEPENDENCIES (both OPTIONAL, loaded via guarded dynamic require —
 * mirrors the pattern in mobile/src/lib/shareCard/exportShareCard.ts):
 *   - expo-image-picker      — NOT in mobile/package.json yet (orchestrator
 *     must add it + an app.json plugin entry for SDK 54; see this ticket's
 *     final report). Every capture/import call degrades to a clear "not
 *     available" result when the module can't be required, rather than
 *     throwing into the UI.
 *   - expo-image-manipulator — used ONLY to strip EXIF by re-encoding the
 *     image (manipulateAsync with an empty action list still re-encodes and
 *     drops EXIF on most platforms). If unavailable, the file is still copied
 *     into the private directory (so it never lives in the camera roll and
 *     the metadata/gallery UX works), but the EXIF-strip step is skipped —
 *     `wasExifStripped` on the result reports which happened, never a silent
 *     lie.
 *   - expo-file-system — a REAL installed dependency (mobile/package.json),
 *     but still required dynamically here (not a hard top-of-file import) so
 *     this module keeps loading cleanly in the node test harness the same way
 *     migrations.ts / localReset.ts already do for FS access.
 */

import { localDb, genId } from '../db/localDb';
import { PHOTO_POSE_DEFS } from '../db/localSchema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PhotoPose = 'front' | 'side' | 'back' | 'custom';

export interface ProgressPhoto {
  id: string;
  file_name: string;
  taken_at: string;
  pose: PhotoPose | null;
  note: string | null;
}

/** Pose vocabulary re-exported from localSchema so callers need one import. */
export { PHOTO_POSE_DEFS };

interface LocalRow {
  id: string;
  file_name: string;
  taken_at: string;
  pose: string | null;
  note: string | null;
}

function rowToPhoto(row: LocalRow): ProgressPhoto {
  return {
    id: row.id,
    file_name: row.file_name,
    taken_at: row.taken_at,
    pose: (row.pose as PhotoPose) ?? null,
    note: row.note,
  };
}

// ---------------------------------------------------------------------------
// Dynamic optional native deps
// ---------------------------------------------------------------------------

interface FileSystemModule {
  documentDirectory: string | null;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  getInfoAsync(uri: string, options?: { size?: boolean }): Promise<{ exists: boolean; size?: number; isDirectory?: boolean }>;
  readDirectoryAsync(uri: string): Promise<string[]>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

function getFileSystem(): FileSystemModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-file-system') as FileSystemModule;
  } catch {
    return null;
  }
}

interface ImagePickerAsset {
  uri: string;
  fileName?: string | null;
}
interface ImagePickerResult {
  canceled: boolean;
  assets?: ImagePickerAsset[] | null;
}
interface ImagePickerModule {
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  launchCameraAsync(options?: Record<string, unknown>): Promise<ImagePickerResult>;
  launchImageLibraryAsync(options?: Record<string, unknown>): Promise<ImagePickerResult>;
  MediaTypeOptions?: { Images: unknown };
}

function getImagePicker(): ImagePickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null;
  }
}

interface ImageManipulatorModule {
  manipulateAsync(
    uri: string,
    actions: unknown[],
    options?: { compress?: number; format?: unknown },
  ): Promise<{ uri: string }>;
  SaveFormat?: { JPEG: unknown };
}

function getImageManipulator(): ImageManipulatorModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-image-manipulator') as ImageManipulatorModule;
  } catch {
    return null;
  }
}

/** True once `expo-image-picker` is installed + linked — UI should branch on this. */
export function isImagePickerAvailable(): boolean {
  return getImagePicker() !== null;
}

// ---------------------------------------------------------------------------
// Private directory management
// ---------------------------------------------------------------------------

const PHOTOS_DIR_NAME = 'pf_progress_photos/';

function photosDirUri(fs: FileSystemModule): string | null {
  if (!fs.documentDirectory) return null;
  return `${fs.documentDirectory}${PHOTOS_DIR_NAME}`;
}

async function ensurePhotosDir(fs: FileSystemModule): Promise<string | null> {
  const dir = photosDirUri(fs);
  if (!dir) return null;
  try {
    const info = await fs.getInfoAsync(dir);
    if (!info.exists) {
      await fs.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // best-effort — a failure here surfaces as a capture/import failure below
  }
  return dir;
}

function extensionFor(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  return match ? match[1]!.toLowerCase() : 'jpg';
}

// ---------------------------------------------------------------------------
// Capture / import
// ---------------------------------------------------------------------------

export interface CapturePhotoResult {
  ok: boolean;
  photo?: ProgressPhoto;
  /** Whether the EXIF-strip re-encode step actually ran (image-manipulator present). */
  wasExifStripped?: boolean;
  /** Human-readable failure reason — never a raw error/stack for the UI. */
  error?: string;
}

/**
 * Shared capture/import worker: takes a source URI handed back by the picker
 * (camera or library), copies it into the private photos directory (stripping
 * EXIF via expo-image-manipulator when available), inserts the
 * `progress_photos` metadata row, and returns the saved ProgressPhoto.
 *
 * Never throws — every failure mode returns `{ ok: false, error }`.
 */
async function saveIncomingPhoto(
  sourceUri: string,
  pose: PhotoPose | null,
  note: string | null,
  now: Date,
): Promise<CapturePhotoResult> {
  const fs = getFileSystem();
  if (!fs) {
    return { ok: false, error: 'Photo storage is not available on this build.' };
  }

  const dir = await ensurePhotosDir(fs);
  if (!dir) {
    return { ok: false, error: 'Could not access on-device photo storage.' };
  }

  const id = genId();
  const ext = extensionFor(sourceUri);
  const fileName = `pf_photo_${id}.${ext}`;
  const destUri = `${dir}${fileName}`;

  let wasExifStripped = false;
  try {
    const manipulator = getImageManipulator();
    if (manipulator) {
      // An empty action list still forces a re-encode on both platforms,
      // which drops the EXIF block (GPS, device model, timestamps) that the
      // original asset carried. We then copy the re-encoded temp file into
      // our private directory under our own name.
      const format = manipulator.SaveFormat?.JPEG;
      const result = await manipulator.manipulateAsync(sourceUri, [], {
        compress: 0.92,
        ...(format ? { format } : {}),
      });
      await fs.copyAsync({ from: result.uri, to: destUri });
      wasExifStripped = true;
    } else {
      // No manipulator available — still copy into the private directory (so
      // the file is never left pointing at the camera roll / picker temp
      // path), just without the EXIF-strip re-encode.
      await fs.copyAsync({ from: sourceUri, to: destUri });
    }
  } catch {
    return { ok: false, error: 'Could not save the photo to this device.' };
  }

  const takenAt = now.toISOString();
  try {
    await localDb.init();
    await localDb.execute(
      `INSERT INTO progress_photos (id, file_name, taken_at, pose, note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, fileName, takenAt, pose, note],
      { tables: ['progress_photos'] },
    );
  } catch {
    // Metadata insert failed — best-effort cleanup of the orphaned file so we
    // don't leave a photo on disk with no DB record pointing at it.
    await fs.deleteAsync(destUri, { idempotent: true }).catch(() => {});
    return { ok: false, error: 'Could not save the photo record.' };
  }

  return {
    ok: true,
    wasExifStripped,
    photo: { id, file_name: fileName, taken_at: takenAt, pose, note },
  };
}

/**
 * Launch the camera and save the captured photo. Requests camera permission
 * first; a denied/unavailable permission returns a clear, non-throwing result.
 */
export async function captureProgressPhoto(
  pose: PhotoPose | null = null,
  note: string | null = null,
  now: Date = new Date(),
): Promise<CapturePhotoResult> {
  const picker = getImagePicker();
  if (!picker) {
    return { ok: false, error: 'Camera capture needs an app update to enable it.' };
  }
  try {
    const perm = await picker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, error: 'Camera permission was not granted.' };
    }
    // mediaTypes/allowsEditing kept minimal/portable across picker versions —
    // this module targets whatever expo-image-picker version app.json pins.
    const result = await picker.launchCameraAsync({
      quality: 0.9,
      exif: false, // ask the OS layer to drop EXIF too, belt-and-suspenders
    });
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { ok: false, error: 'Capture cancelled.' };
    }
    return saveIncomingPhoto(result.assets[0]!.uri, pose, note, now);
  } catch {
    return { ok: false, error: 'Could not open the camera.' };
  }
}

/** Launch the photo library picker (import an existing photo) and save it. */
export async function importProgressPhoto(
  pose: PhotoPose | null = null,
  note: string | null = null,
  now: Date = new Date(),
): Promise<CapturePhotoResult> {
  const picker = getImagePicker();
  if (!picker) {
    return { ok: false, error: 'Photo import needs an app update to enable it.' };
  }
  try {
    const perm = await picker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, error: 'Photo library permission was not granted.' };
    }
    const result = await picker.launchImageLibraryAsync({
      quality: 0.9,
      exif: false,
      ...(picker.MediaTypeOptions ? { mediaTypes: picker.MediaTypeOptions.Images } : {}),
    });
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { ok: false, error: 'Import cancelled.' };
    }
    return saveIncomingPhoto(result.assets[0]!.uri, pose, note, now);
  } catch {
    return { ok: false, error: 'Could not open the photo library.' };
  }
}

// ---------------------------------------------------------------------------
// Gallery reads
// ---------------------------------------------------------------------------

/** Every logged photo, most recent first (drives the gallery grid). */
export async function listProgressPhotos(): Promise<ProgressPhoto[]> {
  await localDb.init();
  const rows = await localDb.getAll<LocalRow>(
    'SELECT id, file_name, taken_at, pose, note FROM progress_photos ORDER BY taken_at DESC',
  );
  return rows.map(rowToPhoto);
}

/** Photos for one pose tag, most recent first (used by the compare picker). */
export async function listProgressPhotosByPose(pose: PhotoPose): Promise<ProgressPhoto[]> {
  await localDb.init();
  const rows = await localDb.getAll<LocalRow>(
    'SELECT id, file_name, taken_at, pose, note FROM progress_photos WHERE pose = ? ORDER BY taken_at DESC',
    [pose],
  );
  return rows.map(rowToPhoto);
}

/** Resolve a photo's on-device file URI for display (<Image source={{ uri }}>). */
export function photoFileUri(fileName: string): string | null {
  const fs = getFileSystem();
  if (!fs || !fs.documentDirectory) return null;
  return `${fs.documentDirectory}${PHOTOS_DIR_NAME}${fileName}`;
}

// ---------------------------------------------------------------------------
// Edit / delete
// ---------------------------------------------------------------------------

/** Update a photo's pose tag and/or note (metadata-only edit). */
export async function updateProgressPhoto(
  id: string,
  patch: { pose?: PhotoPose | null; note?: string | null },
): Promise<void> {
  await localDb.init();
  if (patch.pose !== undefined) {
    await localDb.execute('UPDATE progress_photos SET pose = ? WHERE id = ?', [patch.pose, id], {
      tables: ['progress_photos'],
    });
  }
  if (patch.note !== undefined) {
    await localDb.execute('UPDATE progress_photos SET note = ? WHERE id = ?', [patch.note, id], {
      tables: ['progress_photos'],
    });
  }
}

/**
 * Delete a photo: removes the metadata row AND actually deletes the file on
 * disk (ticket AC6 — "deletion actually deletes files"). Best-effort on the
 * file delete (idempotent: a missing file is not an error) but the DB row
 * delete always runs so a stuck/undeletable file never leaves a phantom
 * gallery entry behind.
 */
export async function deleteProgressPhoto(id: string): Promise<void> {
  await localDb.init();
  const row = await localDb.getFirst<{ file_name: string }>(
    'SELECT file_name FROM progress_photos WHERE id = ?',
    [id],
  );
  await localDb.execute('DELETE FROM progress_photos WHERE id = ?', [id], {
    tables: ['progress_photos'],
  });
  if (row?.file_name) {
    const fs = getFileSystem();
    const uri = fs ? photoFileUri(row.file_name) : null;
    if (fs && uri) {
      await fs.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// localReset integration — wipe the entire photo directory.
//
// `progress_photos` (the metadata table) is already covered by
// clearAllLocalPersonalData() via BACKUP_TABLES (see localReset.ts). This
// function covers the FILES, which localReset.ts does not own the path
// convention for — it calls this before/alongside its table wipe. See this
// ticket's final report for the exact patch snippet applied to localReset.ts.
// ---------------------------------------------------------------------------

/** Delete the entire on-device photos directory (all files, no metadata). */
export async function clearAllProgressPhotoFiles(): Promise<void> {
  const fs = getFileSystem();
  if (!fs) return;
  const dir = photosDirUri(fs);
  if (!dir) return;
  try {
    const info = await fs.getInfoAsync(dir);
    if (info.exists) {
      await fs.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    // best-effort — never throw into the reset path
  }
}

// ---------------------------------------------------------------------------
// "Include photos" export bundle (opt-in, separate from the default E2E blob)
//
// TICKET-133 AC2: image FILES are excluded from the default backup blob;
// included only behind an explicit toggle with a size estimate shown before
// export. These are pure, screen-agnostic helpers — no export/import screen
// exists yet in this repo to host the toggle UI (see final report).
// ---------------------------------------------------------------------------

export interface PhotosBundleEstimate {
  photoCount: number;
  totalBytes: number;
}

/** Sum the on-device byte size of every stored photo file (for a pre-export estimate). */
export async function estimatePhotosBundleSize(): Promise<PhotosBundleEstimate> {
  const fs = getFileSystem();
  const photos = await listProgressPhotos();
  if (!fs) return { photoCount: photos.length, totalBytes: 0 };

  let totalBytes = 0;
  for (const p of photos) {
    const uri = photoFileUri(p.file_name);
    if (!uri) continue;
    try {
      const info = await fs.getInfoAsync(uri, { size: true });
      if (info.exists && typeof info.size === 'number') {
        totalBytes += info.size;
      }
    } catch {
      // a missing/unreadable file just doesn't contribute to the estimate
    }
  }
  return { photoCount: photos.length, totalBytes };
}

export interface PhotoBundleEntry {
  file_name: string;
  taken_at: string;
  pose: PhotoPose | null;
  note: string | null;
  /** base64-encoded file contents, for a future opt-in export bundle. */
  base64: string;
}

/**
 * Build the opt-in "include photos" export payload: metadata + base64 file
 * contents for every stored photo. Callers gate this behind an explicit user
 * toggle (never called as part of the default backup path). Best-effort per
 * file — an unreadable file is skipped rather than aborting the whole bundle.
 */
export async function buildPhotosExportBundle(): Promise<PhotoBundleEntry[]> {
  const fs = getFileSystem();
  if (!fs) return [];
  const photos = await listProgressPhotos();
  const entries: PhotoBundleEntry[] = [];
  for (const p of photos) {
    const uri = photoFileUri(p.file_name);
    if (!uri) continue;
    try {
      // expo-file-system's readAsStringAsync supports a base64 encoding option;
      // typed narrowly here to avoid widening the FileSystemModule interface
      // above for a rarely-used opt-in path.
      const fsAny = fs as unknown as {
        readAsStringAsync(uri: string, opts?: { encoding?: string }): Promise<string>;
      };
      const base64 = await fsAny.readAsStringAsync(uri, { encoding: 'base64' });
      entries.push({
        file_name: p.file_name,
        taken_at: p.taken_at,
        pose: p.pose,
        note: p.note,
        base64,
      });
    } catch {
      // skip unreadable files — best-effort bundle
    }
  }
  return entries;
}
