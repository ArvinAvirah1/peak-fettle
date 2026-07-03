'use strict';

/**
 * Backup envelope round-trip (Life OS deviation #4 — E2E-encrypted backup
 * wiring, LIFEOS_BUILD_STATUS deferred item). Pure-node test of the crypto
 * envelope framing ported into src/data/backup/blobCrypto.ts, plus the
 * canonical document builder in src/data/backup.ts.
 *
 * Covers:
 *   1. encrypt -> decrypt round trip is byte-identical to the canonical doc
 *      (both the keychain path, decryptWithKey, and the recovery-code path,
 *      decryptWithRecoveryCode / unwrapDataKey).
 *   2. Tampered ciphertext fails cleanly (GCM auth tag mismatch), never
 *      throwing anything but the documented DECRYPT_FAILED error and never
 *      returning corrupt plaintext.
 *   3. Wrong recovery code fails cleanly at the unwrap step.
 *   4. Tampered wrapped_key fails cleanly at the unwrap step.
 *   5. generateRecoveryCode / normalizeRecoveryCode round trip (dashes,
 *      whitespace, case, I/L/O confusable mapping).
 *
 * DEVICE-ONLY (not exercised here — see report):
 *   - expo-crypto random bytes (productionRng) — this test injects a
 *     deterministic-but-real Node crypto RNG instead (still cryptographically
 *     random; only the *source* differs from the on-device default).
 *   - expo-secure-store / AsyncStorage persistence (keyStore.ts) — requires
 *     native modules; the framing this test exercises is identical either way
 *     because keyStore only stores/loads opaque strings the crypto layer
 *     produces.
 *   - The live network round trip through /user/backup-blob and the on-device
 *     SQLite read/write in buildBackupFromDb / restoreBackupToDb.
 *
 * Run: node __tests__/backup-envelope.test.js
 */

const path = require('path');
const assert = require('assert');
const nodeCrypto = require('crypto');
const { loadTs } = require('./tsLoader');

const blobCrypto = loadTs(path.join(__dirname, '..', 'src', 'data', 'backup', 'blobCrypto.ts'));
const backupDoc = loadTs(path.join(__dirname, '..', 'src', 'data', 'backup.ts'));

const {
  generateDataKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  createKeyWrap,
  encryptBackup,
  decryptWithKey,
  decryptWithRecoveryCode,
  unwrapDataKey,
} = blobCrypto;

const { makeExportDoc, canonicalize } = backupDoc;

/** Real CSPRNG bytes via Node's crypto module — injected in place of expo-crypto. */
function nodeRng(n) {
  return new Uint8Array(nodeCrypto.randomBytes(n));
}

let n = 0;
function ok(name, cond) {
  n += 1;
  assert.ok(cond, `case ${n} (${name}) failed`);
  console.log(`  ok ${n} — ${name}`);
}
function check(name, actual, expected) {
  n += 1;
  assert.deepStrictEqual(actual, expected, `case ${n} (${name}): got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok ${n} — ${name}`);
}
async function rejects(name, promise, matcher) {
  n += 1;
  let threw = false;
  try {
    await promise;
  } catch (err) {
    threw = true;
    assert.ok(matcher(err), `case ${n} (${name}): unexpected error message: ${err && err.message}`);
  }
  assert.ok(threw, `case ${n} (${name}): expected a rejection but none was thrown`);
  console.log(`  ok ${n} — ${name}`);
}

