// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One-time setup for in-app updates: generates the updater's Ed25519 key pair,
// writes the public half into tauri.conf.json, and prints the two `gh secret
// set` commands for the private half. The private key never passes through
// this script's output — `tauri signer generate` writes it to a file, and the
// gh commands read that file.
//
//   node scripts/updater-init.mjs
//
// Re-running it after a key exists would strand every installed copy (they
// verify against the key baked into their own binary), so it refuses.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const confPath = path.join(pos, 'src-tauri/tauri.conf.json');
const keyPath = path.join(homedir(), '.tauri', 'cloth-pos-updater.key');

const conf = JSON.parse(readFileSync(confPath, 'utf-8'));
if (conf.plugins?.updater?.pubkey) {
  console.error(
    `tauri.conf.json already carries an updater pubkey.\n` +
      `Replacing it breaks updates for every installed copy — they only trust\n` +
      `the key compiled into them. Delete it by hand if that is really the plan.`
  );
  process.exit(1);
}
if (existsSync(keyPath)) {
  console.error(`${keyPath} already exists — refusing to overwrite a signing key.`);
  process.exit(1);
}

console.log(`Generating the updater key pair -> ${keyPath}`);
console.log('Pick a password when prompted; it becomes the second GitHub secret.\n');
execFileSync('npx', ['tauri', 'signer', 'generate', '-w', keyPath], {
  cwd: pos,
  stdio: 'inherit',
});

const pubkey = readFileSync(`${keyPath}.pub`, 'utf-8').trim();
conf.plugins ??= {};
conf.plugins.updater ??= {};
conf.plugins.updater.pubkey = pubkey;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);
console.log(`\nPublic key written to ${path.relative(pos, confPath)} — commit it.`);
console.log('\nNow store the private half as repository secrets:\n');
console.log(`  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo merenkoff/tiktok-live < "${keyPath}"`);
console.log('  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo merenkoff/tiktok-live\n');
console.log(`Keep ${keyPath} backed up somewhere safe: losing it means no machine`);
console.log('can be updated in place again — every install would need a manual reinstall.');
