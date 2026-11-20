// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.license-notice.test.ts
//
// The notice a copy without a valid licence key shows its users
// (TechDocs/POS_LICENSING.md, phase 2G; migration 107).
//
// What is pinned here is as much what the notice is NOT as what it is: it is
// text and nothing else, it is decided by the copy's own counter, a copy with a
// valid key never counts and never warns, and nothing the author's server
// answers can do more than set a threshold, a text and a flag.

import crypto from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { createServer } from '../api.js';
import { registerPosPlugin } from '../pos/pos.plugin.js';
import { applyPosMigrations, createTestStore, dropTestStore, hasDb, type TestStore } from './helpers/pos-fixtures.js';
import { issueSuperToken, resetSuperRateLimiter } from '../pos/core/superAuth.js';
import { signLicenseToken } from '../pos/license/token.js';
import { recordActivation, resetActivationLimits } from '../pos/license/activations.service.js';
import { runLicenseHeartbeat } from '../pos/license/service.js';
import {
  DEFAULT_NOTICE_TEXT,
  DEFAULT_POLICY,
  DEFAULT_WARN_AFTER,
  NOTICE_TEXT_MAX,
  NoticePolicyError,
  cleanNoticeText,
  cleanPolicy,
  getNoticePolicy,
  guestNoticeText,
  mergePolicy,
  noteClientLaunch,
  noticeFor,
  policyForCopy,
  setCopyNotice,
  setLaunchCountingForTests,
  setNoticePolicy,
} from '../pos/license/notice.js';

