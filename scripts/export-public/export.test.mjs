// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `node --test scripts/export-public/` — the export against throw-away
// repositories: a "source" with public and private paths and a bare "mirror"
// that starts as its copy, exactly the shape of the real split.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ExportError,
  assertNoLeak,
  buildRules,
  check,
  classify,
  filteredTree,
  loadRules,
  publicMessage,
  sync,
} from './export.mjs';

const MARKER = 'TEST-PRIVATE-MARKER';
const RAW = {
  sourceRepo: 'acme/source',
  branch: 'main',
  tags: ['pos-v*'],
  marker: MARKER,
  bootstrapMessage: 'Private paths leave the mirror',
  explicit: ['pos/src/modules/', 'TechDocs/'],
  rename: { 'CLAUDE.public.md': 'CLAUDE.md' },
  public: ['README.md', 'src/', 'pos/', 'pos/src/modules/*', 'pos/src/modules/products/', 'TechDocs/guides/', 'TechDocs/OPEN.md'],
  private: ['CLAUDE.md', 'TechDocs/SECRET.md', 'src/private.test.ts'],
};
const PRIVATE_MODULES = { remotes: ['tables'], libraries: ['fiscal-core'] };
const rules = () => buildRules(RAW, PRIVATE_MODULES);

const roots = [];
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

function sh(cwd, args, env = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Author',
      GIT_AUTHOR_EMAIL: 'author@example.com',
      GIT_COMMITTER_NAME: 'Committer',
      GIT_COMMITTER_EMAIL: 'committer@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      ...env,
    },
  }).trim();
}

