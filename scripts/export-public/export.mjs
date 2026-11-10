#!/usr/bin/env node
// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Open-core, step O-6 (TechDocs/POS_OPENCORE.md §11). The private monorepo is
// the source of truth; the public repository is an EXPORT of its open part.
// This script is the whole export:
//
//   node scripts/export-public/export.mjs check
//       Every tracked path is PUBLIC or PRIVATE by `rules.json` (nothing is
//       either by default), no public file imports a private one, and the
//       public tree of HEAD carries nothing private. Runs on every PR.
//
//   node scripts/export-public/export.mjs tree [rev] [--out <dir>]
//       Print the public tree of a commit; with --out, unpack it there (to run
//       the open CI on exactly what the mirror would get).
//
//   node scripts/export-public/export.mjs sync [--remote <url>] [--source <rev>] [--dry-run]
//       Replay the commits the mirror does not have yet onto its `main`, one
//       public commit per source commit (author, dates and message kept, an
//       `Exported-From: <sha>` trailer added), then bring the release tags.
//
// How it stays safe:
//   * allowlist — a path no rule names is UNKNOWN and stops everything;
//   * the public tree is built from git objects in a throw-away index, never
//     from the working tree, so an untracked or ignored file cannot ride along;
//   * every tree is checked again before it becomes a commit (`assertNoLeak`):
//     by path, by the private module ids on their own, and by content — a file
//     carrying the private marker fails the export wherever it was moved to;
//   * the mirror is only ever fast-forwarded: if its `main` holds a commit this
//     script did not make, the push is refused and nothing changes;
//   * commits are deterministic (same tree, parent, author, dates, message), so
//     a run that died before the push produces the same objects when repeated.
//
// No dependencies: git plumbing through child_process, Node 20.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class ExportError extends Error {}

const TRAILER = 'Exported-From';
const MIRROR_REF = 'refs/export-public/mirror';
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;

// ─── git ────────────────────────────────────────────────────────────────────

function git(repo, args, { input, env } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf-8',
      input,
      env: env ? { ...process.env, ...env } : process.env,
      maxBuffer: 1 << 28,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim();
    throw new ExportError(`git ${args.join(' ')}\n${detail}`);
  }
}

const rev = (repo, name) => git(repo, ['rev-parse', '--verify', '--quiet', name]).trim();
const treeOf = (repo, commit) => rev(repo, `${commit}^{tree}`);

function exists(repo, sha) {
  return spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo }).status === 0;
}

function isAncestor(repo, ancestor, descendant) {
  return spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repo }).status === 0;
}

// ─── rules ──────────────────────────────────────────────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(pattern) {
  if (pattern.endsWith('/')) {
    return { raw: pattern, dir: true, parent: pattern, test: (p) => p.startsWith(pattern) };
  }
  const segments = pattern.split('/');
  const res = segments.map((s) => new RegExp(`^${s.split('*').map(escapeRe).join('[^/]*')}$`));
  const parent = segments.length > 1 ? `${segments.slice(0, -1).join('/')}/` : '';
  return {
    raw: pattern,
    dir: false,
    parent,
    test: (p) => {
      const parts = p.split('/');
      return parts.length === res.length && res.every((re, i) => re.test(parts[i]));
    },
  };
}

/** Is `pattern` more specific than the explicit directory `dir` it reaches into? */
function specificFor(pattern, dir) {
  return pattern.dir
    ? pattern.raw.length > dir.length && pattern.raw.startsWith(dir)
    : pattern.parent.startsWith(dir);
}

/**
 * `raw` is rules.json; `privateModules` is pos/private-modules.json
 * (`{ remotes, libraries }`), from which the module paths are derived so the
 * list of private modules has one home.
 */
export function buildRules(raw, privateModules = {}) {
  const remotes = privateModules.remotes ?? [];
  const libraries = privateModules.libraries ?? [];
  const derived = [];
  for (const id of [...remotes, ...libraries]) derived.push(`pos/src/modules/${id}/`);
  for (const id of remotes) derived.push(`pos/vite.${id}-remote.config.ts`, `pos/e2e/${id}.spec.ts`);
  return {
    sourceRepo: raw.sourceRepo ?? '',
    publicRemote: raw.publicRemote ?? '',
    branch: raw.branch ?? 'main',
    tags: raw.tags ?? [],
    marker: raw.marker ?? '',
    bootstrapMessage: raw.bootstrapMessage ?? 'Private paths leave the public tree',
    explicit: raw.explicit ?? [],
    rename: raw.rename ?? {},
    privateIds: [...remotes, ...libraries],
    publicPatterns: (raw.public ?? []).map(compile),
    privatePatterns: [...(raw.private ?? []), ...derived].map(compile),
    cache: new Map(),
  };
}

