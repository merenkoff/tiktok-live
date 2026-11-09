// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import type { MenuWallSnapshot } from '../superApi';
import { getSuperToken, superApi } from '../superApi';
import { WallBoard } from './WallBoard';
import { WallCelebration } from './WallCelebration';
import {
  CELEBRATION_MS,
  PLACES_TAB,
  TAB_ROTATE_MS,
  WALL_POLL_MS,
  allTabs,
  buildCelebrations,
  isNightHour,
  isQuietHour,
  loadWallSettings,
  nextTab,
  rankedStores,
  sameTab,
  saveWallSettings,
  storeWallKey,
  storedWallKey,
  wallStores,
  type Celebration,
  type WallSettings,
  type WallTab,
} from './menuWall';
import { playWallSound, resumeWallSound, unlockWallSound, type WallSound } from './wallSound';
import { enterWallFullscreen, keepScreenAwake } from './wallDevice';
import './MenuWall.css';

const SOUND_BY_KIND: Record<Celebration['kind'], WallSound> = {
  open: 'open',
  first: 'milestone',
  milestone: 'milestone',
  record: 'record',
  summary: 'open',
};
const CONTROLS_MS = 8_000;
const TAB_PAUSE_MS = 60_000;

/**
 * The office television (`/super/wall?key=…`, TechDocs/POS_MENU_WALL.md): a
 * fresh snapshot of today's QR-menu opens every 30 s, a celebration with the
 * place's name and table for every new one, then back to the board — the
 * places ranked, and the floor plan of every place whose tables were scanned
 * today, the tabs turning by themselves. No menu, no footer, no «Вийти»: a
 * touch shows a few settings and hides them again.
 *
 * The key in the address is read-only (Д4) and remembered on the device, so
 * the next time `/super/wall` alone is enough; a super admin with a token in
 * the tab gets the key from the API.
 */
