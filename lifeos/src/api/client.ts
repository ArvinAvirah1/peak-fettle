/**
 * Base Axios client for the shared Peak Fettle REST API (Life OS app).
 *
 * Identical contract to mobile/src/api/client.ts: Bearer token attach, one
 * deduplicated silent refresh on 401, logout on refresh failure. Auth
 * callbacks are injected by AuthContext via setAuthHandlers() to avoid a
 * circular import.
 *
 * The Life OS app's server surface is deliberately tiny (local-first, Q30):
 * /auth/*, GET /user/profile (entitlement), /user/backup-blob, /lifeos/*.
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AuthHandlers {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onRefresh: (accessToken: string, refreshToken: string) => void;
  onLogout: () => void;
}

let _authHandlers: AuthHandlers | null = null;

export function setAuthHandlers(handlers: AuthHandlers): void {
  _authHandlers = handlers;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = _authHandlers?.getAccessToken();
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

let _refreshPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }
    if (!_authHandlers) {
      return Promise.reject(error);
    }

    const refreshToken = _authHandlers.getRefreshToken();
    if (!refreshToken) {
      _authHandlers.onLogout();
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    try {
      if (!_refreshPromise) {
        _refreshPromise = _doRefresh(refreshToken).finally(() => {
          _refreshPromise = null;
        });
      }
      const newAccessToken = await _refreshPromise;
      if (originalRequest.headers) {
        (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${newAccessToken}`;
      }
      return apiClient(originalRequest);
    } catch (err) {
      console.warn('[LO] client/responseInterceptor:', err instanceof Error ? err.message : String(err));
      _authHandlers.onLogout();
      return Promise.reject(error);
    }
  }
);

async function _doRefresh(refreshToken: string): Promise<string> {
  const response = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 10_000 }
  );
  const { accessToken, refreshToken: newRefreshToken } = response.data;
  _authHandlers?.onRefresh(accessToken, newRefreshToken);
  return accessToken;
}

// ---------------------------------------------------------------------------
// Backup blob transport (deviation #4) — thin helpers over the SAME
// /user/backup-blob route mobile uses (peak-fettle-agents/server/routes/
// backup.js, read-only/shared — do not change it here). backupManager.ts is
// the only intended caller; kept here (rather than a data/ module) to follow
// this app's existing convention of small domain wrappers living next to the
// client (see src/api/lifeos.ts for the /lifeos/* precedent).
// ---------------------------------------------------------------------------

/** Envelope shape is opaque to the transport layer — see data/backup/blobCrypto.ts. */
export interface BackupBlobEnvelope {
  format: 'pf-encrypted-backup';
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'scrypt';
  kdf_params: { N: number; r: number; p: number };
  salt: string;
  wrap_iv: string;
  wrapped_key: string;
  iv: string;
  ct: string;
  created_at: string;
}

/** PUT /user/backup-blob — upload/upsert the encrypted envelope. */
export async function uploadBackupBlob(envelope: BackupBlobEnvelope): Promise<{ updated_at: string }> {
  const res = await apiClient.put<{ updated_at: string }>('/user/backup-blob', { envelope });
  return res.data;
}

/** GET /user/backup-blob — download the encrypted envelope. */
export async function downloadBackupBlob(): Promise<{ envelope: BackupBlobEnvelope; updated_at: string | null }> {
  const res = await apiClient.get<{ envelope: BackupBlobEnvelope; updated_at: string | null }>('/user/backup-blob');
  return res.data;
}

/** GET /user/backup-blob/status — metadata only (exists/updated_at/bytes), no download. */
export async function getBackupBlobStatus(): Promise<{ exists: boolean; updated_at: string | null; bytes: number | null }> {
  const res = await apiClient.get<{ exists: boolean; updated_at: string | null; bytes: number | null }>(
    '/user/backup-blob/status',
  );
  return res.data;
}
