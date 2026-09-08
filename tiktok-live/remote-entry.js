import { lazy as s } from "react";
const c = "1.0.9";
async function m(e, { retries: t = 2, backoffMs: r = 400 } = {}) {
  let a;
  for (let i = 0; i <= t; i += 1)
    try {
      return await e();
    } catch (n) {
      if (a = n, i === t) break;
      await new Promise((l) => setTimeout(l, r * 2 ** i));
    }
  throw a;
}
function o(e, t) {
  return s(() => m(e, t));
}
const v = o(
  () => import("./LiveDeskPage-C4df31QU.js").then((e) => ({ default: e.LiveDeskPage }))
), d = o(
  () => import("./LiveSettingsPage-C1-ePlpg.js").then((e) => ({ default: e.LiveSettingsPage }))
), h = "tiktok-live", u = {
  id: h,
  title: "Прямий ефір",
  shells: ["web", "cashier"],
  alwaysEnabled: !0,
  // Two surfaces, not one screen shown twice. `mount` already carries the
  // chrome, the audience and the shell: the root mount is the operational desk
  // for whoever is running the till, the admin mount is owner-only by
  // construction (`renderRoutes` wraps `/admin` in `<Guard ownerOnly>`) and
  // web-only, so it holds the configuration. `returns` splits the same way.
  //
  // This cannot be done by branching inside one component: on the web both
  // `/live` and `/admin/live` report shell `'web'`.
  routes: [
    // Splat, matching the shape `placeholderDescriptor` uses for the
    // not-yet-downloaded state, so the URL is the same either way.
    { path: "/live/*", element: v },
    { path: "live", mount: "admin", element: d }
  ],
  nav: [
    // `Video` is in the host's `NAV_ICONS` allowlist (`platform/icons.ts`); an
    // unknown name would silently resolve to the `Puzzle` fallback. Keep this in
    // sync with the `icon` in the store's `module_remotes` entry, which is what
    // the desktop placeholder renders before the module is downloaded.
    {
      to: "/live",
      label: "Ефір",
      icon: "Video",
      location: "cashier-primary",
      order: 85,
      match: "/live"
    },
    // Admin sidebar reaches the settings, not the feed — the owner opens the
    // feed itself from the till rail.
    { to: "/admin/live", label: "Прямий ефір", location: "admin-sidebar", order: 60 }
  ]
}, f = { ...u, version: c };
export {
  f as manifest
};
