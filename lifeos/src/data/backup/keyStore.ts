/**
 * keyStore (Life OS port of TICKET-094 Workstream B / Agent E) — deviation #4
 *
 * Thin wrapper around expo-secure-store for the backup data key, plus an
 * AsyncStorage flag for recovery-code acknowledgement. Same shape as mobile's
 * src/data/backup/keyStore.ts; storage keys are namespaced with an
 * `lifeos_` prefix so the two apps never collide if they ever ran on the
 * same device/keychain scope.
 *
 * Security rules:
 *   • The data key is stored base64-encoded in SecureStore under a versioned key.
 *   • The recovery code is NEVER stored here or anywhere else.
 *   • keychainAccessible = AFTER_FIRST_UNLOCK (no requiresAuthentication) so
 *     backup can run in the background without biometric prompts.
 *
 * expo-secure-store and @react-native-async-storage/async-storage are both
 * dynamically required so this file remains importable without native modules
 * in unit-test environments (tests simply never call these functions).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** SecureStore key for the base64-encoded 32-byte data key. */
const DATA_KEY_STORE_KEY = 'lifeos_backup_data_key_v1';

/** AsyncStorage key for the recovery-code acknowledgement flag. */
const RECOVERY_ACK_STORAGE_KEY = '@peak_fettle_lifeos/recovery_code_ack';

/** SecureStore key for the JSON-serialized KeyWrap (ciphertext — safe at rest). */
const KEY_WRAP_STORE_KEY = 'lifeos_backup_key_wrap_v1';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSecureStore(): {
  getItemAsync(key: string, options?: object): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: object): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
  AFTER_FIRST_UNLOCK: string;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ss = require('expo-secure-store') as {
      getItemAsync(key: string, options?: object): Promise<string | null>;
      setItemAsync(key: string, value: string, options?: object): Promise<void>;
      deleteItemAsync(key: string): Promise<void>;
      AFTER_FIRST_UNLOCK: string;
    };
    return ss;
  } catch {
    throw new Error('KEYSTORE_UNAVAILABLE: expo-secure-store is not installed.');
  }
}

function getAsyncStorage(): {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const as = require('@react-native-async-storage/async-storage') as {
      default?: {
        getItem(key: string): Promise<string | null>;
        setItem(key: string, value: string): Promise<void>;
      };
      getItem?(key: string): Promise<string | null>;
      setItem?(key: string, value: string): Promise<void>;
    };
    // Handle both CJS and ESM-interop default exports
    const store = (as as { default?: typeof as }).default ?? as;
    if (typeof store.getItem !== 'function') {
      throw new Error('KEYSTORE_UNAVAILABLE: AsyncStorage has no getItem.');
    }
    return store as {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
    };
  } catch {
    throw new Error(
      'KEYSTORE_UNAVAILABLE: @react-native-async-storage/async-storage is not installed.',
    );
  }
}

// ---------------------------------------------------------------------------
// Data key operations
// ---------------------------------------------------------------------------

/**
 * Persist the base64-encoded data key to the platform keychain.
 * keychainAccessible = AFTER_FIRST_UNLOCK — readable after first device unlock,
 * allowing background backup jobs to access it without user interaction.
 */
export async function saveDataKey(b64: string): Promise<void> {
  const ss = getSecureStore();
  await ss.setItemAsync(DATA_KEY_STORE_KEY, b64, {
    keychainAccessible: ss.AFTER_FIRST_UNLOCK,
  });
}

/**
 * Load the base64-encoded data key from the platform keychain.
 * Returns null if no key has been saved yet.
 */
export async function loadDataKey(): Promise<string | null> {
  const ss = getSecureStore();
  return ss.getItemAsync(DATA_KEY_STORE_KEY);
}

/**
 * Remove the data key from the keychain (e.g. on sign-out or account deletion).
 * Does not affect the recovery-code acknowledgement flag.
 */
export async function clearDataKey(): Promise<void> {
  const ss = getSecureStore();
  await ss.deleteItemAsync(DATA_KEY_STORE_KEY);
}

// ---------------------------------------------------------------------------
// Key-wrap operations
// ---------------------------------------------------------------------------

/**
 * Structural type identical to blobCrypto's KeyWrap — kept inline to avoid a
 * circular-import concern.
 */
type KeyWrapShape = { salt: string; wrap_iv: string; wrapped_key: string };

/**
 * Persist the KeyWrap (JSON-serialized) to the platform keychain.
 * The wrap contains AES-256-GCM ciphertext — safe at rest.
 * The recovery code itself is NEVER stored.
 */
export async function saveKeyWrap(wrap: KeyWrapShape): Promise<void> {
  const ss = getSecureStore();
  await ss.setItemAsync(KEY_WRAP_STORE_KEY, JSON.stringify(wrap), {
    keychainAccessible: ss.AFTER_FIRST_UNLOCK,
  });
}

/**
 * Load the KeyWrap from the platform keychain.
 * Returns null if no wrap has been saved yet (first backup not yet performed,
 * or legacy install that predates key-wrap persistence).
 */
export async function loadKeyWrap(): Promise<KeyWrapShape | null> {
  const ss = getSecureStore();
  const raw = await ss.getItemAsync(KEY_WRAP_STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KeyWrapShape;
  } catch {
    return null;
  }
}

/**
 * Remove the KeyWrap from the keychain (e.g. on sign-out or account deletion).
 */
export async function clearKeyWrap(): Promise<void> {
  const ss = getSecureStore();
  await ss.deleteItemAsync(KEY_WRAP_STORE_KEY);
}

// ---------------------------------------------------------------------------
// Recovery-code acknowledgement
// ---------------------------------------------------------------------------

/**
 * Mark that the user has seen and acknowledged their recovery code.
 * This is stored as a simple boolean flag in AsyncStorage — the code itself
 * is NEVER stored.
 */
export async function markRecoveryCodeAcknowledged(): Promise<void> {
  const as = getAsyncStorage();
  await as.setItem(RECOVERY_ACK_STORAGE_KEY, 'true');
}

/**
 * Check whether the user has acknowledged their recovery code.
 * Returns false if the flag has never been set.
 */
export async function isRecoveryCodeAcknowledged(): Promise<boolean> {
  const as = getAsyncStorage();
  const val = await as.getItem(RECOVERY_ACK_STORAGE_KEY);
  return val === 'true';
}
