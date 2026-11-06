// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Licence-token keytool (TechDocs/POS_LICENSING.md, phase 2). Author-side only
// — the running backend NEVER signs, it only verifies with the public half in
// `src/pos/license/keys.ts`.
//
//   node scripts/license-key.mjs --gen
//     Generate a fresh Ed25519 keypair. Prints:
//       · the keyId + raw public key line to paste into TRUSTED_LICENSE_KEYS;
//       · the PKCS8 private key (base64) to store in the author's secret
//         manager and NOWHERE in this repo — it is what signs tokens.
//
//   node scripts/license-key.mjs --sign --key <pkcs8-b64> --kid <keyId> \
//     --licensee "Acme LLC" [--plan pro] [--expires 2027-12-31] [--instance-limit 3]
//     Sign a licence claim into a token for a customer's LICENSE_KEY. The
//     private key may also come from $LICENSE_PRIVATE_KEY instead of --key.
//
//   node scripts/license-key.mjs --verify --token <token>
//     Local sanity check against the committed public keys (no network, no DB).
//
// The token shape MUST match `src/pos/license/token.ts` verbatim:
//   token = base64url(claimJSON) "." base64url(Ed25519-sig-over-segment-bytes)
// Kept in sync by `src/__tests__/pos.license.test.ts`, which verifies a token
// this script's shape produces against the real backend verifier.

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  createHash,
  sign as edSign,
  verify as edVerify,
} from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Raw 32-byte Ed25519 public key (base64) from a KeyObject. */
function rawPublicKeyB64(pub) {
  const der = pub.export({ format: 'der', type: 'spki' });
  return Buffer.from(der.subarray(ED25519_SPKI_PREFIX.length)).toString('base64');
}

/** keyId = first 16 hex of sha256(rawPubKey), matching keys.ts. */
function keyIdOf(rawB64) {
  return createHash('sha256').update(Buffer.from(rawB64, 'base64')).digest('hex').slice(0, 16);
}

function publicKeyFromRaw(rawB64) {
  const der = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawB64, 'base64')]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function signToken(claim, privateKeyPkcs8B64) {
  const seg = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const key = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8B64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = edSign(null, Buffer.from(seg), key).toString('base64url');
  return `${seg}.${sig}`;
}

// Minimal flag parser: --flag value, and bare boolean flags.
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[name] = true;
      } else {
        out[name] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args.gen) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawB64 = rawPublicKeyB64(publicKey);
  const kid = keyIdOf(rawB64);
  const pkcs8B64 = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' })).toString('base64');

  console.log('# Paste into src/pos/license/keys.ts TRUSTED_LICENSE_KEYS:');
  console.log(`  '${kid}': '${rawB64}',`);
  console.log('');
  console.log('# PRIVATE KEY (PKCS8 base64) — store in the author secret manager only.');
  console.log('# NEVER commit it, never paste it into chat or an issue.');
  console.log(pkcs8B64);
  process.exit(0);
}

if (args.sign) {
  const pkcs8 = args.key || process.env.LICENSE_PRIVATE_KEY;
  if (!pkcs8) die('--sign needs --key <pkcs8-b64> or $LICENSE_PRIVATE_KEY');
  if (!args.kid) die('--sign needs --kid <keyId> (from --gen)');
  if (!args.licensee) die('--sign needs --licensee "<name>"');

  const claim = { kid: String(args.kid), licensee: String(args.licensee), issued_at: new Date().toISOString() };
  if (args.plan) claim.plan = String(args.plan);
  if (args.expires) {
    const exp = new Date(String(args.expires));
    if (Number.isNaN(exp.getTime())) die(`--expires is not a date: ${args.expires}`);
    claim.expires_at = exp.toISOString();
  }
  if (args['instance-limit']) {
    const n = Number(args['instance-limit']);
    if (!Number.isInteger(n) || n < 1) die('--instance-limit must be a positive integer');
    claim.instance_limit = n;
  }

  const token = signToken(claim, String(pkcs8));
  console.error('# claim:', JSON.stringify(claim));
  console.log(token);
  process.exit(0);
}

if (args.verify) {
  if (!args.token) die('--verify needs --token <token>');
  const token = String(args.token).trim();
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) die('malformed token');
  const [seg, sigSeg] = parts;
  let claim;
  try {
    claim = JSON.parse(Buffer.from(seg, 'base64url').toString('utf-8'));
  } catch {
    die('malformed claim JSON');
  }
  // The committed public keys — kept small, so inline them rather than import a .ts.
  // This is a sanity check only; the authoritative verifier is src/pos/license/token.ts.
  const KEYS = { '980b166aa890defb': 'vbuO2vhJH8hXLc8oDBaDtmufkSoSYdmN7XBuEHmMdVU=' };
  const pub = KEYS[claim.kid];
  if (!pub) die(`unknown kid: ${claim.kid} (not in this script's copy of TRUSTED_LICENSE_KEYS)`);
  let ok = false;
  try {
    ok = edVerify(null, Buffer.from(seg), publicKeyFromRaw(pub), Buffer.from(sigSeg, 'base64url'));
  } catch {
    ok = false;
  }
  if (!ok) die('bad signature');
  if (claim.expires_at && Date.parse(claim.expires_at) < Date.now()) {
    console.log(`valid signature, but EXPIRED at ${claim.expires_at}`);
    process.exit(0);
  }
  console.log('OK:', JSON.stringify(claim));
  process.exit(0);
}

console.error('usage:');
console.error('  node scripts/license-key.mjs --gen');
console.error('  node scripts/license-key.mjs --sign --key <pkcs8-b64> --kid <keyId> --licensee "<name>" [--plan <p>] [--expires <YYYY-MM-DD>] [--instance-limit <n>]');
console.error('  node scripts/license-key.mjs --verify --token <token>');
process.exit(1);
