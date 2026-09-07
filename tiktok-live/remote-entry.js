import { lazy as s } from "react";
const c = "1.0.7";
async function m(e, { retries: t = 2, backoffMs: r = 400 } = {}) {
  let o;
  for (let i = 0; i <= t; i += 1)
    try {
      return await e();
    } catch (n) {
      if (o = n, i === t) break;
      await new Promise((l) => setTimeout(l, r * 2 ** i));
    }
  throw o;
}
function d(e, t) {
  return s(() => m(e, t));
}
const a = d(
  () => import("./LiveDeskPage-BqpLHeb-.js").then((e) => ({ default: e.LiveDeskPage }))
), h = "tiktok-live", v = {
  id: h,
  title: "Прямий ефір",
  shells: ["web", "cashier"],
  alwaysEnabled: !0,
  routes: [
    // Splat, matching the shape `placeholderDescriptor` uses for the
    // not-yet-downloaded state, so the URL is the same either way.
    { path: "/live/*", element: a },
    { path: "live", mount: "admin", element: a }
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
    { to: "/admin/live", label: "Прямий ефір", location: "admin-sidebar", order: 60 }
  ]
}, p = { ...v, version: c };
export {
  p as manifest
};
