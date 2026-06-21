/**
 * useFeatureFlags — TICKET-119. The ONLY way screens read the optional-feature
 * switches. Backed by a JSON map under lo_meta key 'feature_flags' (local-first;
 * rides the encrypted backup with the rest of lo_meta). Absent/garbled => defaults
 * (all OFF). Never hardcode a feature gate in a screen — call isEnabled(key).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { localDb } from '../db/localDb';
import {
  DEFAULT_FLAGS,
  FEATURE_FLAGS_META_KEY,
  resolveFlags,
  type FeatureFlags,
  type FeatureKey,
} from '../config/features';

export interface UseFeatureFlags {
  flags: FeatureFlags;
  /** True once the stored map has been read (defaults shown until then). */
  loaded: boolean;
  isEnabled: (key: FeatureKey) => boolean;
  setFlag: (key: FeatureKey, on: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

export function useFeatureFlags(): UseFeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loaded, setLoaded] = useState(false);
  // Latest flags for setFlag without re-creating the callback (no stale closure).
  const flagsRef = useRef(flags);
  flagsRef.current = flags;

  const reload = useCallback(async () => {
    try {
      const row = await localDb.getFirst<{ value: string }>(
        `SELECT value FROM lo_meta WHERE key = ?`,
        [FEATURE_FLAGS_META_KEY]
      );
      const parsed = row?.value ? (JSON.parse(row.value) as Partial<FeatureFlags>) : null;
      setFlags(resolveFlags(parsed));
    } catch {
      // Corrupt/missing JSON must never break the screen — fall back to defaults.
      setFlags(DEFAULT_FLAGS);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setFlag = useCallback(async (key: FeatureKey, on: boolean): Promise<void> => {
    const prev = flagsRef.current; // capture synchronously for an accurate revert
    const next: FeatureFlags = { ...prev, [key]: on };
    setFlags(next); // optimistic
    try {
      await localDb.execute(
        `INSERT OR REPLACE INTO lo_meta (key, value) VALUES (?, ?)`,
        [FEATURE_FLAGS_META_KEY, JSON.stringify(next)],
        { tables: ['lo_meta'] }
      );
    } catch {
      // Persist failed — revert so the UI reflects what's actually stored.
      setFlags(prev);
    }
  }, []);

  const isEnabled = useCallback((key: FeatureKey): boolean => flags[key] === true, [flags]);

  return { flags, loaded, isEnabled, setFlag, reload };
}