export function loadRules(repo) {
  const read = (rel) => JSON.parse(readFileSync(path.join(repo, rel), 'utf-8'));
  const modulesFile = path.join(repo, 'pos', 'private-modules.json');
  return buildRules(
    read('scripts/export-public/rules.json'),
    existsSync(modulesFile) ? read('pos/private-modules.json') : {},
  );
}

/** 'private' | 'public' | 'unknown' for one tracked path (posix, repo-relative). */
export function classify(rules, p) {
  const hit = rules.cache.get(p);
  if (hit) return hit;
  let result = 'unknown';
  if (rules.privatePatterns.some((x) => x.test(p))) {
    result = 'private';
  } else if (Object.hasOwn(rules.rename, p)) {
    result = 'public';
  } else {
    const dir = rules.explicit
      .filter((d) => p.startsWith(d))
      .sort((a, b) => b.length - a.length)[0];
    if (rules.publicPatterns.some((x) => x.test(p) && (!dir || specificFor(x, dir)))) result = 'public';
  }
  rules.cache.set(p, result);
  return result;
}

// ─── the public tree of one commit ──────────────────────────────────────────

/**
 * The tree the mirror gets for `commitish`: private paths removed, renames
 * applied. Built in a temporary index — the working tree is never read.
 * Throws on a path no rule names.
 */
