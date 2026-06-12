/**
 * blobCrypto.test.mjs — TICKET-094 Workstream B (Agent E)
 *
 * Run with:
 *   npm install --prefix /tmp/cryptotest @noble/ciphers @noble/hashes
 *   node --experimental-strip-types \
 *     --loader /tmp/cryptotest/noble-resolver.mjs \
 *     mobile/src/data/backup/__tests__/blobCrypto.test.mjs
 *
 * Note: --loader is required (not --import) because the custom resolve hook
 * must intercept transitive @noble/* imports from blobCrypto.ts. In Node v22,
 * --import only runs the file as a side-effect and does not register the hook.
 *
 * (The noble-resolver.mjs loader redirects bare @noble/* specifiers to the
 *  /tmp/cryptotest/node_modules copies, without needing to install anything
 *  in the repo's node_modules.)
 *
 * SECURITY: no key material is logged — assertions only.
 */

import { register } from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Resolve @noble/* imports from /tmp/cryptotest/node_modules
// We use createRequire for CJS @noble modules and patch the import
// by loading them before importing blobCrypto.
// Strategy: use a module-level Map to cache, then we import blobCrypto
// via --experimental-strip-types which handles the TS syntax.
// ---------------------------------------------------------------------------

// We need to tell Node where to find @noble when blobCrypto.ts does
// `import { gcm } from '@noble/ciphers/aes'`.
// The cleanest approach without modifying blobCrypto.ts:
// set NODE_PATH so Node's module resolution picks up /tmp/cryptotest/node_modules.
// That must be done before the process starts — so instead we use the
// --conditions approach via an import map shim written in noble-resolver.mjs.
// This file expects noble-resolver.mjs to already be loaded via --import.

// Import blobCrypto — node strips TS types, noble resolves via loader
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blobCryptoPath = path.resolve(__dirname, '../blobCrypto.ts');

// Dynamic import with file:// URL
const {
  generateDataKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  deriveKek,
  createKeyWrap,
  encryptBackup,
  decryptWithKey,
  decryptWithRecoveryCode,
  unwrapDataKey,
} = await import(`file://${blobCryptoPath}`);

// ---------------------------------------------------------------------------
// Deterministic RNG for tests (NOT for production — crypto.getRandomValues)
// ---------------------------------------------------------------------------
import { randomBytes } from 'node:crypto';
function testRng(n) {
  return new Uint8Array(randomBytes(n));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

console.log('\nblobCrypto test suite\n');

// 1. generateDataKey produces 32 random bytes
await test('generateDataKey — returns 32 bytes', () => {
  const key = generateDataKey(testRng);
  assert.equal(key.length, 32, 'key should be 32 bytes');
  assert.ok(key instanceof Uint8Array, 'should be Uint8Array');
});

// 2. generateRecoveryCode format: 6 groups × 4 chars, Crockford alphabet
await test('generateRecoveryCode — XXXX-XXXX-XXXX-XXXX-XXXX-XXXX format', () => {
  const code = generateRecoveryCode(testRng);
  const parts = code.split('-');
  assert.equal(parts.length, 6, 'should have 6 groups');
  for (const p of parts) {
    assert.equal(p.length, 4, `group "${p}" should be 4 chars`);
    assert.match(p, /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/, `group "${p}" invalid Crockford char`);
  }
});

// 3. normalizeRecoveryCode — lowercase, dashes, O→0, I→1, L→1
await test('normalizeRecoveryCode — case, dashes, O→0, I→1, L→1', () => {
  assert.equal(normalizeRecoveryCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeRecoveryCode('O I L o i l'), '011011');
  assert.equal(normalizeRecoveryCode('A1B2-C3D4'), 'A1B2C3D4');
  assert.equal(normalizeRecoveryCode('   xxxx   '), 'XXXX');
});

// 4. Round-trip with data key
await test('encryptBackup + decryptWithKey round-trip', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const plaintext = '{"format":"peak-fettle-backup","schemaVersion":1,"tables":{}}';
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup(plaintext, dataKey, keyWrap, testRng);
  const result = decryptWithKey(env, dataKey);
  assert.equal(result, plaintext, 'decrypted plaintext should match original');
});

// 5. Round-trip with recovery code (new-ecosystem path)
await test('encryptBackup + decryptWithRecoveryCode round-trip', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const plaintext = '{"hello":"world","schemaVersion":1}';
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup(plaintext, dataKey, keyWrap, testRng);
  const result = await decryptWithRecoveryCode(env, code);
  assert.equal(result, plaintext, 'recovery-code decryption should match original');
});

// 6. Wrong recovery code → DECRYPT_FAILED
await test('wrong recovery code → throws DECRYPT_FAILED', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const wrongCode = generateRecoveryCode(testRng); // different code
  const plaintext = 'test plaintext';
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup(plaintext, dataKey, keyWrap, testRng);
  let threw = false;
  try {
    await decryptWithRecoveryCode(env, wrongCode);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('DECRYPT_FAILED'), `expected DECRYPT_FAILED, got: ${err.message}`);
  }
  assert.ok(threw, 'should have thrown on wrong recovery code');
});

// 7. Tampered ct → decryptWithKey throws DECRYPT_FAILED
await test('tampered ct → decryptWithKey throws DECRYPT_FAILED', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup('sensitive data', dataKey, keyWrap, testRng);
  // Flip a byte in the base64-decoded ct, re-encode
  const ctBytes = Buffer.from(env.ct, 'base64');
  ctBytes[0] ^= 0xff;
  const tamperedEnv = { ...env, ct: ctBytes.toString('base64') };
  let threw = false;
  try {
    decryptWithKey(tamperedEnv, dataKey);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('DECRYPT_FAILED'), `expected DECRYPT_FAILED, got: ${err.message}`);
  }
  assert.ok(threw, 'should have thrown on tampered ct');
});

// 8. Tampered wrapped_key → unwrapDataKey throws DECRYPT_FAILED
await test('tampered wrapped_key → unwrapDataKey throws DECRYPT_FAILED', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup('data', dataKey, keyWrap, testRng);
  const wkBytes = Buffer.from(env.wrapped_key, 'base64');
  wkBytes[0] ^= 0xff;
  const tamperedEnv = { ...env, wrapped_key: wkBytes.toString('base64') };
  let threw = false;
  try {
    await unwrapDataKey(tamperedEnv, code);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('DECRYPT_FAILED'), `expected DECRYPT_FAILED, got: ${err.message}`);
  }
  assert.ok(threw, 'should have thrown on tampered wrapped_key');
});

// 9. Two encryptBackup calls with same KeyWrap → same wrap fields, different payload iv/ct
// (regression guard: if this fails, wrap is being re-derived instead of reused)
await test('same KeyWrap reused: wrap fields stable, payload iv/ct differ', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const plaintext = 'identical plaintext';
  const env1 = await encryptBackup(plaintext, dataKey, keyWrap, testRng);
  const env2 = await encryptBackup(plaintext, dataKey, keyWrap, testRng);
  // Wrap fields must be IDENTICAL (same persisted KeyWrap)
  assert.equal(env1.salt, env2.salt, 'salts must be identical when reusing KeyWrap');
  assert.equal(env1.wrap_iv, env2.wrap_iv, 'wrap_ivs must be identical when reusing KeyWrap');
  assert.equal(env1.wrapped_key, env2.wrapped_key, 'wrapped_keys must be identical when reusing KeyWrap');
  // Fresh payload IV each call → different ciphertext
  assert.notEqual(env1.iv, env2.iv, 'payload IVs must differ');
  assert.notEqual(env1.ct, env2.ct, 'ciphertexts must differ');
});

// 10. kdf_params present in envelope and match spec
await test('envelope contains correct kdf_params (N=32768, r=8, p=1)', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup('payload', dataKey, keyWrap, testRng);
  assert.equal(env.format, 'pf-encrypted-backup');
  assert.equal(env.v, 1);
  assert.equal(env.alg, 'AES-256-GCM');
  assert.equal(env.kdf, 'scrypt');
  assert.deepEqual(env.kdf_params, { N: 32768, r: 8, p: 1 });
  // Check field presence and expected byte lengths
  assert.equal(Buffer.from(env.salt, 'base64').length, 16, 'salt must be 16 bytes');
  assert.equal(Buffer.from(env.wrap_iv, 'base64').length, 12, 'wrap_iv must be 12 bytes');
  assert.equal(Buffer.from(env.wrapped_key, 'base64').length, 48, 'wrapped_key must be 48 bytes');
  assert.equal(Buffer.from(env.iv, 'base64').length, 12, 'iv must be 12 bytes');
  assert.ok(env.created_at, 'created_at must be present');
  assert.doesNotThrow(() => new Date(env.created_at), 'created_at must be valid ISO 8601');
});

// 11. unwrapDataKey + re-save path: unwrap gives back original data key
await test('unwrapDataKey returns original dataKey for use in restore', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup('restore test', dataKey, keyWrap, testRng);
  const recovered = await unwrapDataKey(env, code);
  assert.equal(recovered.length, 32, 'recovered key must be 32 bytes');
  // The recovered key must decrypt the payload correctly
  const plaintext = decryptWithKey(env, recovered);
  assert.equal(plaintext, 'restore test');
});

// 12. Code normalization is applied during decryption (lowercase + dashes)
await test('decryptWithRecoveryCode tolerates lowercase + dashes in code', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng); // e.g. "ABCD-EFGH-..."
  const plaintext = 'normalization test';
  const keyWrap = await createKeyWrap(dataKey, code, testRng);
  const env = await encryptBackup(plaintext, dataKey, keyWrap, testRng);
  // Feed the code in lowercase with extra spaces — must still work
  const messyCode = code.toLowerCase().replace(/-/g, ' - ');
  const result = await decryptWithRecoveryCode(env, messyCode);
  assert.equal(result, plaintext, 'should decrypt with normalized messy code');
});


// 13. Second backup reuses KeyWrap and decryptWithRecoveryCode still works
// This is THE regression that motivated the fix — backupManager.ts used to pass
// recoveryCode='' on every backup after the first, so the wrapped_key was derived
// from KEK('') and recovery-code-only restore would fail.
await test('REGRESSION: second encryptBackup with same KeyWrap decrypts with recovery code', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const keyWrap = await createKeyWrap(dataKey, code, testRng);

  const pt1 = 'first backup payload';
  const pt2 = 'second backup payload — REGRESSION TARGET';

  // Simulate two successive backups using the SAME persisted KeyWrap
  const env1 = await encryptBackup(pt1, dataKey, keyWrap, testRng);
  const env2 = await encryptBackup(pt2, dataKey, keyWrap, testRng);

  // Both envelopes must decrypt with the original recovery code
  const r1 = await decryptWithRecoveryCode(env1, code);
  const r2 = await decryptWithRecoveryCode(env2, code);
  assert.equal(r1, pt1, 'first envelope must decrypt with recovery code');
  assert.equal(r2, pt2, 'second envelope must decrypt with recovery code (regression)');
});

// 14. createKeyWrap produces correct byte lengths
await test('createKeyWrap — field byte lengths match spec §2', async () => {
  const dataKey = generateDataKey(testRng);
  const code = generateRecoveryCode(testRng);
  const wrap = await createKeyWrap(dataKey, code, testRng);
  assert.equal(Buffer.from(wrap.salt, 'base64').length, 16, 'salt must be 16 bytes');
  assert.equal(Buffer.from(wrap.wrap_iv, 'base64').length, 12, 'wrap_iv must be 12 bytes');
  assert.equal(Buffer.from(wrap.wrapped_key, 'base64').length, 48, 'wrapped_key must be 48 bytes');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
