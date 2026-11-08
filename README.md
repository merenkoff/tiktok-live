# The Live Shop

**The Live Shop** is a platform for sellers who run their business on TikTok LIVE. It ships two products on one shared backend: an automation system that runs the live sale end-to-end, and a point-of-sale app for the seller's physical counter — including an offline-capable desktop till for shops with unreliable internet.

## TikTok LIVE, automated

Point it at a seller's stream and it becomes the operating system for the sale. It reads product-code comments as they're typed — in English, Ukrainian, or Russian — holds the item for the buyer with a short reservation, hands the conversation off to a Telegram bot to collect delivery details, and generates a Nova Poshta shipping label the moment the seller confirms payment. The system is multi-tenant: every seller runs their own independent live session, so one deployment serves many stores at once, and a live admin dashboard shows each stream as it happens.

## Point of Sale, online or offline

The same backend runs a point-of-sale system for the seller's physical store: products and variants, stock, staff, discounts, customers, barcode lookup, and receipts, plus QR-code payments at the till. Its cashier app is a native desktop kiosk built to keep selling through a dropped connection — it snapshots the catalog locally, checks staff PINs without a server round-trip, queues sales while offline, and syncs everything back the moment the network returns. A companion web app covers store administration and reporting from a browser.

## How it's put together

A single Fastify + PostgreSQL backend serves both products over REST and WebSockets. Each side has its own React/Vite front end — one for LIVE session control, one for the point of sale — and the point-of-sale front end also ships as a native desktop app for the offline till. All three are deployed independently and share one database.

## Status

Both products are in active production use, with development ongoing on each. For the technical documentation, see [`TechDocs/`](TechDocs); for a Russian-language operations guide to running a live sale, see [ИНСТРУКЦИЯ.md](ИНСТРУКЦИЯ.md).

## License

**OwnNet Source License 1.1** (Source Available) — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

This is a source-available license, **not** an OSI Open Source license:

- Free to use, study, modify, and share for any **non-commercial** purpose, and
  in a business whose annual gross revenue is under **USD $100,000**.
- **Commercial Use** — offering the software's functionality as a paid
  hosted/SaaS service, or selling it as a product — requires a separate written
  agreement. Contact **mer.sergei@gmail.com**.
- **No Closed Systems**: no one may build remote kill switches, undocumented
  data lock-in, anti-repair measures, or undisclosed user tracking on top of
  this code.
- Derivative works stay under this license (ShareAlike) and must credit:
  *"Based on The Live Shop by Serhii Merenkov / Technologies LLC (own-net.com)"*.

Contributions are accepted under the inbound terms in Section 6 of the LICENSE
(you keep your copyright; the Steward gets the right to relicense, including
commercially).

### Licence activation (disclosed)

If you set `LICENSE_KEY`, the backend verifies that signed token locally and, on
boot and once a day, sends a **licence-compliance** ping to `LICENSE_SERVER_URL`
(default `https://the-live.shop`) carrying only the token, a random per-install
id, the POS API version and `PUBLIC_BASE_URL` — **no user activity, catalogue or
personal data**. It is best-effort and never disables anything: a missing,
invalid or expired key, or an unreachable server, only changes what the
owner-only `GET /api/pos/license/status` reports. This is a licence-compliance
check, explicitly **not** a remote kill switch or undisclosed tracking (OwnNet
1.1 §1.150). Leave `LICENSE_KEY` unset and the POS runs exactly as before, with
status `unlicensed`. Details: [`TechDocs/POS_LICENSING.md`](TechDocs/POS_LICENSING.md).

The official desktop cashier (POS 2.8.1+), only when the user presses «Встановити
оновлення» (in-place update on macOS and Linux AppImage), adds one header to its
update check at `the-live.shop`: `X-Delivery-Token`, a signed token derived from the
deployment's licence (a licence fingerprint, a scope and an expiry — never the
licence key itself) that the deployment's server already holds. It carries **no
user activity, catalogue or personal data**, and the author's server may refuse an
update because of it — never a running copy.

---

**Made with ❤️ for TikTok LIVE sellers**