function write(repo, files) {
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(repo, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

let clock = 1_700_000_000;
function commit(repo, message, files) {
  write(repo, files);
  sh(repo, ['add', '-A']);
  clock += 60;
  const date = `${clock} +0200`;
  sh(repo, ['commit', '-q', '-m', message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  return sh(repo, ['rev-parse', 'HEAD']);
}

const SPLIT_FILES = {
  'README.md': 'open\n',
  'CLAUDE.md': 'the full private instructions\n',
  'CLAUDE.public.md': 'the public instructions\n',
  'src/api.ts': 'export const api = 1;\n',
  'pos/package.json': '{"version":"1.0.0"}\n',
  'pos/src/modules/registry.ts': 'export const MODULES = [];\n',
  'pos/src/modules/products/index.ts': 'export const products = 1;\n',
  'pos/src/modules/tables/manifest.ts': 'export const tables = 1;\n',
  'pos/src/modules/fiscal-core/types.ts': 'export type T = 1;\n',
  'pos/vite.tables-remote.config.ts': 'export default {};\n',
  'pos/e2e/tables.spec.ts': 'test\n',
  'TechDocs/OPEN.md': 'open doc\n',
  'TechDocs/SECRET.md': 'private doc\n',
  'TechDocs/guides/kasyr.md': 'guide\n',
};

/** A source repository at its split point and a bare mirror holding the same history. */
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
  roots.push(root);
  const source = path.join(root, 'source');
  const mirror = path.join(root, 'mirror.git');
  mkdirSync(source);
  sh(source, ['init', '-q', '-b', 'main']);
  const split = commit(source, 'Everything is public (#417)', SPLIT_FILES);
  sh(root, ['clone', '-q', '--bare', source, mirror]);
  return { root, source, mirror, split };
}

const mirrorLog = (mirror) => sh(mirror, ['log', '--format=%s', 'main']).split('\n');
const mirrorFiles = (mirror, ref = 'main') => sh(mirror, ['ls-tree', '-r', '--name-only', ref]).split('\n');
const run = (f, options = {}) => sync(f.source, rules(), { remote: f.mirror, ...options });

describe('classify', () => {
  const cases = [
    ['README.md', 'public'],
    ['src/deep/file.ts', 'public'],
    ['CLAUDE.md', 'private'],
    ['CLAUDE.public.md', 'public'], // a rename source
    ['pos/package.json', 'public'],
    ['pos/src/modules/registry.ts', 'public'], // a loose file of the explicit dir
    ['pos/src/modules/products/pages/List.tsx', 'public'],
    ['pos/src/modules/tables/manifest.ts', 'private'], // derived from the module list
    ['pos/src/modules/fiscal-core/types.ts', 'private'], // a library
    ['pos/vite.tables-remote.config.ts', 'private'],
    ['pos/e2e/tables.spec.ts', 'private'],
    ['pos/e2e/checkout.spec.ts', 'public'],
    ['pos/vite.fiscal-core-remote.config.ts', 'public'], // a library has no remote config of its own
    ['pos/src/modules/brand-new/index.ts', 'unknown'], // `pos/` being public is not enough here
    ['TechDocs/OPEN.md', 'public'],
    ['TechDocs/SECRET.md', 'private'],
    ['TechDocs/NEW_DOC.md', 'unknown'],
    ['TechDocs/guides/vlasnyk.md', 'public'],
    ['src/private.test.ts', 'private'], // private wins inside a public directory
    ['new-top-level/file', 'unknown'],
    ['README.md.bak', 'unknown'], // a file pattern is the whole name
  ];
  for (const [file, expected] of cases) {
    it(`${file} → ${expected}`, () => assert.equal(classify(rules(), file), expected));
  }
});

describe('filteredTree', () => {
  it('drops private paths, renames, and leaves the rest byte-identical', () => {
    const f = fixture();
    const { tree, removed } = filteredTree(f.source, rules(), 'HEAD');
    const files = sh(f.source, ['ls-tree', '-r', '--name-only', tree]).split('\n');
    assert.deepEqual(files.sort(), [
      'CLAUDE.md',
      'README.md',
      'TechDocs/OPEN.md',
      'TechDocs/guides/kasyr.md',
      'pos/package.json',
      'pos/src/modules/products/index.ts',
      'pos/src/modules/registry.ts',
      'src/api.ts',
    ]);
    assert.equal(sh(f.source, ['show', `${tree}:CLAUDE.md`]), 'the public instructions');
    assert.equal(sh(f.source, ['rev-parse', `${tree}:src`]), sh(f.source, ['rev-parse', 'HEAD:src']));
    assert.equal(removed, 7); // six private paths + the rename source
    assertNoLeak(f.source, rules(), tree);
  });

  it('never reads the working tree', () => {
    const f = fixture();
    const before = filteredTree(f.source, rules(), 'HEAD').tree;
    write(f.source, { 'src/untracked.ts': 'x', 'README.md': 'edited, not committed\n' });
    assert.equal(filteredTree(f.source, rules(), 'HEAD').tree, before);
    assert.equal(sh(f.source, ['status', '--porcelain']).includes('untracked.ts'), true); // and leaves it alone
  });

  it('refuses a path no rule names', () => {
    const f = fixture();
    commit(f.source, 'a new module, not classified', { 'pos/src/modules/brand-new/index.ts': 'x\n' });
    assert.throws(() => filteredTree(f.source, rules(), 'HEAD'), (error) => {
      assert.ok(error instanceof ExportError);
      assert.match(error.message, /pos\/src\/modules\/brand-new\/index\.ts/);
      return true;
    });
  });
});

describe('assertNoLeak', () => {
  it('refuses a public file that carries the private marker', () => {
    const f = fixture();
    commit(f.source, 'a private file copied into a public place', { 'src/copied.ts': `// ${MARKER}\nexport const x = 1;\n` });
    const { tree } = filteredTree(f.source, rules(), 'HEAD');
    assert.throws(() => assertNoLeak(f.source, rules(), tree), /src\/copied\.ts \(carries the TEST-PRIVATE-MARKER marker\)/);
  });

  it('refuses a private module path even when a rule calls it public', () => {
    const f = fixture();
    // A tree built by rules that "forgot" the module list and called the module directories public…
    const wrong = buildRules(
      { ...RAW, rename: {}, public: [...RAW.public, 'pos/src/modules/tables/', 'pos/src/modules/fiscal-core/'], private: ['CLAUDE.md', 'CLAUDE.public.md', 'TechDocs/SECRET.md'] },
      {},
    );
    const { tree } = filteredTree(f.source, wrong, 'HEAD');
    // …is still refused by a guard that knows the ids on its own.
    assert.throws(() => assertNoLeak(f.source, rules(), tree), /pos\/src\/modules\/tables\/manifest\.ts \(a private module's path\)/);
  });
});

describe('publicMessage', () => {
  const cases = [
    ['chore(pos): release pos-v2.9.2 [skip ci]\n', 'chore(pos): release pos-v2.9.2\n'],
    ['Fix the till (#12)\n\nSee #7, and #8.\n', 'Fix the till (acme/source#12)\n\nSee acme/source#7, and acme/source#8.\n'],
    ['Follow-up to merenkoff/tiktok-live#399\n', 'Follow-up to merenkoff/tiktok-live#399\n'],
    ['Colour #1a2b3c and step-#5 stay\n', 'Colour #1a2b3c and step-#5 stay\n'],
    ['Subject\n\nskip-checks: true\nCo-Authored-By: X <x@example.com>\n\n\n', 'Subject\n\nCo-Authored-By: X <x@example.com>\n'],
    ['Docs [CI SKIP] done\r\n', 'Docs done\n'],
  ];
  for (const [input, expected] of cases) {
    it(JSON.stringify(input), () => assert.equal(publicMessage(input, rules()), expected));
  }
});

describe('sync', () => {
  it('the first export is one commit that removes the private paths', () => {
    const f = fixture();
    const result = run(f);
    assert.equal(result.exported.length, 0);
    assert.ok(result.bootstrap);
    assert.deepEqual(mirrorLog(f.mirror), ['Private paths leave the mirror', 'Everything is public (#417)']);
    assert.equal(sh(f.mirror, ['rev-parse', 'main~1']), f.split); // history before the split is untouched
    assert.equal(mirrorFiles(f.mirror).some((p) => p.includes('tables') || p.includes('fiscal-core') || p === 'TechDocs/SECRET.md'), false);
    assert.equal(sh(f.mirror, ['show', 'main:CLAUDE.md']), 'the public instructions');
    assert.match(sh(f.mirror, ['log', '-1', '--format=%B', 'main']), new RegExp(`Exported-From: ${f.split}`));
  });

  it('replays commits one to one, skips private-only ones, keeps author, dates and message', () => {
    const f = fixture();
    run(f);
    const privateOnly = commit(f.source, 'tables: a private change (#1)', { 'pos/src/modules/tables/manifest.ts': 'export const tables = 2;\n' });
    const mixed = commit(
      f.source,
      'Server and module together (#2)\n\nBody line.\n\nCo-Authored-By: Claude <noreply@example.com>',
      { 'src/api.ts': 'export const api = 2;\n', 'pos/src/modules/tables/manifest.ts': 'export const tables = 3;\n' },
    );
    const result = run(f);
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.exported.map(([from]) => from), [mixed]);
    assert.deepEqual(mirrorLog(f.mirror).slice(0, 2), ['Server and module together (acme/source#2)', 'Private paths leave the mirror']);

    const body = sh(f.mirror, ['log', '-1', '--format=%B', 'main']);
    assert.match(body, /Body line\./);
    assert.match(body, new RegExp(`Co-Authored-By: Claude <noreply@example.com>\nExported-From: ${mixed}$`));
    assert.equal(body.includes(privateOnly), false);
    assert.equal(
      sh(f.mirror, ['log', '-1', '--format=%an|%ae|%at|%cn|%ct', 'main']),
      sh(f.source, ['log', '-1', '--format=%an|%ae|%at|%cn|%ct', mixed]),
    );
    assert.equal(sh(f.mirror, ['show', 'main:src/api.ts']), 'export const api = 2;');
    assert.deepEqual(sh(f.mirror, ['show', '--name-only', '--format=', 'main']).split('\n'), ['src/api.ts']);
  });

  it('is idempotent, and resumes from the trailer on the mirror', () => {
    const f = fixture();
    run(f);
    commit(f.source, 'One', { 'src/api.ts': 'one\n' });
    run(f);
    const head = sh(f.mirror, ['rev-parse', 'main']);
    const again = run(f);
    assert.equal(again.pushed, false);
    assert.equal(sh(f.mirror, ['rev-parse', 'main']), head);
    commit(f.source, 'Two', { 'src/api.ts': 'two\n' });
    assert.equal(run(f).exported.length, 1);
    assert.equal(sh(f.mirror, ['rev-parse', 'main~1']), head);
  });

  it('produces the same commits when a run is repeated from scratch', () => {
    const f = fixture();
    commit(f.source, 'One', { 'src/api.ts': 'one\n' });
    const dry = run(f, { dryRun: true });
    assert.equal(dry.pushed, false);
    assert.equal(sh(f.mirror, ['rev-parse', 'main']), f.split); // a dry run pushes nothing
    const real = run(f);
    assert.equal(real.tip, dry.tip);
  });

  it('refuses a mirror someone pushed to, and changes nothing', () => {
    const f = fixture();
    run(f);
    const stray = path.join(f.root, 'stray');
    sh(f.root, ['clone', '-q', f.mirror, stray]);
    commit(stray, 'A commit made in the mirror', { 'README.md': 'edited in the mirror\n' });
    sh(stray, ['push', '-q', 'origin', 'HEAD:main']);
    const head = sh(f.mirror, ['rev-parse', 'main']);
    commit(f.source, 'One', { 'src/api.ts': 'one\n' });
    assert.throws(() => run(f), /was not made by this export/);
    assert.equal(sh(f.mirror, ['rev-parse', 'main']), head);
  });

  it('stops before pushing anything when one commit of the batch would leak', () => {
    const f = fixture();
    run(f);
    const head = sh(f.mirror, ['rev-parse', 'main']);
    commit(f.source, 'Fine', { 'src/api.ts': 'fine\n' });
    commit(f.source, 'Leaks', { 'src/copied.ts': `// ${MARKER}\n` });
    assert.throws(() => run(f), /REFUSING TO EXPORT/);
    assert.equal(sh(f.mirror, ['rev-parse', 'main']), head);
  });

  it('stops on a commit whose new path is not classified', () => {
    const f = fixture();
    run(f);
    const head = sh(f.mirror, ['rev-parse', 'main']);
    commit(f.source, 'A doc nobody classified', { 'TechDocs/NEW_DOC.md': 'x\n' });
    assert.throws(() => run(f), /TechDocs\/NEW_DOC\.md/);
    assert.equal(sh(f.mirror, ['rev-parse', 'main']), head);
  });

  it('brings release tags: annotated ones keep their notes and point at the mirror commit', () => {
    const f = fixture();
    sh(f.source, ['tag', 'pos-v1.0.0']); // before the split: the same commit on both sides
    sh(f.mirror, ['tag', 'pos-v1.0.0', f.split]);
    run(f);
    const bump = commit(f.source, 'chore(pos): release pos-v1.0.1 [skip ci]', { 'pos/package.json': '{"version":"1.0.1"}\n' });
    sh(f.source, ['tag', '-a', 'pos-v1.0.1', '-m', 'Що нового\n\n- перша зміна']);
    commit(f.source, 'tables only', { 'pos/src/modules/tables/manifest.ts': 'export const tables = 9;\n' });
    sh(f.source, ['tag', 'pos-v1.0.2']); // on a commit the mirror never sees
    sh(f.source, ['tag', 'module-tables-v1.0.1']); // not a release tag of the app

    const result = run(f);
    assert.deepEqual(result.tags.map((t) => t.name).sort(), ['pos-v1.0.1', 'pos-v1.0.2']);
    const exported = result.exported.find(([from]) => from === bump)[1];
    assert.equal(sh(f.mirror, ['rev-parse', 'pos-v1.0.1^{commit}']), exported);
    assert.equal(sh(f.mirror, ['cat-file', '-t', 'pos-v1.0.1']), 'tag');
    assert.match(sh(f.mirror, ['cat-file', 'tag', 'pos-v1.0.1']), /Що нового\n\n- перша зміна/);
    assert.equal(sh(f.mirror, ['log', '-1', '--format=%s', 'pos-v1.0.1']), 'chore(pos): release pos-v1.0.1');
    // a tag on a private-only commit lands on the nearest exported ancestor
    assert.equal(sh(f.mirror, ['rev-parse', 'pos-v1.0.2^{commit}']), exported);
    assert.equal(sh(f.mirror, ['rev-parse', 'pos-v1.0.0']), f.split);
    assert.equal(sh(f.mirror, ['tag', '--list', 'module-*']), '');

    assert.deepEqual(run(f).tags, []); // nothing to move the second time
  });

  it('leaves the tags of the shared history alone, whatever the checkout says', () => {
    const f = fixture();
    const second = commit(f.source, 'Still shared', { 'src/api.ts': 'export const api = 2;\n' });
    sh(f.source, ['push', '-q', f.mirror, 'main']); // the split point is now `second`
    // a checkout older than the mirror's tags: one the mirror dropped, one it moved
    sh(f.source, ['tag', 'pos-v0.9.0', f.split]);
    sh(f.source, ['tag', 'pos-v0.9.1', f.split]);
    sh(f.mirror, ['tag', 'pos-v0.9.1', second]);

    const first = run(f);
    assert.equal(first.bootstrap !== null && first.bootstrap !== undefined, true);
    assert.deepEqual(first.tags, []);
    assert.equal(sh(f.mirror, ['tag', '--list', 'pos-v0.9.0']), '');
    assert.equal(sh(f.mirror, ['rev-parse', 'pos-v0.9.1']), second);

    // and still not after real commits have been exported
    commit(f.source, 'Public work', { 'src/api.ts': 'export const api = 3;\n' });
    assert.deepEqual(run(f).tags, []);
    assert.equal(sh(f.mirror, ['tag', '--list', 'pos-v0.9.0']), '');
    assert.equal(sh(f.mirror, ['rev-parse', 'pos-v0.9.1']), second);
  });
});

describe('check', () => {
  it('passes on a classified tree', () => {
    const f = fixture();
    const result = check(f.source, rules());
    assert.deepEqual(result.problems, []);
    assert.equal(result.count.unknown, 0);
  });

  it('names an unclassified path and a public import of a private file', () => {
    const f = fixture();
    commit(f.source, 'Two mistakes', {
      'TechDocs/NEW_DOC.md': 'x\n',
      'src/__tests__/letters.test.ts': "import { T } from '../../pos/src/modules/fiscal-core/types.js';\nexport const t: T = 1;\n",
      'src/fine.ts': "import { api } from './api.js';\nexport default api;\n",
    });
    const { problems } = check(f.source, rules());
    assert.equal(problems.length, 2);
    assert.match(problems.join('\n'), /TechDocs\/NEW_DOC\.md: neither public nor private/);
    assert.match(problems.join('\n'), /src\/__tests__\/letters\.test\.ts: imports the private '..\/..\/pos\/src\/modules\/fiscal-core\/types\.js'/);
  });

  it('refuses a file written for the mirror that names a private path', () => {
    const f = fixture();
    commit(f.source, 'The public instructions point at what is not there', {
      'CLAUDE.public.md': [
        '# CLAUDE.md', // the name the mirror gives this very file — allowed
        'Read TechDocs/OPEN.md and TechDocs/guides/kasyr.md.', // public
        'The hall map is pos/src/modules/tables/manifest.ts.', // a private module, by its directory
        'Its design is in `SECRET.md`.', // a private document, by its bare name
        'Private too: src/private.test.ts (see src/private.test.ts).', // by its path, said once
        'Private modules: tables, fiscal-core.', // ids are not paths
        'NOT_SECRET.md is another file.', // the tail of a longer name
      ].join('\n'),
    });
    const { problems } = check(f.source, rules());
    assert.deepEqual(problems, [
      "CLAUDE.public.md: names the private 'SECRET.md' — it is published as CLAUDE.md, where that path does not exist",
      "CLAUDE.public.md: names the private 'pos/src/modules/tables/' — it is published as CLAUDE.md, where that path does not exist",
      "CLAUDE.public.md: names the private 'src/private.test.ts' — it is published as CLAUDE.md, where that path does not exist",
    ]);
  });

  it('names a private document once, by its path rather than its bare name too', () => {
    const f = fixture();
    commit(f.source, 'A full path', { 'CLAUDE.public.md': 'See TechDocs/SECRET.md.\n' });
    assert.deepEqual(check(f.source, rules()).problems, [
      "CLAUDE.public.md: names the private 'TechDocs/SECRET.md' — it is published as CLAUDE.md, where that path does not exist",
    ]);
  });

  it('lets a bare name through when a public file carries it too', () => {
    const f = fixture();
    commit(f.source, 'Two READMEs', {
      'TechDocs/guides/README.md': 'open\n',
      'pos/src/modules/tables/README.md': 'private\n',
      'CLAUDE.public.md': 'Start with README.md.\n',
    });
    assert.deepEqual(check(f.source, rules()).problems, []);
  });
});

describe('the rules of this repository', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const real = loadRules(repo);

  it('derive every private module from pos/private-modules.json', () => {
    const { remotes, libraries } = JSON.parse(readFileSync(path.join(repo, 'pos', 'private-modules.json'), 'utf-8'));
    for (const id of [...remotes, ...libraries]) {
      assert.equal(classify(real, `pos/src/modules/${id}/anything.ts`), 'private', id);
    }
    for (const id of remotes) {
      assert.equal(classify(real, `pos/vite.${id}-remote.config.ts`), 'private', id);
      assert.equal(classify(real, `pos/e2e/${id}.spec.ts`), 'private', id);
    }
  });

  it('keep the open platform public and the export itself private', () => {
    for (const file of [
      'src/pos/pos.plugin.ts',
      'pos/src/platform/index.ts',
      'pos/src/modules/registry.ts',
      'pos/src/modules/vertical-clothing/manifest.ts',
      'pos/src/modules/stocktake/remote-entry.ts',
      'pos/private-modules.json',
      'TechDocs/guides/kasyr.md',
      'TechDocs/POS_MODULE_SLOTS.md',
      '.github/workflows/pos-release.yml',
      'LICENSE',
    ]) {
      assert.equal(classify(real, file), 'public', file);
    }
    for (const file of [
      'CLAUDE.md',
      'scripts/export-public/rules.json',
      '.github/workflows/export-public.yml',
      '.github/dependabot.yml',
      'TechDocs/POS_TABLES.md',
      'TechDocs/grocery/G3_DEBTS.md',
      'TechDocs/legal/offer.md',
    ]) {
      assert.equal(classify(real, file), 'private', file);
    }
    assert.equal(classify(real, 'pos/src/modules/some-new-module/index.ts'), 'unknown');
    assert.equal(classify(real, 'TechDocs/SOME_NEW_DOC.md'), 'unknown');
    assert.equal(classify(real, '.github/workflows/some-new.yml'), 'unknown');
  });
});
