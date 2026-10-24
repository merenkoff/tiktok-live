// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.cashalot.client.test.ts
//
// Cashalot's WEB API transport against a mocked fetch: the wire shape of a
// command, both error forms Cashalot's developers described
// (TechDocs/prro/cashalot/sources/support-answers.md, answers 6 and 8), a
// credential-free GetCheck (answer 3), and that a saved request never keeps a key.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CashalotApiError,
  credentialFields,
  getCheck,
  maskCredentials,
  openShift,
  parseError,
  registerCheck,
  registrarState,
  type CashalotCreds,
} from '../pos/fiscal/providers/cashalot/client.js';

const creds: CashalotCreds = { keyGuid: 'guid-secret-7f', keyPin: '9911', numFiscal: '4000000004' };

function stubFetch(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => vi.unstubAllGlobals());

describe('Cashalot transport', () => {
  it('posts the command with the credentials and the fiscal number as a number', async () => {
    const fetchMock = stubFetch(200, JSON.stringify({ ShiftState: 0 }));
    const state = await registrarState(creds, { includeTaxObject: true, signal: AbortSignal.timeout(1000) });
    expect(state.ShiftState).toBe(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fsapi.cashalot.org.ua/');
    expect(init.method).toBe('POST');
    expect(sentBody(fetchMock)).toEqual({
      Command: 'TransactionsRegistrarState',
      KeyGuid: 'guid-secret-7f',
      KeyPin: '9911',
      NumFiscal: 4000000004,
      IncludeTaxObject: true,
    });
  });

  it('opens a test shift with TESTING in the root, and puts the UID in the root of RegisterCheck', async () => {
    const fetchMock = stubFetch(200, JSON.stringify({ NumFiscal: '1', Offline: false }));
    await openShift(creds, { testing: true, signal: AbortSignal.timeout(1000) });
    expect(sentBody(fetchMock)).toMatchObject({ Command: 'OpenShift', TESTING: true });

    const second = stubFetch(200, JSON.stringify({ NumFiscal: '2' }));
    await registerCheck(creds, { CHECKHEAD: { DOCTYPE: 'SaleGoods' } }, { uid: 'u-1', signal: AbortSignal.timeout(1000) });
    const body = sentBody(second);
    expect(body).toMatchObject({ Command: 'RegisterCheck', UID: 'u-1', Check: { CHECKHEAD: { DOCTYPE: 'SaleGoods' } } });
    expect((body.Check as Record<string, unknown>).UID).toBeUndefined();
  });

  it('asks for a check without any credentials', async () => {
    const fetchMock = stubFetch(200, JSON.stringify({ ResultCode: 0 }));
    await getCheck('4000000004', '177086', 'Availability', { signal: AbortSignal.timeout(1000) });
    expect(sentBody(fetchMock)).toEqual({
      Command: 'GetCheck',
      RegistrarNumFiscal: 4000000004,
      NumFiscal: '177086',
      Type: 'Availability',
    });
  });

  it('reads the duplicate as the ДПС text form gives it, keeping the name', async () => {
    stubFetch(400, 'Код помилки: 13 DuplicatedRequestUid\r\nПовторно надісланий запит із зазначеним UID');
    const error = await registerCheck(creds, {}, { uid: 'u-1', signal: AbortSignal.timeout(1000) }).catch((e) => e);
    expect(error).toBeInstanceOf(CashalotApiError);
    expect(error).toMatchObject({
      httpStatus: 400,
      errorCode: 'DuplicatedRequestUid',
      errorMessage: 'Повторно надісланий запит із зазначеним UID',
    });
  });

  it('treats an ErrorCode in a 200 answer as an error', async () => {
    stubFetch(
      200,
      JSON.stringify({
        ErrorCode: 'DocumentValidationError',
        ErrorMessage:
          'Значення ознаки тестового нефіскального документа (TESTING: False) не дорівнює значенню ознаки зміни, що містить тестові документи (True), для поточної зміни',
      })
    );
    const error = await registerCheck(creds, {}, { uid: 'u-2', signal: AbortSignal.timeout(1000) }).catch((e) => e);
    expect(error).toMatchObject({ httpStatus: 200, errorCode: 'DocumentValidationError' });
    expect(error.errorMessage).toMatch(/TESTING: False/);
  });

  it('parses both forms and leaves a clean answer alone', () => {
    expect(parseError({ ErrorCode: 'ShiftAlreadyOpened', ErrorMessage: 'Зміну на ПРРО наразі відкрито' }, null)).toEqual({
      errorCode: 'ShiftAlreadyOpened',
      errorMessage: 'Зміну на ПРРО наразі відкрито',
    });
    expect(parseError({ NumFiscal: '1', ErrorCode: null }, null)).toEqual({ errorCode: null, errorMessage: null });
    expect(parseError({ ErrorCode: 'Ok' }, null)).toEqual({ errorCode: null, errorMessage: null });
    expect(parseError(null, 'Код помилки: 5 ShiftNotOpened\r\nЗміну для ПРРО наразі не відкрито')).toEqual({
      errorCode: 'ShiftNotOpened',
      errorMessage: 'Зміну для ПРРО наразі не відкрито',
    });
  });
});

describe('maskCredentials', () => {
  it('replaces every credential, whatever its case, and keeps the rest', () => {
    const request = {
      Command: 'RegisterCheck',
      UID: 'u-1',
      ...credentialFields(creds),
      ...creds,
      Password: 'p',
      Check: { CHECKHEAD: { DOCTYPE: 'SaleGoods' } },
    };
    const masked = maskCredentials(request);
    const text = JSON.stringify(masked);
    expect(text).not.toContain('guid-secret-7f');
    expect(text).not.toContain('9911');
    expect(masked).toMatchObject({ KeyGuid: '****', KeyPin: '****', keyGuid: '****', keyPin: '****', Password: '****', NumFiscal: 4000000004, UID: 'u-1' });
    // The original is untouched — it is still what goes on the wire.
    expect(request.KeyGuid).toBe('guid-secret-7f');
  });
});
