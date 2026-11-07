import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Open-core (`TechDocs/POS_OPENCORE.md` §5, step O-2). Eight e2e specs drive a
 * REAL signed bundle of an **online-only** module served from a fake CDN
 * (`debts`, `tables`, `tablet`→`tables`, `vertical-cafe`, `vertical-flowers`,
 * `vertical-grocery`, `florist-bench`→`vertical-flowers`, `fiscal-cashalot`).
 * Those modules' source moves to a private repo (O-6), so the public suite must
 * not fail a whole job on their absence: each such spec guards itself with
 *
 *   test.skip(() => !hasPrivateModule('<id>'), '<id>: private module (POS_OPENCORE §5)');
 *
 * and the Playwright `webServer` builds a private remote only where its source
 * is present (`scripts/build-private-remotes.mjs`). Where the source IS present
 * — this public repo's CI, and the private repo — all eight run unchanged.
 *
 * The check is the module's source directory, the same signal the webServer
 * build script reads, so a spec never serves a stale bundle from an earlier
 * build of a module whose source has since been removed.
 */
const MODULES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules');

export function hasPrivateModule(id: string): boolean {
  return existsSync(path.join(MODULES_DIR, id));
}