describe('the notice, as arithmetic', () => {
  it('is never due for a licensed copy, whatever it counted and whatever it was told', () => {
    expect(noticeFor({ licensed: true, launches: 1_000_000, policy: null })).toBeNull();
    expect(
      noticeFor({ licensed: true, launches: 1_000_000, policy: { warn_after: 1, text: 'x', guests: true } })
    ).toBeNull();
  });

  it('is due once the launches have gone PAST the threshold — the built-in 30 when the server said nothing', () => {
    expect(DEFAULT_WARN_AFTER).toBe(30);
    expect(noticeFor({ licensed: false, launches: 0, policy: null })).toBeNull();
    expect(noticeFor({ licensed: false, launches: 30, policy: null })).toBeNull();
    expect(noticeFor({ licensed: false, launches: 31, policy: null })).toEqual({
      text: DEFAULT_NOTICE_TEXT,
      guests: false,
    });
  });

  it('follows the policy it was sent: the threshold, the text, the guests flag — and 0 switches it off', () => {
    const policy = { warn_after: 5, text: 'Зверніться до автора.', guests: true };
    expect(noticeFor({ licensed: false, launches: 5, policy })).toBeNull();
    expect(noticeFor({ licensed: false, launches: 6, policy })).toEqual({ text: 'Зверніться до автора.', guests: true });
    expect(noticeFor({ licensed: false, launches: 6, policy: { ...policy, text: null } })?.text).toBe(DEFAULT_NOTICE_TEXT);
    expect(noticeFor({ licensed: false, launches: 999, policy: { warn_after: 0, text: 'x', guests: true } })).toBeNull();
  });

  it('does not call anybody a thief by default: the built-in text says only what is true of every copy it is shown on', () => {
    expect(DEFAULT_NOTICE_TEXT).toContain('без ліцензійного ключа');
    expect(DEFAULT_NOTICE_TEXT).not.toMatch(/крад|пірат|незаконн|порушник/i);
    expect(DEFAULT_POLICY.guests).toBe(false);
  });

  it('keeps a notice text as one paragraph of plain text, cut to a length', () => {
    expect(cleanNoticeText('  Привіт,\n\tсвіте \u0000 ')).toBe('Привіт, світе');
    expect(cleanNoticeText('a'.repeat(NOTICE_TEXT_MAX + 50))).toHaveLength(NOTICE_TEXT_MAX);
    // Markup is not removed here — it is escaped by whoever draws it — but it stays text.
    expect(cleanNoticeText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    expect(cleanNoticeText('   ')).toBeNull();
    expect(cleanNoticeText(42)).toBeNull();
    expect(cleanNoticeText(null)).toBeNull();
  });

  it('takes a policy off the wire only when it is one', () => {
    expect(cleanPolicy({ warn_after: 12, text: ' Текст ', guests: true })).toEqual({ warn_after: 12, text: 'Текст', guests: true });
    expect(cleanPolicy({ warn_after: 0, text: null, guests: false })).toEqual({ warn_after: 0, text: null, guests: false });
    // Only the literal `true` shows anything to guests.
    expect(cleanPolicy({ warn_after: 12, guests: 'yes' })).toEqual({ warn_after: 12, text: null, guests: false });
    for (const bad of [null, undefined, 'x', [], {}, { warn_after: -1 }, { warn_after: 1.5 }, { warn_after: '30' }, { warn_after: 10_000_000 }]) {
      expect(cleanPolicy(bad)).toBeNull();
    }
  });

  it('lays one copy’s settings over the settings for everyone, field by field', () => {
    const base = { warn_after: 30, text: null, guests: false };
    expect(mergePolicy(base, undefined)).toEqual(base);
    expect(mergePolicy(base, { warn_after: null, text: 'Ваша копія…', guests: null })).toEqual({ warn_after: 30, text: 'Ваша копія…', guests: false });
    expect(mergePolicy(base, { warn_after: 5, text: null, guests: true })).toEqual({ warn_after: 5, text: null, guests: true });
    // 0 for one copy switches its notice off even when everyone else has one.
    expect(mergePolicy(base, { warn_after: 0, text: null, guests: null }).warn_after).toBe(0);
  });
});

describe.skipIf(!hasDb)('the notice, end to end', () => {
  let app: FastifyInstance;
  let store: TestStore;
  const PASSWORD = 'super-test-password-xyz';
  const instanceIds: string[] = [];
  let savedState: { client_launches: number; notice_policy: unknown } | null = null;
  let savedPolicy: { warn_after: number; notice_text: string | null; guests: boolean } | null = null;

  const uuid = () => {
    const id = crypto.randomUUID();
    instanceIds.push(id);
    return id;
  };
  const superHeaders = () => {
    const issued = issueSuperToken();
    if (!issued) throw new Error('super not configured');
    return { 'x-pos-super-token': issued.token };
  };
  const setCopyState = (launches: number, policy: unknown) =>
    pool.query(`UPDATE pos_license_state SET client_launches = $1, notice_policy = $2::jsonb WHERE id = 1`, [
      launches,
      policy === null ? null : JSON.stringify(policy),
    ]);
  const copyState = async () =>
    (await pool.query(`SELECT client_launches, notice_policy FROM pos_license_state WHERE id = 1`)).rows[0] as {
      client_launches: number;
      notice_policy: unknown;
    };

  beforeAll(async () => {
    process.env.POS_SUPER_PASSWORD = PASSWORD;
    await applyPosMigrations();
    app = await createServer();
    await registerPosPlugin(app);
    store = await createTestStore('licnotice');
    // The copy's row and the author's settings are one each for every test
    // file at once: keep what was there and put it back.
    savedState = await copyState();
    savedPolicy = (await pool.query(`SELECT warn_after, notice_text, guests FROM pos_license_notice_policy WHERE id = 1`)).rows[0];
  }, 60000);

  afterAll(async () => {
    setLaunchCountingForTests(false);
    if (savedState) await setCopyState(Number(savedState.client_launches), savedState.notice_policy ?? null);
    if (savedPolicy) {
      await pool.query(`UPDATE pos_license_notice_policy SET warn_after = $1, notice_text = $2, guests = $3 WHERE id = 1`, [
        savedPolicy.warn_after,
        savedPolicy.notice_text,
        savedPolicy.guests,
      ]);
    }
    if (instanceIds.length) {
      await pool.query(`DELETE FROM pos_license_activations WHERE instance_id = ANY($1::uuid[])`, [instanceIds]);
      await pool.query(`DELETE FROM pos_license_copy_notices WHERE instance_id = ANY($1::uuid[])`, [instanceIds]);
    }
    if (store) await dropTestStore(store.storeId);
    await app?.close();
    delete process.env.POS_SUPER_PASSWORD;
    await pool.end();
  });

  beforeEach(() => {
    resetActivationLimits();
    resetSuperRateLimiter();
  });

  afterEach(() => {
    setLaunchCountingForTests(false);
    vi.unstubAllGlobals();
  });

  const ownerLogin = () =>
    app.inject({
      method: 'POST',
      url: '/api/pos/auth/owner/login',
      payload: { login: store.ownerLogin, password: store.ownerPassword, store_slug: store.slug },
    });

  describe('the copy', () => {
    it('counts a client launch only when asked to under vitest, so the suite’s thousands of sign-ins move nothing', async () => {
      await setCopyState(0, null);
      expect(await noteClientLaunch()).toBeNull();
      expect((await ownerLogin()).json().store.license_notice).toBeNull();
      expect(Number((await copyState()).client_launches)).toBe(0);
    });

    it('counts every sign-in and every restored session, says nothing up to the threshold and the built-in text past it', async () => {
      setLaunchCountingForTests(true);
      await setCopyState(DEFAULT_WARN_AFTER - 2, null);

      // 29th and 30th launch: nothing yet.
      expect((await ownerLogin()).json().store.license_notice).toBeNull();
      const me = await app.inject({ method: 'GET', url: '/api/pos/me', headers: { authorization: `Bearer ${store.sellerToken}` } });
      expect(me.statusCode).toBe(200);
      expect(me.json().store.license_notice).toBeNull();
      expect(Number((await copyState()).client_launches)).toBe(DEFAULT_WARN_AFTER);

      // 31st: every role is told, in the session answer the till keeps for offline.
      const pin = await app.inject({
        method: 'POST',
        url: '/api/pos/auth/staff/pin',
        payload: { store_slug: store.slug, pin: store.sellerPin },
      });
      expect(pin.statusCode).toBe(200);
      expect(pin.json().staff.role).toBe('seller');
      expect(pin.json().store.license_notice).toEqual({ text: DEFAULT_NOTICE_TEXT });
      // The sign-in itself is exactly what it was: the notice keeps nobody out.
      expect(pin.json().token).toEqual(expect.any(String));
    });

    it('shows the text and honours the threshold the author’s server last sent — and a threshold of 0 silences it', async () => {
      setLaunchCountingForTests(true);
      await setCopyState(3, { warn_after: 3, text: 'Ця копія належить «Ромашці»? Напишіть нам.', guests: false });
      expect((await ownerLogin()).json().store.license_notice).toEqual({ text: 'Ця копія належить «Ромашці»? Напишіть нам.' });

      await setCopyState(500, { warn_after: 0, text: 'x', guests: true });
      expect((await ownerLogin()).json().store.license_notice).toBeNull();
    });

    it('ignores a policy row that is not one, and falls back to the built-in threshold and text', async () => {
      setLaunchCountingForTests(true);
      await setCopyState(40, { warn_after: 'soon', text: 12 });
      expect((await ownerLogin()).json().store.license_notice).toEqual({ text: DEFAULT_NOTICE_TEXT });
    });

    it('tells guests only when the author switched that on for it — and reading the menu is not a launch', async () => {
      setLaunchCountingForTests(true);
      await setCopyState(40, { warn_after: 30, text: 'Для гостей теж.', guests: false });
      expect(await guestNoticeText()).toBeNull();

      await setCopyState(40, { warn_after: 30, text: 'Для гостей теж.', guests: true });
      setLaunchCountingForTests(true); // drops the 15 s cache
      expect(await guestNoticeText()).toBe('Для гостей теж.');
      expect(Number((await copyState()).client_launches)).toBe(40);

      // Not yet past the threshold: guests read nothing either.
      await setCopyState(30, { warn_after: 30, text: 'Для гостей теж.', guests: true });
      setLaunchCountingForTests(true);
      expect(await guestNoticeText()).toBeNull();
    });

    it('the heartbeat reports the counter and keeps the settings the server answers with — settings, nothing else', async () => {
      await setCopyState(17, null);
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            policy: { warn_after: 20, text: '  Ваш текст\nз двох рядків ', guests: true, disable: true, run: 'rm -rf /' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await runLicenseHeartbeat();
      expect(result.server_ok).toBe(true);

      const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body));
      // No key in the test environment: the copy says how many launches it counted.
      expect(sent.client_launches).toBe(17);
      expect(Object.keys(sent).sort()).toEqual(['client_launches', 'dev', 'instance_id', 'pos_api_version', 'public_base_url', 'token']);

      // What is kept is the three settings, cleaned; anything else in the answer is dropped.
      expect((await copyState()).notice_policy).toEqual({ warn_after: 20, text: 'Ваш текст з двох рядків', guests: true });
    });

    it('keeps what it had when the server answers without settings, or with something that is not settings', async () => {
      await setCopyState(1, { warn_after: 9, text: 'було', guests: false });
      for (const body of [{ ok: true }, { ok: true, policy: null }, { ok: true, policy: { warn_after: -5 } }, 'not json at all']) {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 }))
        );
        await runLicenseHeartbeat();
        expect((await copyState()).notice_policy).toEqual({ warn_after: 9, text: 'було', guests: false });
      }
    });
  });

  describe('the author', () => {
    it('answers a ping without a valid key with the settings that apply to that copy, and a licensed one with none', async () => {
      await setNoticePolicy({ warn_after: 30, text: null, guests: false });
      const id = uuid();
      const keyless = await app.inject({
        method: 'POST',
        url: '/api/license/activation',
        payload: { instance_id: id, client_launches: 24, dev: true },
      });
      expect(keyless.statusCode).toBe(200);
      expect(keyless.json()).toEqual({ ok: true, policy: { warn_after: 30, text: null, guests: false } });

      // One copy gets its own text and is shown to guests; everyone else is untouched.
      await setCopyNotice(id, { warn_after: null, text: 'Заклад «Х»: зверніться до автора програми.', guests: true });
      const again = await app.inject({ method: 'POST', url: '/api/license/activation', payload: { instance_id: id } });
      expect(again.json().policy).toEqual({ warn_after: 30, text: 'Заклад «Х»: зверніться до автора програми.', guests: true });
      expect(await policyForCopy(uuid())).toEqual({ warn_after: 30, text: null, guests: false });

      // A verified licence: no settings at all — such a copy never shows the notice.
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
      const kid = crypto.createHash('sha256').update(rawPub).digest('hex').slice(0, 16);
      const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
      const token = signLicenseToken({ kid, licensee: 'Licensed Ltd' }, priv);
      const licensed = await recordActivation(
        { token, instance_id: uuid(), client_launches: 999 },
        { keys: { [kid]: rawPub.toString('base64') } }
      );
      expect(licensed.verified).toBe(true);
    });

    it('keeps the counter a copy without a key reports, and shows it with the copy’s own settings', async () => {
      const id = uuid();
      await recordActivation({ instance_id: id, client_launches: 24 });
      await recordActivation({ instance_id: id, client_launches: 27 });
      // Junk is «not said», and does not wipe what was said before.
      await recordActivation({ instance_id: id, client_launches: -3 });
      await recordActivation({ instance_id: id, client_launches: 'many' });
      await setCopyNotice(id, { warn_after: 40, text: null, guests: null });

      const detail = await app.inject({ method: 'GET', url: '/api/pos/super/licenses/none', headers: superHeaders() });
      const inst = detail.json().instances.find((i: { instance_id: string }) => i.instance_id === id);
      expect(inst.client_launches).toBe(27);
      expect(inst.notice).toEqual({ warn_after: 40, text: null, guests: null });

      // All three back to «as for everyone»: the copy has no settings of its own again.
      const cleared = await app.inject({
        method: 'PUT',
        url: `/api/pos/super/license-copies/${id}/notice`,
        headers: superHeaders(),
        payload: { warn_after: null, text: '', guests: null },
      });
      expect(cleared.json()).toEqual({ notice: null });
      expect((await pool.query(`SELECT 1 FROM pos_license_copy_notices WHERE instance_id = $1`, [id])).rowCount).toBe(0);
    });

    it('the super admin reads and sets the settings for everyone; a bad field refuses the whole write', async () => {
      const headers = superHeaders();
      const saved = await app.inject({
        method: 'PUT',
        url: '/api/pos/super/license-notice',
        headers,
        payload: { warn_after: 45, text: '  Свій текст  ', guests: true },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual({ policy: { warn_after: 45, text: 'Свій текст', guests: true } });

      const read = await app.inject({ method: 'GET', url: '/api/pos/super/license-notice', headers });
      expect(read.json()).toEqual({
        policy: { warn_after: 45, text: 'Свій текст', guests: true },
        defaults: { warn_after: DEFAULT_WARN_AFTER, text: DEFAULT_NOTICE_TEXT, text_max: NOTICE_TEXT_MAX },
      });

      for (const payload of [
        { warn_after: -1, text: null, guests: false },
        { warn_after: 2.5, text: null, guests: false },
        { warn_after: 30, text: 'x'.repeat(NOTICE_TEXT_MAX + 1), guests: false },
        { warn_after: 30, text: null, guests: 'yes' },
        { text: null, guests: false },
      ]) {
        const refused = await app.inject({ method: 'PUT', url: '/api/pos/super/license-notice', headers, payload });
        expect(refused.statusCode).toBe(400);
        expect(refused.json().error).toEqual(expect.any(String));
      }
      // Nothing of the refused writes stuck.
      expect(await getNoticePolicy()).toEqual({ warn_after: 45, text: 'Свій текст', guests: true });

      await expect(setCopyNotice('not-a-uuid', { text: 'x' })).rejects.toBeInstanceOf(NoticePolicyError);
      await setNoticePolicy({ warn_after: 30, text: null, guests: false });
    });

    it('refuses the settings to anybody without the super token', async () => {
      for (const [method, url] of [
        ['GET', '/api/pos/super/license-notice'],
        ['PUT', '/api/pos/super/license-notice'],
        ['PUT', `/api/pos/super/license-copies/${crypto.randomUUID()}/notice`],
      ] as const) {
        const anonymous = await app.inject({ method, url, payload: method === 'PUT' ? {} : undefined });
        expect(anonymous.statusCode).toBe(401);
        // An owner of a store is not the author of the software.
        const owner = await app.inject({ method, url, headers: { authorization: `Bearer ${store.ownerToken}` }, payload: method === 'PUT' ? {} : undefined });
        expect(owner.statusCode).toBe(401);
      }
    });
  });
});