export function MenuWallPage({ pollMs = WALL_POLL_MS }: { pollMs?: number }) {
  const [params, setParams] = useSearchParams();
  const urlKey = params.get('key');
  const [key, setKey] = useState<string | null>(() => urlKey || storedWallKey());
  const [keyProblem, setKeyProblem] = useState('');
  const [snapshot, setSnapshot] = useState<MenuWallSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [started, setStarted] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [awake, setAwake] = useState(false);
  const [settings, setSettings] = useState<WallSettings>(loadWallSettings);
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [tab, setTab] = useState<WallTab>(PLACES_TAB);
  const [tabCycle, setTabCycle] = useState(0);
  const [controls, setControls] = useState(false);

  const cursor = useRef<number | null>(null);
  const day = useRef<string | null>(null);
  const startedRef = useRef(false);
  const tabPausedUntil = useRef(0);
  const stores = useMemo(() => wallStores(snapshot), [snapshot]);
  const tabs = useMemo(() => allTabs(stores), [stores]);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    const previous = document.title;
    document.title = 'Віджет · Відкриття QR-меню';
    return () => {
      document.title = previous;
    };
  }, []);

  // The key: from the address (and remember it), else the stored one, else — for a super admin — from the session.
  useEffect(() => {
    if (urlKey) {
      storeWallKey(urlKey);
      setKey(urlKey);
    }
  }, [urlKey]);
  useEffect(() => {
    if (key || !getSuperToken()) return;
    let cancelled = false;
    superApi
      .menuWallKey()
      .then((k) => {
        if (cancelled) return;
        storeWallKey(k);
        setKey(k);
        setParams({ key: k }, { replace: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, setParams]);

  const poll = useCallback(async () => {
    if (!key) return;
    try {
      const snap = await superApi.menuWall(key, cursor.current ?? 0);
      setOffline(false);
      setKeyProblem('');
      const fresh = cursor.current === null || day.current !== snap.day;
      if (!fresh && snap.events.length && startedRef.current) {
        const items = buildCelebrations(snap, wallStores(snap));
        setQueue((q) => [...q, ...items]);
      }
      cursor.current = snap.lastId;
      day.current = snap.day;
      setSnapshot(snap);
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 403) {
        setKeyProblem('Посилання застаріло — відкрийте нове в супер-адмінці («QR-меню» → «Відкрити віджет»).');
      } else if (status === 503) {
        setKeyProblem('На сервері не задано POS_SUPER_PASSWORD — віджету нема звідки читати.');
      } else setOffline(true);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    void poll();
    const t = window.setInterval(() => void poll(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        resumeWallSound();
        void poll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, poll, pollMs]);

  // The clock and «N хв тому»
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(t);
  }, []);

  // The tabs turn by themselves (a touch on one pauses that for a minute)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (Date.now() < tabPausedUntil.current) return;
      if (tabsRef.current.length < 2) return;
      setTab((x) => nextTab(tabsRef.current, x));
      setTabCycle((n) => n + 1);
    }, TAB_ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  // A place whose tab is open fell silent for the day (its tab is gone): back to the places.
  useEffect(() => {
    if (!tabs.some((t) => sameTab(t, tab))) setTab(PLACES_TAB);
  }, [tabs, tab]);

  const quiet = settings.quietNights && isQuietHour(now);
  const soundOn = settings.sound && soundReady && !quiet;
  const current = queue[0] ?? null;
  // Changing the sound setting must not restart a celebration, hence a ref.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // The queue: a melody at the start of each celebration; after CELEBRATION_MS the next one, or the board.
  useEffect(() => {
    if (!current) return;
    if (soundOnRef.current) playWallSound(SOUND_BY_KIND[current.kind]);
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), CELEBRATION_MS);
    return () => window.clearTimeout(t);
  }, [current]);

  useEffect(() => {
    if (!controls) return;
    const t = window.setTimeout(() => setControls(false), CONTROLS_MS);
    return () => window.clearTimeout(t);
  }, [controls, settings]);

  useEffect(() => {
    document.body.classList.add('mw-mode');
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', '#0f1420');
    return () => {
      document.body.classList.remove('mw-mode');
      if (meta && prev) meta.setAttribute('content', prev);
    };
  }, []);

  const releaseAwake = useRef<() => void>(() => {});
  useEffect(() => () => releaseAwake.current(), []);

  const start = () => {
    const ok = unlockWallSound();
    setSoundReady(ok);
    if (ok && settings.sound) playWallSound('hello');
    void enterWallFullscreen();
    releaseAwake.current = keepScreenAwake(setAwake);
    startedRef.current = true;
    setStarted(true);
  };

  const update = (patch: Partial<WallSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveWallSettings(next);
  };

  const testCelebration = () => {
    const top = rankedStores(stores)[0];
    const total = snapshot?.total ?? 0;
    setQueue((q) => [
      ...q,
      {
        key: `test-${Date.now()}`,
        kind: 'open',
        headline: 'Перевірка святкування',
        storeId: top?.id ?? 0,
        name: top?.name ?? 'Тестовий заклад',
        where: 'Стіл 7 · Тераса',
        color: top?.color ?? '#2a78d6',
        added: 1,
        storeToday: (top?.today ?? 0) + 1,
        rank: top ? 1 : 0,
        totalAfter: total + 1,
      },
    ]);
    setControls(false);
  };

  if (!key) {
    return (
      <div className="mw mw--message">
        <div className="mw-card">
          <p className="mw-brand-name">LIVESHOP</p>
          <h1>Віджет «Відкриття QR-меню»</h1>
          <p>Відкрийте посилання з супер-адмінки: вкладка «QR-меню» → «Відкрити віджет».</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mw${isNightHour(now) ? ' mw--night' : ''}`} onClick={() => started && !current && setControls((v) => !v)}>
      <WallBoard
        snapshot={snapshot}
        stores={stores}
        now={now}
        tabs={tabs}
        tab={tab}
        onTab={(t) => {
          tabPausedUntil.current = Date.now() + TAB_PAUSE_MS;
          setTab(t);
          setTabCycle((n) => n + 1);
        }}
        tabCycle={tabCycle}
        awake={awake}
        offline={offline}
        soundOn={soundOn}
      />
      {keyProblem && <p className="mw-problem">{keyProblem}</p>}
      {current && <WallCelebration key={current.key} celebration={current} />}
      {controls && !current && (
        <div className="mw-controls" onClick={(e) => e.stopPropagation()} role="group" aria-label="Налаштування віджета">
          <button type="button" aria-pressed={settings.sound} onClick={() => update({ sound: !settings.sound })}>
            {settings.sound ? '♪ Звук увімкнено' : '🔇 Без звуку'}
          </button>
          <button type="button" aria-pressed={settings.quietNights} onClick={() => update({ quietNights: !settings.quietNights })}>
            🌙 Тихо вночі (22–08): {settings.quietNights ? 'так' : 'ні'}
          </button>
          <button type="button" onClick={testCelebration}>
            ✨ Перевірити
          </button>
          <button type="button" onClick={() => void enterWallFullscreen()}>
            ⛶ На весь екран
          </button>
        </div>
      )}
      {!started && (
        <div className="mw-start" onClick={(e) => e.stopPropagation()}>
          <div className="mw-card">
            <p className="mw-brand-name">LIVESHOP</p>
            <h1>Віджет «Відкриття QR-меню»</h1>
            <p>
              Натисніть «Почати»: екран не гаситиметься, а кожне нове відкриття меню віджет покаже й зіграє мелодію.
              Вкладки — заклади за популярністю і план залів кожного ресторану зі сканами столів — змінюються самі.
            </p>
            <button type="button" className="mw-start-btn" onClick={start}>
              Почати
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
