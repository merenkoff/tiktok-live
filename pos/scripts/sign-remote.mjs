// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Signs a module-remote build (roadmap #3). Run right after
// `vite build --config vite.<id>-remote.config.ts`:
//
//   node scripts/sign-remote.mjs <moduleId>
//
// Emits, in dist-remotes/<id>/:
//   manifest.json      — { schema, moduleId, version, entry, keyId, builtAt, files{name: sha384} }
//   manifest.json.sig  — base64 Ed25519 detached signature over the exact manifest.json bytes
//
// The loader (`src/modules/remoteVerify.ts`) checks the signature against an
// allowlisted public key (`src/modules/remoteSigningKeys.ts`) and the entry hash
// before `import()`. A remote that fails verification falls back to the bundled
// module.
//
// Signing key: `POS_REMOTE_SIGNING_KEY` (base64 PKCS8 DER) if set — the prod key,
// held only in CI. Otherwise a **deterministic dev key** derived from a fixed
// seed below: nothing secret in the repo, every clone signs identically, so
// `build:*-remote` output loads locally out of the box. The dev key is NOT a
// security boundary.
//
//   node scripts/sign-remote.mjs --print-dev   # dev keyId + pubkey for remoteSigningKeys.ts
//   node scripts/sign-remote.mjs --gen-prod    # fresh prod keypair (private → CI secret)

import { createPrivateKey, createPublicKey, generateKeyPairSync, createHash, sign as edSign } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { posAppVersion } from './pkg-version.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pos = path.resolve(dir, '..');

// PKCS8 DER prefix for a raw 32-byte Ed25519 private seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// Fixed, non-secret seed → a stable dev keypair shared by every clone.
const DEV_SEED = createHash('sha256')
  .update('the-live.shop pos module-remote — dev signing key v1')
  .digest();

function die(msg) {
  console.error(`[sign-remote] ${msg}`);
  process.exit(1);
}

/** KeyObject from a raw 32-byte Ed25519 seed. */
function privateKeyFromSeed(seed) {
  return createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

/** Raw 32-byte Ed25519 public key (tail of the SPKI DER). */
function rawPublicKey(privateKey) {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
}

/** keyId = first 16 hex chars of sha256(rawPubKey). */
function keyIdOf(rawPub) {
  return createHash('sha256').update(rawPub).digest('hex').slice(0, 16);
}

function loadPrivateKey() {
  const env = process.env.POS_REMOTE_SIGNING_KEY;
  if (env) {
    return {
      key: createPrivateKey({ key: Buffer.from(env, 'base64'), format: 'der', type: 'pkcs8' }),
      isDev: false,
    };
  }
  return { key: privateKeyFromSeed(DEV_SEED), isDev: true };
}

function printKey(key, label) {
  const rawPub = rawPublicKey(key);
  console.log(`\n${label}`);
  console.log(`  keyId:  ${keyIdOf(rawPub)}`);
  console.log(`  pubkey: ${rawPub.toString('base64')}`);
  console.log(`\n  remoteSigningKeys.ts entry:\n    '${keyIdOf(rawPub)}': '${rawPub.toString('base64')}',\n`);
}

function genProd() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const der = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  printKey(privateKey, 'fresh PROD keypair — allowlist the pubkey, keep the private key in CI');
  console.log(`  POS_REMOTE_SIGNING_KEY (base64 PKCS8 DER, CI secret):\n    ${der}\n`);
}

function signModule(moduleId) {
  const outDir = path.join(pos, 'dist-remotes', moduleId);
  if (!existsSync(path.join(outDir, 'remote-entry.js'))) {
    die(`${path.relative(pos, outDir)}/remote-entry.js missing — build the remote first`);
  }

  const { key, isDev } = loadPrivateKey();
  if (isDev) console.warn('[sign-remote] signing with the deterministic DEV key — not for production');
  const keyId = keyIdOf(rawPublicKey(key));

  const files = {};
  for (const name of readdirSync(outDir).sort()) {
    if (!name.endsWith('.js') && !name.endsWith('.css')) continue;
    const buf = readFileSync(path.join(outDir, name));
    files[name] = `sha384-${createHash('sha384').update(buf).digest('base64')}`;
  }
  if (!files['remote-entry.js']) die('no remote-entry.js hash — nothing to sign');

  // Deterministic: fixed top-level key order, `files` inserted name-sorted.
  const manifest = {
    schema: 1,
    moduleId,
    version: posAppVersion(),
    entry: 'remote-entry.js',
    keyId,
    builtAt: new Date().toISOString(),
    files,
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const signature = edSign(null, Buffer.from(manifestJson, 'utf-8'), key).toString('base64');

  writeFileSync(path.join(outDir, 'manifest.json'), manifestJson);
  writeFileSync(path.join(outDir, 'manifest.json.sig'), `${signature}\n`);
  console.log(
    `[sign-remote] ${moduleId} v${manifest.version} — ${Object.keys(files).length} files, keyId ${keyId}`
  );
}

const arg = process.argv[2];
if (!arg) die('usage: sign-remote.mjs <moduleId> | --print-dev | --gen-prod');
if (arg === '--print-dev') printKey(privateKeyFromSeed(DEV_SEED), 'deterministic DEV key');
else if (arg === '--gen-prod') genProd();
else signModule(arg);
