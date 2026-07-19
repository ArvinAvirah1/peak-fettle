/**
 * oauthVerify.test.js — TICKET-099 verification path, fully offline.
 *
 * Generates a throwaway RSA keypair, exposes its public half as a JWKS, signs a
 * fake id_token, and checks verifyProviderToken accepts the good token and
 * rejects wrong-audience / expired / unknown-kid / unconfigured. Plain node:
 *   node __tests__/oauthVerify.test.js
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyProviderToken, verifyOAuthIdToken } = require('../lib/oauthVerify');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-kid-1';
jwk.alg = 'RS256';
jwk.use = 'sig';

const ISSUER = 'https://accounts.google.com';
const AUD = 'peak-fettle.client.id';
const fetchJwks = async () => [jwk];

function sign(opts = {}) {
  return jwt.sign(
    { sub: 'provider-sub-123', email: 'lifter@example.com', email_verified: true, name: 'Lifter' },
    privateKey,
    { algorithm: 'RS256', keyid: 'test-kid-1', issuer: ISSUER, audience: AUD, expiresIn: '5m', ...opts },
  );
}

let failures = 0;
async function check(name, fn, shouldThrow) {
  try {
    const r = await fn();
    if (shouldThrow) { console.log('  ✗ ' + name + ' (expected rejection)'); failures++; }
    else { console.log('  ✓ ' + name); return r; }
  } catch (e) {
    if (shouldThrow) { console.log('  ✓ ' + name + ' (rejected: ' + (e.code || e.message) + ')'); }
    else { console.log('  ✗ ' + name + ' — ' + e.message); failures++; }
  }
}

(async () => {
  console.log('TICKET-099 oauthVerify:');

  const good = await check('valid token verifies', () =>
    verifyProviderToken(sign(), { issuer: ISSUER, jwksUri: 'x', audience: AUD, fetchJwks }), false);
  if (good && good.sub !== 'provider-sub-123') { console.log('  ✗ payload.sub mismatch'); failures++; }
  else if (good) console.log('  ✓ returns the expected sub/email claims');

  await check('wrong audience rejected', () =>
    verifyProviderToken(sign(), { issuer: ISSUER, jwksUri: 'x', audience: 'other.client', fetchJwks }), true);

  await check('wrong issuer rejected', () =>
    verifyProviderToken(sign({ issuer: 'https://evil.example' }), { issuer: ISSUER, jwksUri: 'x', audience: AUD, fetchJwks }), true);

  await check('expired token rejected', () =>
    verifyProviderToken(sign({ expiresIn: -10 }), { issuer: ISSUER, jwksUri: 'x', audience: AUD, fetchJwks }), true);

  await check('unknown kid rejected', () =>
    verifyProviderToken(sign({ keyid: 'nope' }), { issuer: ISSUER, jwksUri: 'x', audience: AUD, fetchJwks }), true);

  await check('unconfigured audience rejected (501 path)', () =>
    verifyProviderToken(sign(), { issuer: ISSUER, jwksUri: 'x', audience: undefined, fetchJwks }), true);

  // Tampered signature: sign with a DIFFERENT key but claim the known kid.
  const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await check('forged signature rejected', () =>
    verifyProviderToken(
      jwt.sign({ sub: 'x' }, otherKey, { algorithm: 'RS256', keyid: 'test-kid-1', issuer: ISSUER, audience: AUD, expiresIn: '5m' }),
      { issuer: ISSUER, jwksUri: 'x', audience: AUD, fetchJwks }), true);

  // Apple "Hide My Email": is_private_email (string "true" in real Apple
  // tokens) must normalize to isPrivateEmail: true so /auth/oauth can route
  // relay addresses to the link flow instead of email matching.
  const appleRelayToken = jwt.sign(
    {
      sub: 'apple-sub-42',
      email: '64t9tvkymn@privaterelay.appleid.com',
      email_verified: 'true',
      is_private_email: 'true',
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'test-kid-1', issuer: 'https://appleid.apple.com', audience: AUD, expiresIn: '5m' },
  );
  const relayClaims = await check('apple hide-my-email token verifies', () =>
    verifyOAuthIdToken('apple', appleRelayToken, { audience: AUD, fetchJwks }), false);
  if (relayClaims) {
    if (relayClaims.isPrivateEmail === true && relayClaims.emailVerified === true) {
      console.log('  ✓ is_private_email/email_verified strings normalize to booleans');
    } else {
      console.log('  ✗ hide-my-email claims not normalized: ' + JSON.stringify(relayClaims));
      failures++;
    }
  }

  // Zero-config apple audiences (2026-07-18): with NO injected deps.audience,
  // verifyOAuthIdToken unions APPLE_OAUTH_AUDIENCE with the built-in bundle
  // ids — a stale single-value env var must not lock out the other app, and
  // apple must work with the env var entirely unset.
  const lifeosAudToken = jwt.sign(
    { sub: 'apple-sub-43', email: 'q1w2e3@privaterelay.appleid.com', email_verified: 'true' },
    privateKey,
    { algorithm: 'RS256', keyid: 'test-kid-1', issuer: 'https://appleid.apple.com', audience: 'com.peakfettle.lifeos', expiresIn: '5m' },
  );
  process.env.APPLE_OAUTH_AUDIENCE = 'com.peakfettle.app';
  await check('lifeos aud accepted despite stale single-value APPLE_OAUTH_AUDIENCE', () =>
    verifyOAuthIdToken('apple', lifeosAudToken, { fetchJwks }), false);
  delete process.env.APPLE_OAUTH_AUDIENCE;
  await check('apple verifies with APPLE_OAUTH_AUDIENCE unset (built-in defaults)', () =>
    verifyOAuthIdToken('apple', lifeosAudToken, { fetchJwks }), false);
  const foreignAudToken = jwt.sign(
    { sub: 'x' },
    privateKey,
    { algorithm: 'RS256', keyid: 'test-kid-1', issuer: 'https://appleid.apple.com', audience: 'com.evil.other', expiresIn: '5m' },
  );
  await check('foreign aud still rejected under default audiences', () =>
    verifyOAuthIdToken('apple', foreignAudToken, { fetchJwks }), true);

  console.log(failures === 0 ? '\nALL OAUTH-VERIFY TESTS PASS' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
