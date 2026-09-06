# Archived docs

Design and onboarding documents for the **original single-user / single-stream
MVP** of the TikTok LIVE automation system. They were moved here from the repo
root on 2026-09-06 because they no longer describe the running system:

- the system is now **multi-tenant** (one `Session` per `User`), not a single stream;
- there is **no `inventory` table** — availability is derived from `reservations`;
- deployment is on **Railway** (separate services for the backend, `admin/`, `pos/`),
  not a single VPS + `docker-compose`;
- the repo now also contains the independent **POS** subsystem (`src/pos/`, `pos/`).

Kept for historical/design context only. For current truth read `src/core/types.ts`
and the service files, plus `CLAUDE.md` and `README.md` at the repo root, the docs
under `TechDocs/`, and `TechDocs/NOTES.md` (tracked drift).

| File | Was |
|---|---|
| `ARCHITECTURE.md` | System design & data-flow diagrams |
| `PROJECT_SUMMARY.md` | Executive summary / feature list |
| `IMPLEMENTATION_GUIDE.md` | Detailed implementation walkthrough |
| `START_HERE.md` | Root entry point / navigation |
| `FILE_MANIFEST.md` | File-by-file listing |
| `QUICKSTART.md` | 5-minute local setup |
| `DEPLOYMENT.md` | VPS + docker-compose production setup |
| `fix-instructions.md` | One-off early TypeScript build-fix note |
