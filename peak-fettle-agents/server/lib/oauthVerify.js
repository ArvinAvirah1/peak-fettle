// lib/oauthVerify.js — TICKET-099 (Sign in with Apple & Google, server verification)
//
// Verifies a provider IDENTITY token (Apple / Google) the standard, secure way:
// fetch the provider JWKS, select the signing key by `kid`, and verify the JWT's
// RS256 signature + issuer + audience with jsonwebtoken. No new dependency —
// Node's crypto.createPublicKey supports JWK directly.
//
// This is INERT until the audiences are configured: verifyOAuthIdToken throws
// `not_configured` (→ 501) when GOOGLE_OAUTH_AUDIENCE / APPLE_OAUTH_AUDIENCE are
// unset, so shipping it changes nothing until the founder adds credentials.
//
// `fetchJwks` is injectable so the verification path is unit-tested offline.

const https = require('https');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const PROVIDERS = {
  google: {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    audienceEnv: 'GOOGLE_OAUTH_AUDIENCE',
  },
  apple: {
    issuer: ['https://appleid.apple.com'],
    jwksUri: 'https://appleid.apple.com/auth/keys',
    audienceEnv: 'APPLE_OAUTH_AUDIENCE',
    // Zero-config (2026-07-18): both first-party bundle ids are ALWAYS accepted.
    // Apple id_tokens are verified against Apple's public JWKS — no client
    // secret exists — so defaulting our own app ids is safe. These are UNIONED
    // with APPLE_OAUTH_AUDIENCE, so a stale single-value env var (the LifeOS
    // Apple-sign-in outage) can never lock one of our apps out, and Apple
    // sign-in works with the env var entirely unset. Google has no defaults:
    // its audiences are account-specific OAuth client IDs.
    defaultAudience: ['com.peakfettle.app', 'com.peakfettle.lifeos'],
  },
};

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

// Simple in-process JWKS cache (1h).
const _cache = new Map();
async function defaultFetchJwks(jwksUri, { forceRefresh = false } = {}) {
  const cached = _cache.get(jwksUri);
  if (!forceRefresh && cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.keys;
  const data = await httpsGetJson(jwksUri);
  const keys = (data && data.keys) || [];
  _cache.set(jwksUri, { keys, at: Date.now() });
  return keys;
}

function jwkToPublicKey(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function err(message, code, status) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

/**
 * Verify a provider id_token. Returns the decoded payload or throws.
 * opts: { issuer, jwksUri, audience, fetchJwks? }
 *
 * Cache-miss retry: if the signing key is not found in the cached JWKS
 * (e.g. the provider rotated keys within the 1h cache window), we force-refresh
 * once and retry before throwing unknown_signing_key. This prevents a permanent
 * auth outage for up to 1h after a key rotation.
 */
async function verifyProviderToken(idToken, opts) {
  const { issuer, jwksUri, audience, fetchJwks = defaultFetchJwks } = opts || {};
  if (!audience) throw err('oauth_not_configured', 'not_configured', 501);

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw err('malformed_token', 'invalid_token', 401);
  }

  let keys = await fetchJwks(jwksUri);
  let jwk = (keys || []).find((k) => k.kid === decoded.header.kid);

  // Key not found in cached set — force-refresh once in case of key rotation.
  if (!jwk) {
    keys = await fetchJwks(jwksUri, { forceRefresh: true });
    jwk = (keys || []).find((k) => k.kid === decoded.header.kid);
  }
  if (!jwk) throw err('unknown_signing_key', 'invalid_token', 401);

  const publicKey = jwkToPublicKey(jwk);
  // jwt.verify throws on bad signature / wrong issuer|audience / expiry.
  return jwt.verify(idToken, publicKey, { algorithms: ['RS256'], audience, issuer });
}

/**
 * Parse an audience env value. Supports a comma-separated list so ONE deploy
 * can serve multiple client apps (e.g. APPLE_OAUTH_AUDIENCE=
 * "com.peakfettle.app,com.peakfettle.lifeos" — the fitness app and LifeOS
 * produce id_tokens with different `aud` values). jwt.verify accepts a string
 * or an array. Single values and injected test arrays pass through unchanged.
 */
function parseAudience(raw) {
  if (!raw || typeof raw !== 'string' || !raw.includes(',')) return raw;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : list;
}

/**
 * Union env-configured audiences with a provider's built-in defaults.
 * Returns the env value untouched when the provider has no defaults.
 */
function withDefaultAudience(envAudience, defaults) {
  if (!defaults || defaults.length === 0) return envAudience;
  const list = envAudience == null ? [] : Array.isArray(envAudience) ? envAudience : [envAudience];
  const merged = [...new Set([...list, ...defaults])];
  return merged.length === 1 ? merged[0] : merged;
}

/** Verify a token for a named provider and return normalized identity claims. */
async function verifyOAuthIdToken(provider, idToken, deps) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw err('unsupported_provider', 'unsupported_provider', 400);
  // An injected deps.audience (tests) is used EXACTLY as given; the env path
  // gets the provider's defaults unioned in (see PROVIDERS.apple).
  const audience = deps && deps.audience
    ? parseAudience(deps.audience)
    : withDefaultAudience(parseAudience(process.env[cfg.audienceEnv]), cfg.defaultAudience);
  const payload = await verifyProviderToken(idToken, {
    issuer: cfg.issuer,
    jwksUri: cfg.jwksUri,
    audience,
    fetchJwks: deps && deps.fetchJwks,
  });
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: payload.name,
    // Apple sets is_private_email ("true"/true) for Hide My Email relay
    // addresses (…@privaterelay.appleid.com). Callers use this to avoid
    // matching accounts by an email the user's other apps never saw.
    isPrivateEmail: payload.is_private_email === true || payload.is_private_email === 'true',
  };
}

module.exports = { PROVIDERS, verifyProviderToken, verifyOAuthIdToken, jwkToPublicKey, parseAudience, withDefaultAudience };
