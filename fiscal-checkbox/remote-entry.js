import { lazy as n } from "react";
const s = "1.1.0";
async function h(e, { retries: t = 2, backoffMs: c = 400 } = {}) {
  let o;
  for (let a = 0; a <= t; a += 1)
    try {
      return await e();
    } catch (r) {
      if (o = r, a === t) break;
      await new Promise((l) => setTimeout(l, c * 2 ** a));
    }
  throw o;
}
function i(e, t) {
  return n(() => h(e, t));
}
const m = i(
  () => import("./CheckboxTillPage-Bbm_wJTD.js").then((e) => ({ default: e.CheckboxTillPage }))
), f = i(
  () => import("./CheckboxAdminPage-DIOkYiu4.js").then((e) => ({ default: e.CheckboxAdminPage }))
), b = "fiscal-checkbox", d = {
  id: b,
  title: "Фіскалізація (Checkbox)",
  shells: ["web", "cashier"],
  alwaysEnabled: !0,
  routes: [
    { path: "/fiscal/*", element: m },
    { path: "fiscal", mount: "admin", element: f }
  ],
  nav: [
    {
      to: "/fiscal",
      label: "Зміна",
      icon: "Receipt",
      location: "cashier-primary",
      order: 90,
      match: "/fiscal"
    },
    { to: "/admin/fiscal", label: "Фіскалізація", location: "admin-sidebar", order: 65 }
  ]
}, p = { ...d, version: s };
export {
  p as manifest
};
