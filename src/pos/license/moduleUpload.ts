// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Putting a built module into the closed bundle store (TechDocs/POS_OPENCORE.md
// §8.1, step O-3). The Module Release workflow builds and signs a private
// module, then uploads it here instead of committing it to the public
// `module-builds` branch that jsdelivr serves:
//
//   DELETE /api/modules/upload/:id/:version          clear a half-finished upload
//   PUT    /api/modules/upload/:id/:version/:file    one file, raw bytes
//   POST   /api/modules/upload/:id/:version/commit   verify, then publish
//
// Every call carries `Authorization: Bearer <MODULE_UPLOAD_SECRET>`. The secret
// only lets CI WRITE; what it writes must still prove itself at commit:
//   - `manifest.json` is signed with the PROD module key (`moduleKeys.ts`) —
//     so a leaked upload secret cannot plant code no till would trust anyway;
//   - the manifest names this module and this version;
//   - the staged files are exactly the manifest's `files` (every `.js`/`.css`
//     of the build) plus the manifest and its signature, each matching its
//     sha384;
//   - a version is immutable: an identical re-upload (a workflow re-run) is a
//     no-op, a different one is a 409.
// Files are staged under `.staging/<id>/<version>/` and moved into place with
// one `rename`, so the delivery route never sees half a version.

import crypto from 'crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { moduleBundlesDir } from './moduleDelivery.js';
import { TRUSTED_MODULE_KEYS } from './moduleKeys.js';

export class ModuleUploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ModuleUploadError';
  }
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const META_FILES = new Set(['manifest.json', 'manifest.json.sig']);

/** Upload is off (503) unless a real secret is set. */
export function moduleUploadSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.MODULE_UPLOAD_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

/** Constant-time check of an `Authorization: Bearer …` header. */
export function uploadAuthorized(header: string | undefined, secret: string): boolean {
  const presented = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return presented.length > 0 && crypto.timingSafeEqual(a, b);
}

export function checkModuleVersion(id: string, version: string): void {
  if (!ID_RE.test(id) || !VERSION_RE.test(version)) {
    throw new ModuleUploadError(400, 'bad_module_path', 'Module id or version is malformed.');
  }
}

/** A file a build may contain: its `.js`/`.css`, the manifest and its signature — nothing nested. */
export function checkBundleFileName(name: string): void {
  const ok = FILE_RE.test(name) && (META_FILES.has(name) || name.endsWith('.js') || name.endsWith('.css'));
  if (!ok) throw new ModuleUploadError(400, 'bad_file_name', `«${name}» is not a file a module build contains.`);
}

function stagingDir(id: string, version: string, root: string): string {
  return path.join(root, '.staging', id, version);
}

function finalDir(id: string, version: string, root: string): string {
  return path.join(root, id, version);
}

export async function clearStaged(id: string, version: string, root = moduleBundlesDir()): Promise<void> {
  checkModuleVersion(id, version);
  await rm(stagingDir(id, version, root), { recursive: true, force: true });
}

export async function stageFile(
  id: string,
  version: string,
  name: string,
  body: Buffer,
  root = moduleBundlesDir()
): Promise<void> {
  checkModuleVersion(id, version);
  checkBundleFileName(name);
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new ModuleUploadError(400, 'empty_file', `«${name}» arrived empty.`);
  }
  const dir = stagingDir(id, version, root);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), body);
}

interface Manifest {
  schema: number;
  moduleId: string;
  version: string;
  keyId: string;
  files: Record<string, string>;
}

/** Pure: does `sig` (base64) sign `manifestBytes` under one of `keys`' entry for `keyId`? */
export function manifestSignedBy(
  manifestBytes: Buffer,
  sigText: string,
  keyId: string,
  keys: Readonly<Record<string, string>> = TRUSTED_MODULE_KEYS
): boolean {
  const raw = keys[keyId];
  if (!raw) return false;
  try {
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw, 'base64')]);
    const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    return crypto.verify(null, manifestBytes, key, Buffer.from(sigText.trim(), 'base64'));
  } catch {
    return false;
  }
}

export interface CommitResult {
  status: 'published' | 'already';
  files: number;
}

export async function commitStaged(
  id: string,
  version: string,
  options: { root?: string; keys?: Readonly<Record<string, string>> } = {}
): Promise<CommitResult> {
  checkModuleVersion(id, version);
  const root = options.root ?? moduleBundlesDir();
  const staged = stagingDir(id, version, root);
  if (!existsSync(staged)) throw new ModuleUploadError(409, 'nothing_staged', 'Nothing was uploaded for this version.');

  const names = (await readdir(staged)).sort();
  if (!names.includes('manifest.json') || !names.includes('manifest.json.sig')) {
    throw new ModuleUploadError(409, 'manifest_missing', 'manifest.json and manifest.json.sig must both be uploaded.');
  }
  const manifestBytes = await readFile(path.join(staged, 'manifest.json'));
  const sigText = (await readFile(path.join(staged, 'manifest.json.sig'))).toString('utf8');

  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8')) as Manifest;
  } catch {
    throw new ModuleUploadError(422, 'manifest_unreadable', 'manifest.json is not JSON.');
  }
  if (!manifestSignedBy(manifestBytes, sigText, manifest.keyId, options.keys)) {
    throw new ModuleUploadError(422, 'bad_signature', `manifest.json is not signed by a trusted module key (keyId ${String(manifest.keyId)}).`);
  }
  if (manifest.schema !== 1 || manifest.moduleId !== id || manifest.version !== version) {
    throw new ModuleUploadError(
      422,
      'manifest_mismatch',
      `manifest.json is ${String(manifest.moduleId)} ${String(manifest.version)}, not ${id} ${version}.`
    );
  }
  const listed = Object.keys(manifest.files ?? {}).sort();
  if (!listed.includes('remote-entry.js')) {
    throw new ModuleUploadError(422, 'manifest_mismatch', 'manifest.json lists no remote-entry.js.');
  }
  const expected = [...listed, 'manifest.json', 'manifest.json.sig'].sort();
  const missing = expected.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !expected.includes(n));
  if (missing.length > 0 || extra.length > 0) {
    throw new ModuleUploadError(
      422,
      'files_mismatch',
      `Uploaded files differ from the manifest${missing.length ? ` — missing ${missing.join(', ')}` : ''}${extra.length ? ` — not in it ${extra.join(', ')}` : ''}.`
    );
  }
  for (const name of listed) {
    const buf = await readFile(path.join(staged, name));
    const hash = `sha384-${crypto.createHash('sha384').update(buf).digest('base64')}`;
    if (hash !== manifest.files[name]) {
      throw new ModuleUploadError(422, 'hash_mismatch', `${name} does not match its sha384 in manifest.json.`);
    }
  }

  const target = finalDir(id, version, root);
  if (existsSync(target)) {
    const published = await readFile(path.join(target, 'manifest.json')).catch(() => null);
    await rm(staged, { recursive: true, force: true });
    if (published && published.equals(manifestBytes)) return { status: 'already', files: listed.length };
    throw new ModuleUploadError(409, 'version_exists', `${id} ${version} is already published with different content — bump the version.`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await rename(staged, target);
  return { status: 'published', files: listed.length };
}
