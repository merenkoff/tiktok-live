// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe's «Кухня» (РК4): the link's timers, the cafe's cards the kitchen
// cooks, and «Імпорт меню кухні» — a kitchen dish becomes the cafe's card at
// the price the owner types here (§5.1: the price in the park is the cafe's,
// and the kitchen's never leaves the kitchen).

import { useEffect, useMemo, useState } from 'react';
import { SectionHead } from '@pos/platform/ui';
import { formatUah, uahInputToCents } from '@pos/platform';
import { serverMessage } from '../lib/hostPlatform';
import {
  importDishes,
  listDishes,
  listItems,
  saveLink,
  unmark,
  type CafeLink,
  type KitchenDish,
  type KitchenStatus,
  type LinkItem,
} from './settingsApi';
import { dishTime } from './dishTime';

const DEFAULT_AUTO_CONFIRM = 40;

function dishText(name: string, label: string): string {
  return label ? `${name} (${label})` : name;
}

function intOrNull(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== '' && Number.isInteger(value) ? value : null;
}

export function CafeKitchenSection({ link, kitchen }: { link: CafeLink; kitchen: KitchenStatus }): JSX.Element {
  const [saved, setSaved] = useState<CafeLink>(link);
  const [title, setTitle] = useState(link.kitchen_title);
  const [phone, setPhone] = useState(link.kitchen_phone ?? '');
  const [transit, setTransit] = useState(String(link.transit_minutes));
  const [answer, setAnswer] = useState(String(link.answer_seconds));
  // In seconds, as stored: a value the super-admin set (90 s) is not rounded
  // to whole minutes by a save that only changed the phone.
  const [ttl, setTtl] = useState(String(link.quote_ttl_seconds));
  const [autoOn, setAutoOn] = useState(link.auto_confirm_max_min != null);
  const [autoMax, setAutoMax] = useState(String(link.auto_confirm_max_min ?? DEFAULT_AUTO_CONFIRM));
  const [settingsNote, setSettingsNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [items, setItems] = useState<LinkItem[] | null>(null);
  const [dishes, setDishes] = useState<KitchenDish[] | null>(null);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [menuNote, setMenuNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyMenu, setBusyMenu] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([listItems(), listDishes()])
      .then(([i, d]) => {
        if (!live) return;
        setItems(i);
        setDishes(d);
      })
      .catch((e) => {
        if (live) setMenuNote({ ok: false, text: serverMessage(e, 'Не вдалося прочитати страви кухні') });
      });
    return () => {
      live = false;
    };
  }, []);

  const marked = useMemo(() => new Set((items ?? []).map((i) => i.kitchen_variant_id)), [items]);
  const notYet = useMemo(() => (dishes ?? []).filter((d) => !marked.has(d.variant_id)), [dishes, marked]);

  async function saveSettings() {
    const body = {
      kitchen_title: title.trim(),
      kitchen_phone: phone.trim() || null,
      transit_minutes: intOrNull(transit),
      answer_seconds: intOrNull(answer),
      quote_ttl_seconds: intOrNull(ttl),
      auto_confirm_max_min: autoOn ? intOrNull(autoMax) : null,
    };
    if (!body.kitchen_title) return setSettingsNote({ ok: false, text: 'Вкажіть назву кухні' });
    if (body.transit_minutes == null || body.answer_seconds == null || body.quote_ttl_seconds == null) {
      return setSettingsNote({ ok: false, text: 'Час — цілими числами' });
    }
    if (autoOn && body.auto_confirm_max_min == null) {
      return setSettingsNote({ ok: false, text: 'Вкажіть поріг автопідтвердження в хвилинах' });
    }
    setSavingSettings(true);
    setSettingsNote(null);
    try {
      const next = await saveLink(body as Parameters<typeof saveLink>[0]);
      setSaved(next);
      setSettingsNote({ ok: true, text: 'Збережено' });
    } catch (e) {
      setSettingsNote({ ok: false, text: serverMessage(e, 'Не вдалося зберегти') });
    } finally {
      setSavingSettings(false);
    }
  }

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runImport() {
    const chosen = notYet.filter((d) => picked.has(d.variant_id));
    if (chosen.length === 0) return setMenuNote({ ok: false, text: 'Позначте страви, які продаватиме кафе' });
    const body = chosen.map((d) => ({ kitchen_variant_id: d.variant_id, price_cents: uahInputToCents(prices[d.variant_id] ?? '') }));
    const unpriced = chosen.filter((_, i) => body[i].price_cents < 1);
    if (unpriced.length > 0) {
      return setMenuNote({ ok: false, text: `Вкажіть ціну кафе: ${unpriced.map((d) => dishText(d.name, d.label)).join(', ')}` });
    }
    setBusyMenu(true);
    setMenuNote(null);
    try {
      const res = await importDishes(body);
      setItems(res.items);
      setPicked(new Set());
      const kept = res.kept_prices ?? [];
      setMenuNote({
        ok: true,
        text:
          `Додано в меню кафе: ${res.linked}${res.created < res.linked ? ` (з них ${res.linked - res.created} — уже були картки з такою назвою)` : ''}` +
          (kept.length > 0
            ? `. Ціну не змінено — у картці лишилась своя: ${kept.map((k) => `${k.name} — ${formatUah(k.price_cents)}`).join(', ')}`
            : ''),
      });
    } catch (e) {
      setMenuNote({ ok: false, text: serverMessage(e, 'Не вдалося додати страви') });
      // The list may have changed under the page (another tab, another owner).
      listItems()
        .then(setItems)
        .catch(() => undefined);
    } finally {
      setBusyMenu(false);
    }
  }

  async function remove(cafeVariantId: number) {
    setBusyMenu(true);
    setMenuNote(null);
    try {
      setItems(await unmark(cafeVariantId));
    } catch (e) {
      setMenuNote({ ok: false, text: serverMessage(e, 'Не вдалося прибрати позначку') });
    } finally {
      setBusyMenu(false);
    }
  }

  return (
    <section aria-label="Кухня" className="space-y-6">
      <div>
        <SectionHead title={`Кухня: ${saved.kitchen_title}`} />
        {saved.status === 'paused' && (
          <p className="mt-2 text-[15px] text-sq-danger">
            Зв’язку призупинено адміністратором — каса не питає кухню.
          </p>
        )}
        {saved.status === 'active' && !kitchen.accepting && (
          <p className="mt-2 text-[15px] text-sq-danger">Кухня зараз на паузі й нових запитів не приймає.</p>
        )}
      </div>

      <div className="space-y-3">
        <SectionHead title="Налаштування" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px] text-sq-secondary">
            Назва кухні для касира
            <input className="sq-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-[13px] text-sq-secondary">
            Телефон кухні
            <input className="sq-input mt-1 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block text-[13px] text-sq-secondary">
            Скільки чекати відповіді кухні, с
            <input className="sq-input mt-1 w-full" inputMode="numeric" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <span className="mt-0.5 block text-sq-muted">Після цього каса пропонує подзвонити. 15–600.</span>
          </label>
          <label className="block text-[13px] text-sq-secondary">
            Дорога з кухні, хв
            <input className="sq-input mt-1 w-full" inputMode="numeric" value={transit} onChange={(e) => setTransit(e.target.value)} />
          </label>
          <label className="block text-[13px] text-sq-secondary">
            Скільки діє названий час, с
            <input className="sq-input mt-1 w-full" inputMode="numeric" value={ttl} onChange={(e) => setTtl(e.target.value)} />
            <span className="mt-0.5 block text-sq-muted">Поки гість вирішує. 30–1800 (180 — три хвилини).</span>
          </label>
          <div className="text-[13px] text-sq-secondary">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
              Автопідтвердження
            </label>
            {autoOn && (
              <label className="mt-1 block">
                Якщо кухня встигає за, хв
                <input
                  className="sq-input mt-1 w-full"
                  inputMode="numeric"
                  aria-label="Поріг автопідтвердження, хв"
                  value={autoMax}
                  onChange={(e) => setAutoMax(e.target.value)}
                />
              </label>
            )}
            <span className="mt-0.5 block text-sq-muted">
              {autoOn
                ? 'Час до порогу каса називає гостю сама, довший чекає відповіді кухні.'
                : 'Кожен запит чекає відповіді кухні.'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="sq-btn-primary" disabled={savingSettings} onClick={() => void saveSettings()}>
            {savingSettings ? 'Зберігаю…' : 'Зберегти'}
          </button>
          {settingsNote && (
            <span className={`text-[13px] ${settingsNote.ok ? 'text-sq-success' : 'text-sq-danger'}`}>{settingsNote.text}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <SectionHead title="Готує кухня" count={items?.length} />
        {items === null && !menuNote && <p className="text-[15px] text-sq-muted">Завантажую…</p>}
        {items?.length === 0 && (
          <p className="text-[15px] text-sq-secondary">Поки жодна страва кафе не готується на кухні. Додайте їх нижче.</p>
        )}
        <ul className="divide-y divide-sq-divider" data-testid="rk-marked">
          {(items ?? []).map((item) => (
            <li key={item.cafe_variant_id} className="flex items-center justify-between gap-3 py-2 text-[15px]">
              <span>
                {dishText(item.cafe_name, item.cafe_label)}
                <span className="text-sq-muted">
                  {' '}
                  ← {dishText(item.kitchen_name, item.kitchen_label)}
                  {dishTime(item) ? ` · ${dishTime(item)}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="sq-btn-quiet"
                disabled={busyMenu}
                aria-label={`Прибрати ${dishText(item.cafe_name, item.cafe_label)}`}
                onClick={() => void remove(item.cafe_variant_id)}
              >
                Прибрати
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <SectionHead title="Імпорт меню кухні" count={dishes ? notYet.length : undefined} />
        <p className="text-[13px] text-sq-secondary">
          Позначена страва стане карткою в каталозі кафе з вашою ціною й одразу «готується на кухні». Картку з такою
          самою назвою кафе використає замість нової.
        </p>
        {dishes && notYet.length === 0 && <p className="text-[15px] text-sq-secondary">Усі страви кухні вже в меню кафе.</p>}
        <ul className="divide-y divide-sq-divider" data-testid="rk-import">
          {notYet.map((dish) => {
            const name = dishText(dish.name, dish.label);
            return (
              <li key={dish.variant_id} className="flex flex-wrap items-center gap-3 py-2 text-[15px]">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="checkbox" checked={picked.has(dish.variant_id)} onChange={() => toggle(dish.variant_id)} />
                  <span>
                    {name}
                    {dishTime(dish) && <span className="text-sq-muted"> · {dishTime(dish)}</span>}
                  </span>
                </label>
                <input
                  className="sq-input w-28"
                  inputMode="decimal"
                  placeholder="Ціна, ₴"
                  aria-label={`Ціна кафе: ${name}`}
                  value={prices[dish.variant_id] ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPrices((p) => ({ ...p, [dish.variant_id]: value }));
                    if (value.trim()) setPicked((prev) => new Set(prev).add(dish.variant_id));
                  }}
                />
              </li>
            );
          })}
        </ul>
        {notYet.length > 0 && (
          <button type="button" className="sq-btn-primary" disabled={busyMenu || picked.size === 0} onClick={() => void runImport()}>
            {busyMenu ? 'Додаю…' : `Додати в меню кафе${picked.size ? ` (${picked.size})` : ''}`}
          </button>
        )}
        {menuNote && (
          <p className={`text-[13px] ${menuNote.ok ? 'text-sq-success' : 'text-sq-danger'}`}>{menuNote.text}</p>
        )}
      </div>
    </section>
  );
}