export function filteredTree(repo, rules, commitish) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'export-public-'));
  const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
  try {
    git(repo, ['read-tree', commitish], { env });
    const entries = new Map();
    for (const line of git(repo, ['ls-files', '-s', '-z'], { env }).split('\0')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      const [mode, sha] = line.slice(0, tab).split(' ');
      entries.set(line.slice(tab + 1), { mode, sha });
    }

    const remove = [];
    const unknown = [];
    for (const p of entries.keys()) {
      const kind = classify(rules, p);
      if (kind === 'private') remove.push(p);
      else if (kind === 'unknown') unknown.push(p);
    }
    if (unknown.length) {
      throw new ExportError(
        `${unknown.length} path(s) in ${commitish} are neither public nor private — name them in scripts/export-public/rules.json:\n` +
          unknown.slice(0, 30).map((p) => `  ${p}`).join('\n') +
          (unknown.length > 30 ? `\n  … and ${unknown.length - 30} more` : ''),
      );
    }

    const add = [];
    for (const [from, to] of Object.entries(rules.rename)) {
      const entry = entries.get(from);
      if (!entry) continue;
      if (entries.has(to) && classify(rules, to) !== 'private') {
        throw new ExportError(`rename ${from} → ${to}: ${to} is itself public — it would be overwritten`);
      }
      remove.push(from);
      add.push(`${entry.mode},${entry.sha},${to}`);
    }

    if (remove.length) {
      git(repo, ['update-index', '--force-remove', '-z', '--stdin'], { env, input: `${remove.join('\0')}\0` });
    }
    for (const info of add) git(repo, ['update-index', '--add', '--cacheinfo', info], { env });
    return { tree: git(repo, ['write-tree'], { env }).trim(), removed: remove.length, total: entries.size };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The last line of defence: nothing private in a tree that is about to be published. */
export function assertNoLeak(repo, rules, tree) {
  const leaks = [];
  const renamed = new Set(Object.values(rules.rename));
  const ids = rules.privateIds.map(escapeRe).join('|');
  const byId = ids ? new RegExp(`^pos/(?:src/modules/(?:${ids})/|vite\\.(?:${ids})-remote\\.config\\.)`) : null;
  for (const p of git(repo, ['ls-tree', '-r', '--name-only', '-z', tree]).split('\0')) {
    if (!p) continue;
    if (byId?.test(p)) leaks.push(`${p} (a private module's path)`);
    else if (!renamed.has(p) && classify(rules, p) !== 'public') leaks.push(`${p} (${classify(rules, p)})`);
  }
  if (rules.marker) {
    const grep = spawnSync('git', ['grep', '-I', '-l', '-F', '-e', rules.marker, tree], {
      cwd: repo,
      encoding: 'utf-8',
      maxBuffer: 1 << 28,
    });
    if (grep.status === 0) {
      for (const line of grep.stdout.split('\n')) {
        if (line) leaks.push(`${line.slice(line.indexOf(':') + 1)} (carries the ${rules.marker} marker)`);
      }
    } else if (grep.status !== 1) {
      throw new ExportError(`git grep for the private marker failed:\n${grep.stderr}`);
    }
  }
  if (leaks.length) {
    throw new ExportError(
      `REFUSING TO EXPORT — the public tree ${tree} would carry private content:\n` +
        leaks.slice(0, 30).map((l) => `  ${l}`).join('\n') +
        (leaks.length > 30 ? `\n  … and ${leaks.length - 30} more` : ''),
    );
  }
}

// ─── commits ────────────────────────────────────────────────────────────────

/**
 * The message a source commit carries in the mirror:
 *   * `[skip ci]` and its kin go — the mirror's CI is what proves the open part
 *     stands on its own, and a release tag pushed onto a `[skip ci]` commit
 *     would not start the installers' build;
 *   * a bare `#12` names a pull request of the SOURCE repository, so it is
 *     spelled `owner/repo#12` rather than left to link to an unrelated #12 of
 *     the mirror.
 */
export function publicMessage(message, rules) {
  let text = message.replace(/\r\n/g, '\n');
  text = text.replace(/[ \t]*\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/gi, '');
  text = text
    .split('\n')
    .filter((line) => !/^skip-checks:\s*true\s*$/i.test(line))
    .join('\n');
  if (rules.sourceRepo) {
    text = text.replace(/(^|[\s([,;:])#(\d{1,6})(?![\w-])/gm, `$1${rules.sourceRepo}#$2`);
  }
  return `${text.replace(/\s+$/, '')}\n`;
}

function withTrailer(repo, message, sourceSha) {
  return git(repo, ['interpret-trailers', '--no-divider', '--trailer', `${TRAILER}: ${sourceSha}`], {
    input: message,
  });
}

/** The source commit a mirror commit was exported from, or null. */
function exportedFrom(repo, commit) {
  const body = git(repo, ['log', '-1', '--format=%B', commit]);
  const all = [...body.matchAll(new RegExp(`^${TRAILER}:\\s*([0-9a-f]{40})\\s*$`, 'gm'))];
  return all.length ? all[all.length - 1][1] : null;
}

function commitMeta(repo, commit) {
  const [an, ae, ad, cn, ce, cd, ...rest] = git(repo, [
    'log', '-1', '--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B', commit,
  ]).split('\0');
  return { an, ae, ad, cn, ce, cd, message: rest.join('\0') };
}

function commitTree(repo, tree, parent, meta, message) {
  return git(repo, ['commit-tree', tree, '-p', parent], {
    input: message,
    env: {
      GIT_AUTHOR_NAME: meta.an,
      GIT_AUTHOR_EMAIL: meta.ae,
      GIT_AUTHOR_DATE: meta.ad,
      GIT_COMMITTER_NAME: meta.cn,
      GIT_COMMITTER_EMAIL: meta.ce,
      GIT_COMMITTER_DATE: meta.cd,
    },
  }).trim();
}

const subject = (repo, commit) => git(repo, ['log', '-1', '--format=%s', commit]).trim();

// ─── sync ───────────────────────────────────────────────────────────────────

/**
 * Bring the mirror up to `source`. Returns what happened; with `dryRun`
 * everything is computed (and every tree checked) but nothing is pushed.
 */
export function sync(repo, rules, { remote, source = 'HEAD', dryRun = false, log = () => {} } = {}) {
  const target = remote || rules.publicRemote;
  if (!target) throw new ExportError('no mirror to export to: pass --remote or set publicRemote in rules.json');
  const branch = rules.branch;

  git(repo, ['fetch', '--no-tags', '--quiet', target, `+refs/heads/${branch}:${MIRROR_REF}`]);
  const base = rev(repo, MIRROR_REF);
  const head = rev(repo, `${source}^{commit}`);
  let tip = base;
  const exported = [];
  let skipped = 0;
  let bootstrap = null;

  let last = exportedFrom(repo, base);
  if (!last) {
    // First export: the mirror's head must BE a commit of ours (the split
    // point — until then the two repositories were one history). Removing the
    // private paths from it is a commit of its own, so that no later commit's
    // message is attached to a diff that deletes the modules.
    if (!isAncestor(repo, base, head)) {
      throw new ExportError(
        `the mirror's ${branch} (${base}) was not made by this export and is not part of ${source} — ` +
          'someone pushed to the mirror directly; nothing was exported',
      );
    }
    const { tree } = filteredTree(repo, rules, base);
    if (tree !== treeOf(repo, base)) {
      assertNoLeak(repo, rules, tree);
      tip = commitTree(repo, tree, base, commitMeta(repo, base), withTrailer(repo, `${rules.bootstrapMessage.trim()}\n`, base));
      bootstrap = tip;
      log(`bootstrap  ${tip.slice(0, 10)}  private paths leave the mirror (split point ${base.slice(0, 10)})`);
    }
    last = base;
  } else {
    if (!exists(repo, last)) {
      throw new ExportError(`the mirror was last exported from ${last}, which this repository does not have`);
    }
    if (!isAncestor(repo, last, head)) {
      throw new ExportError(`the mirror was last exported from ${last}, which is not an ancestor of ${source} — history was rewritten`);
    }
  }

  const commits = git(repo, ['rev-list', '--reverse', '--first-parent', `${last}..${head}`]).split('\n').filter(Boolean);
  for (const commit of commits) {
    const { tree } = filteredTree(repo, rules, commit);
    if (tree === treeOf(repo, tip)) {
      skipped += 1;
      log(`skip       ${commit.slice(0, 10)}  ${subject(repo, commit)}  (nothing public changed)`);
      continue;
    }
    assertNoLeak(repo, rules, tree);
    const meta = commitMeta(repo, commit);
    tip = commitTree(repo, tree, tip, meta, withTrailer(repo, publicMessage(meta.message, rules), commit));
    exported.push([commit, tip]);
    log(`export     ${commit.slice(0, 10)} → ${tip.slice(0, 10)}  ${subject(repo, tip)}`);
  }

  if (tip !== base && !dryRun) {
    // No `+`: a mirror whose head moved since the fetch refuses this push.
    git(repo, ['push', '--quiet', target, `${tip}:refs/heads/${branch}`]);
    git(repo, ['update-ref', MIRROR_REF, tip]);
  }

  const tags = syncTags(repo, rules, { target, tip, head, dryRun, log, exported });
  return { base, tip, bootstrap, exported, skipped, tags, pushed: tip !== base && !dryRun };
}

/** Release tags of the source, re-pointed at the mirror's commits. */
function syncTags(repo, rules, { target, tip, head, dryRun, log, exported }) {
  if (!rules.tags.length) return [];
  const refs = rules.tags.map((p) => `refs/tags/${p}`);
  const local = git(repo, [
    'for-each-ref', '--merged', head,
    '--format=%(refname:strip=2)%00%(objecttype)%00%(objectname)%00%(*objectname)', ...refs,
  ]).split('\n').filter(Boolean).map((line) => {
    const [name, type, object, peeled] = line.split('\0');
    return { name, annotated: type === 'tag', object, commit: peeled || object };
  });
  if (!local.length) return [];

  const remote = new Map();
  for (const line of git(repo, ['ls-remote', '--tags', target, ...refs]).split('\n')) {
    if (!line) continue;
    const [sha, ref] = line.split('\t');
    const name = ref.replace(/^refs\/tags\//, '');
    if (name.endsWith('^{}')) remote.set(name.slice(0, -3), sha);
    else if (!remote.has(name)) remote.set(name, sha);
  }

  let map = null;
  const mirrorCommitOf = (sourceCommit) => {
    // Before the split the two histories are one, so the commit is its own
    // mirror. After it: the mirror commit exported from it, or from its
    // nearest ancestor that changed anything public.
    if (isAncestor(repo, sourceCommit, tip)) return sourceCommit;
    if (!map) {
      map = new Map(exported);
      for (const chunk of git(repo, ['log', '--format=%x01%H%x00%B', tip]).split('\x01')) {
        if (!chunk) continue;
        const nul = chunk.indexOf('\0');
        const all = [...chunk.slice(nul + 1).matchAll(new RegExp(`^${TRAILER}:\\s*([0-9a-f]{40})\\s*$`, 'gm'))];
        if (all.length && !map.has(all[all.length - 1][1])) map.set(all[all.length - 1][1], chunk.slice(0, nul));
      }
    }
    for (const sha of git(repo, ['rev-list', '--first-parent', sourceCommit]).split('\n')) {
      if (map.has(sha)) return map.get(sha);
      if (sha && isAncestor(repo, sha, tip)) return sha;
    }
    return null;
  };

  const pushes = [];
  const done = [];
  for (const tag of local) {
    const commit = mirrorCommitOf(tag.commit);
    if (!commit) throw new ExportError(`tag ${tag.name}: no mirror commit for ${tag.commit}`);
    if (remote.get(tag.name) === commit) continue;
    let object = commit;
    if (tag.annotated) {
      const body = git(repo, ['cat-file', 'tag', tag.object]).replace(/^object [0-9a-f]+/, `object ${commit}`);
      object = git(repo, ['mktag'], { input: body }).trim();
    }
    pushes.push(`+${object}:refs/tags/${tag.name}`);
    done.push({ name: tag.name, commit });
    log(`tag        ${tag.name} → ${commit.slice(0, 10)}`);
  }
  if (pushes.length && !dryRun) git(repo, ['push', '--quiet', target, ...pushes]);
  return done;
}

// ─── check ──────────────────────────────────────────────────────────────────

/** Relative imports of a public file that land on a private path. */
function privateImports(repo, rules, file) {
  let source;
  try {
    source = readFileSync(path.join(repo, file), 'utf-8');
  } catch {
    return [];
  }
  const found = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]*)\1/g;
  for (const match of source.matchAll(re)) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
    const bare = resolved.replace(/\.(?:[cm]?[jt]sx?)$/, '');
    const candidates = [resolved, `${resolved}/`, ...['.ts', '.tsx', '.js', '.mjs'].map((ext) => bare + ext)];
    if (candidates.some((c) => classify(rules, c) === 'private')) found.push(match[2]);
  }
  return found;
}

export function check(repo, rules, commitish = 'HEAD') {
  const files = git(repo, ['ls-tree', '-r', '--name-only', '-z', commitish]).split('\0').filter(Boolean);
  const problems = [];
  const count = { public: 0, private: 0, unknown: 0 };
  for (const file of files) {
    const kind = classify(rules, file);
    count[kind] += 1;
    if (kind === 'unknown') problems.push(`${file}: neither public nor private — name it in scripts/export-public/rules.json`);
    if (kind === 'public' && CODE_EXT.test(file)) {
      for (const spec of privateImports(repo, rules, file)) {
        problems.push(`${file}: imports the private '${spec}' — the public tree would not build`);
      }
    }
  }
  let tree = null;
  if (!count.unknown) {
    try {
      tree = filteredTree(repo, rules, commitish).tree;
      assertNoLeak(repo, rules, tree);
    } catch (error) {
      if (!(error instanceof ExportError)) throw error;
      problems.push(error.message);
    }
  }
  return { count, problems, tree };
}

// ─── cli ────────────────────────────────────────────────────────────────────

function main(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--dry-run') flags.dryRun = true;
    else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[(i += 1)];
    else positional.push(rest[i]);
  }
  const repo = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const rules = loadRules(repo);

  if (command === 'check') {
    const { count, problems, tree } = check(repo, rules, positional[0] ?? 'HEAD');
    if (problems.length) {
      console.error(`export-public check: ${problems.length} problem(s)\n`);
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log(`export-public check: OK — ${count.public} public, ${count.private} private, public tree ${tree.slice(0, 10)} carries nothing private.`);
    return;
  }

  if (command === 'tree') {
    const commitish = positional[0] ?? 'HEAD';
    const { tree, removed, total } = filteredTree(repo, rules, commitish);
    assertNoLeak(repo, rules, tree);
    if (flags.out) {
      mkdirSync(flags.out, { recursive: true });
      const archive = spawnSync('git', ['archive', '--format=tar', tree], { cwd: repo, maxBuffer: 1 << 30 });
      if (archive.status !== 0) throw new ExportError(`git archive failed: ${archive.stderr}`);
      execFileSync('tar', ['-x', '-C', flags.out], { input: archive.stdout });
    }
    console.log(`${tree}  (${total - removed} of ${total} files${flags.out ? `, unpacked to ${flags.out}` : ''})`);
    return;
  }

  if (command === 'sync') {
    const result = sync(repo, rules, {
      remote: flags.remote,
      source: flags.source,
      dryRun: Boolean(flags.dryRun),
      log: (line) => console.log(line),
    });
    const verb = flags.dryRun ? 'would push' : 'pushed';
    console.log(
      result.tip === result.base && !result.tags.length
        ? `export-public sync: the mirror is up to date (${result.skipped} commit(s) changed nothing public).`
        : `export-public sync: ${verb} ${result.exported.length + (result.bootstrap ? 1 : 0)} commit(s) and ${result.tags.length} tag(s); ${result.skipped} skipped; mirror ${result.base.slice(0, 10)} → ${result.tip.slice(0, 10)}.`,
    );
    return;
  }

  console.error('usage: export.mjs check [rev] | tree [rev] [--out <dir>] | sync [--remote <url>] [--source <rev>] [--dry-run]');
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ExportError) {
      console.error(`export-public: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
