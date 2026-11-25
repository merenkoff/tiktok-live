// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Віддалена кухня» on a store's card (TechDocs/POS_REMOTE_KITCHEN.md §11,
// РК4): who this cafe asks, or which cafes ask this kitchen, and the one
// button that links two stores — the link the super-admin alone writes. Only a
// café cooks, so the block shows on a café's card only; the server refuses any
// other pair by name.

import { useCallback, useEffect, useState } from 'react';
import { superApi, superErrorText, type SuperKitchenLink, type SuperStoreRow } from './superApi';

type Role = 'cafe' | 'kitchen';

const STATUS_TEXT: Record<SuperKitchenLink['status'], string> = {
  active: 'працює',
  paused: 'призупинено',
  revoked: 'відкликано',
};

const field = 'rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs';
const button = 'rounded-sq border border-sq-divider px-2.5 py-1 text-xs disabled:opacity-50';

export function RemoteKitchenLinks({ store }: { store: SuperStoreRow }) {
  // A store that does not cook asks nothing of the server.
  return store.vertical === 'cafe' ? <LinksBlock store={store} /> : null;
}

function LinksBlock({ store }: { store: SuperStoreRow }) {
  const [links, setLinks] = useState<SuperKitchenLink[] | null>(null);
  const [others, setOthers] = useState<SuperStoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);

  const [role, setRole] = useState<Role>('cafe');
  const [otherId, setOtherId] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [transit, setTransit] = useState('10');

  const reload = useCallback(async () => {
    try {
      setLinks(await superApi.remoteKitchenLinks(store.id));
    } catch (err) {
      setError(superErrorText(err));
    }
  }, [store.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let live = true;
    superApi
      .listStores()
      .then((rows) => {
        if (live) setOthers(rows.filter((s) => s.id !== store.id && s.vertical === 'cafe'));
      })
      .catch(() => {
        if (live) setOthers([]);
      });
    return () => {
      live = false;
    };
  }, [store.id]);

  // The cashier sees the kitchen by this name; the kitchen store's own name is
  // the obvious start, and the field may stay empty for it.
  const kitchenStore = role === 'cafe' ? others?.find((s) => String(s.id) === otherId) : store;
  const defaultTitle = kitchenStore ? `Кухня ${kitchenStore.name}` : '';

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await reload();
    } catch (err) {
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  function create() {
    const other = Number(otherId);
    const minutes = Number(transit);
    if (!other) {
      setError(role === 'cafe' ? 'Оберіть кухню' : 'Оберіть кафе');
      return;
    }
    const kitchenTitle = title.trim() || defaultTitle;
    if (!kitchenTitle) {
      setError('Вкажіть назву кухні, як її бачитиме касир');
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
      setError('Дорога: від 0 до 240 хвилин');
      return;
    }
    void run(async () => {
      await superApi.createRemoteKitchenLink({
        cafe_store_id: role === 'cafe' ? store.id : other,
        kitchen_store_id: role === 'cafe' ? other : store.id,
        kitchen_title: kitchenTitle,
        kitchen_phone: phone.trim() || null,
        transit_minutes: minutes,
      });
      setOtherId('');
      setTitle('');
    });
  }

  return (
    <section className="space-y-2 border-t border-sq-divider pt-4" aria-label="Віддалена кухня">
      <p className="sq-section-label">Віддалена кухня</p>
      <p className="text-xs text-sq-secondary">
        Кафе питає кухню іншого магазину, коли буде страва, і продає її своїм чеком. Модуль `remote-kitchen` у
        «Онлайн-модулях» вмикається окремо, для обох магазинів.
      </p>

      {links === null && !error && <p className="text-xs text-sq-secondary">Завантажую…</p>}
      {links?.length === 0 && <p className="text-xs text-sq-secondary">Зв’язок немає.</p>}
      {links && links.length > 0 && (
        <ul className="space-y-1.5" data-testid="rk-links">
          {links.map((link) => {
            const asCafe = link.cafe_store_id === store.id;
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-sq-text">
                  {asCafe ? `Кухня: ${link.kitchen_name}` : `Кафе: ${link.cafe_name}`}
                  {' · '}«{link.kitchen_title}» · дорога {link.transit_minutes} хв
                </span>
                <span className={link.status === 'active' ? 'text-emerald-700' : 'text-sq-secondary'}>
                  {STATUS_TEXT[link.status]}
                </span>
                {link.status === 'active' && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => void run(() => superApi.setRemoteKitchenLinkStatus(link.id, 'paused'))}
                  >
                    Призупинити
                  </button>
                )}
                {link.status === 'paused' && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => void run(() => superApi.setRemoteKitchenLinkStatus(link.id, 'active'))}
                  >
                    Відновити
                  </button>
                )}
                {link.status !== 'revoked' &&
                  (confirmRevoke === link.id ? (
                    <>
                      <span className="text-rose-700">Кафе більше не зможе питати цю кухню.</span>
                      <button
                        type="button"
                        className={`${button} text-rose-700`}
                        disabled={busy}
                        onClick={() => {
                          setConfirmRevoke(null);
                          void run(() => superApi.setRemoteKitchenLinkStatus(link.id, 'revoked'));
                        }}
                      >
                        Так, відкликати
                      </button>
                      <button type="button" className={button} onClick={() => setConfirmRevoke(null)}>
                        Ні
                      </button>
                    </>
                  ) : (
                    <button type="button" className={button} disabled={busy} onClick={() => setConfirmRevoke(link.id)}>
                      Відкликати
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 rounded-sq border border-dashed border-sq-divider p-3">
        <p className="text-xs text-sq-secondary">Нова зв’язка</p>
        <div className="flex flex-wrap gap-2 text-xs" role="radiogroup" aria-label="Цей магазин">
          <label className="flex items-center gap-1">
            <input type="radio" checked={role === 'cafe'} onChange={() => setRole('cafe')} />
            цей магазин — кафе, питає кухню
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={role === 'kitchen'} onChange={() => setRole('kitchen')} />
            цей магазин — кухня для кафе
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            aria-label={role === 'cafe' ? 'Кухня' : 'Кафе'}
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            className={field}
          >
            <option value="">{role === 'cafe' ? 'Оберіть кухню…' : 'Оберіть кафе…'}</option>
            {(others ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
          <input
            aria-label="Назва кухні для касира"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle || 'Назва кухні для касира'}
            className={field}
          />
          <input
            aria-label="Телефон кухні"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Телефон кухні"
            className={field}
          />
          <label className="flex items-center gap-2 text-xs text-sq-secondary">
            Дорога, хв
            <input
              aria-label="Дорога, хв"
              value={transit}
              onChange={(e) => setTransit(e.target.value)}
              inputMode="numeric"
              className={`${field} w-20`}
            />
          </label>
        </div>
        <button type="button" className={button} disabled={busy} onClick={create}>
          {busy ? 'Зв’язую…' : 'Зв’язати'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </section>
  );
}