(async () => {
  // --- Build a realistic canonical export doc (registry order, deterministic) ---
  const tables = {
    lo_habits: [{ id: 'h1', user_id: 'u1', name: 'Read', frequency: 'daily', is_active: 1, created_at: '2026-06-01T00:00:00.000Z' }],
    lo_goals: [{ id: 'g1', title: 'Ship it', created_at: '2026-06-01T00:00:00.000Z' }],
  };
  const now = new Date('2026-07-02T12:00:00.000Z');
  const doc = makeExportDoc(tables, now);
  check('makeExportDoc sets format', doc.format, 'lifeos-backup');
  check('makeExportDoc sets schemaVersion', doc.schemaVersion, 1);

  const plaintext = canonicalize(doc);
  ok('canonicalize is deterministic', canonicalize(makeExportDoc(tables, now)) === plaintext);

  // --- 1. Round trip: keychain path (encrypt -> decryptWithKey) -----------------
  const dataKey = generateDataKey(nodeRng);
  const recoveryCode = generateRecoveryCode(nodeRng);
  ok('recovery code has the XXXX-XXXX-XXXX-XXXX-XXXX-XXXX shape', /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/.test(recoveryCode));

  const keyWrap = await createKeyWrap(dataKey, recoveryCode, nodeRng);
  ok('keyWrap has salt/wrap_iv/wrapped_key', !!keyWrap.salt && !!keyWrap.wrap_iv && !!keyWrap.wrapped_key);

  const envelope = await encryptBackup(plaintext, dataKey, keyWrap, nodeRng);
  check('envelope.format', envelope.format, 'pf-encrypted-backup');
  check('envelope.v', envelope.v, 1);
  check('envelope.alg', envelope.alg, 'AES-256-GCM');
  check('envelope.kdf', envelope.kdf, 'scrypt');
  check('envelope.kdf_params', envelope.kdf_params, { N: 32768, r: 8, p: 1 });

  const decryptedViaKey = decryptWithKey(envelope, dataKey);
  ok('keychain-path round trip is byte-identical to canonical doc', decryptedViaKey === plaintext);
  check('decrypted doc parses back to the same structure', JSON.parse(decryptedViaKey), doc);

  // --- 1b. Round trip: recovery-code path (unwrap + decryptWithRecoveryCode) ---
  const decryptedViaCode = await decryptWithRecoveryCode(envelope, recoveryCode);
  ok('recovery-code-path round trip is byte-identical to canonical doc', decryptedViaCode === plaintext);

  const unwrapped = await unwrapDataKey(envelope, recoveryCode);
  check('unwrapDataKey recovers the exact original data key', Buffer.from(unwrapped).toString('hex'), Buffer.from(dataKey).toString('hex'));

  // --- 2. Tampered ciphertext fails cleanly (GCM tag mismatch) -------------------
  const tamperedCt = { ...envelope };
  {
    const ctBytes = Buffer.from(envelope.ct, 'base64');
    ctBytes[0] = ctBytes[0] ^ 0xff; // flip a bit deep in the ciphertext
    tamperedCt.ct = ctBytes.toString('base64');
  }
  n += 1;
  {
    let threw = false;
    try {
      decryptWithKey(tamperedCt, dataKey);
    } catch (err) {
      threw = true;
      assert.ok(/DECRYPT_FAILED/.test(err.message), `unexpected message: ${err.message}`);
    }
    assert.ok(threw, 'tampered ciphertext must throw, not return corrupt plaintext');
    console.log(`  ok ${n} — tampered ciphertext throws DECRYPT_FAILED (keychain path)`);
  }
  await rejects(
    'tampered ciphertext throws DECRYPT_FAILED (recovery-code path)',
    decryptWithRecoveryCode(tamperedCt, recoveryCode),
    (err) => /DECRYPT_FAILED/.test(err.message),
  );

  // --- 3. Wrong recovery code fails cleanly --------------------------------------
  const wrongCode = generateRecoveryCode(nodeRng);
  ok('a freshly generated wrong code differs from the real one', wrongCode !== recoveryCode);
  await rejects(
    'wrong recovery code fails at unwrap, not with corrupt data',
    unwrapDataKey(envelope, wrongCode),
    (err) => /DECRYPT_FAILED/.test(err.message),
  );
  await rejects(
    'wrong recovery code fails the full decrypt path',
    decryptWithRecoveryCode(envelope, wrongCode),
    (err) => /DECRYPT_FAILED/.test(err.message),
  );

  // --- 4. Tampered wrapped_key fails cleanly -------------------------------------
  const tamperedWrap = { ...envelope };
  {
    const wrappedBytes = Buffer.from(envelope.wrapped_key, 'base64');
    wrappedBytes[0] = wrappedBytes[0] ^ 0xff;
    tamperedWrap.wrapped_key = wrappedBytes.toString('base64');
  }
  await rejects(
    'tampered wrapped_key fails at unwrap',
    unwrapDataKey(tamperedWrap, recoveryCode),
    (err) => /DECRYPT_FAILED/.test(err.message),
  );

  // --- 5. Wrong data key (keychain path) fails cleanly ---------------------------
  const otherKey = generateDataKey(nodeRng);
  n += 1;
  {
    let threw = false;
    try {
      decryptWithKey(envelope, otherKey);
    } catch (err) {
      threw = true;
      assert.ok(/DECRYPT_FAILED/.test(err.message), `unexpected message: ${err.message}`);
    }
    assert.ok(threw, 'decrypting with the wrong data key must fail cleanly');
    console.log(`  ok ${n} — wrong data key throws DECRYPT_FAILED, not corrupt plaintext`);
  }

  // --- 6. normalizeRecoveryCode: dashes/whitespace/case/confusable mapping -------
  check('normalize strips dashes and uppercases', normalizeRecoveryCode('abcd-1234-efgh'), 'ABCD1234EFGH');
  check('normalize strips whitespace', normalizeRecoveryCode(' AB CD \n1234'), 'ABCD1234');
  check('normalize maps I/L/O to 1/1/0', normalizeRecoveryCode('IL O'), '110');
  ok(
    'a code entered with different casing/spacing still unwraps the same key',
    Buffer.from(await unwrapDataKey(envelope, recoveryCode.toLowerCase().replace(/-/g, ' ')))
      .equals(Buffer.from(dataKey)),
  );

  console.log(`\n${n}/${n} backup-envelope cases passed.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
