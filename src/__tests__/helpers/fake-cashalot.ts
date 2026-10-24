// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/helpers/fake-cashalot.ts
//
// A stand-in for Cashalot's WEB API behind `fetch`, answering by `Command` the
// way the spec and the developers' answers describe it
// (TechDocs/prro/cashalot/sources/): a shift that is test or fiscal, a repeat
// of a `UID` refused in the ДПС text form, `ErrorCode`s on a 200, documents
// readable back by local number and as original XML. It keeps state, so a
// test can follow one register through a sale, a lost answer and a retry.
//
// Install with `vi.stubGlobal('fetch', fake.fetch)`.

export interface FakeCashalotCall {
  Command: string;
  body: Record<string, unknown>;
}

interface StoredDoc {
  numFiscal: string;
  uid: string;
  sum: number;
  offline: boolean;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const b64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64');

export class FakeCashalot {
  keyGuid = 'guid-test-1';
  keyPin = '9911';
  numFiscal = '4000000004';

  shiftOpen = false;
  /** The open shift's mode — set by `OpenShift{ TESTING }`. */
  testing = false;
  shiftId = 700;
  local = 0;
  readonly calls: FakeCashalotCall[] = [];
  readonly docs = new Map<number, StoredDoc>();
  readonly uids = new Map<string, string>();

  /** The next registered check comes back `Offline: true`, numbered like an offline document. */
  nextOffline = false;
  /** The next check is registered, and then the answer is lost on the way back. */
  loseNextAnswer = false;
  /** Leave `Url` out of answers — the adapter then builds the tax link itself. */
  omitUrl = false;

  commands(name: string): FakeCashalotCall[] {
    return this.calls.filter((c) => c.Command === name);
  }

  readonly fetch = async (_url: unknown, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const command = String(body.Command);
    this.calls.push({ Command: command, body });

    const needsAuth = !['ServerState', 'GetCheck'].includes(command);
    if (needsAuth && (body.KeyGuid !== this.keyGuid || body.KeyPin !== this.keyPin)) {
      return json(200, {
        ErrorCode: 'OperatorAccessToTransactionsRegistrarNotGranted',
        ErrorMessage: 'Відсутній доступ до ПРРО для користувача',
      });
    }

    switch (command) {
      case 'ServerState':
        return json(200, { Available: true, Version: 'fake' });

      case 'TransactionsRegistrarState':
        return json(200, {
          ShiftState: this.shiftOpen ? 1 : 0,
          ShiftId: this.shiftOpen ? this.shiftId : null,
          Testing: this.shiftOpen ? this.testing : false,
          Name: 'Касир Тест',
          FirstLocalNum: 1,
          NextLocalNum: this.local + 1,
          OfflineSupported: true,
          LicenseExpiration: '2027-01-01',
          TaxObject: {
            OrgName: 'ТОВ «Тест»',
            Tin: '12345678',
            Ipn: '123456789012',
            Name: 'Кав’ярня',
            Address: 'вул. Тестова, 1',
          },
        });

      case 'OpenShift':
        if (this.shiftOpen) return json(200, { ErrorCode: 'ShiftAlreadyOpened', ErrorMessage: 'Зміну на ПРРО наразі відкрито' });
        this.shiftOpen = true;
        this.testing = body.TESTING === true;
        this.shiftId += 1;
        this.local += 1;
        return json(200, { NumFiscal: String(500 + this.local), NumLocal: this.local, OrderDateTime: '2026-10-24T12:00:00+03:00', Offline: false });

      case 'RegisterCheck': {
        const uid = String(body.UID ?? '');
        if (this.uids.has(uid)) {
          return new Response('Код помилки: 13 DuplicatedRequestUid\r\nПовторно надісланий запит із зазначеним UID', { status: 400 });
        }
        if (!this.shiftOpen) return json(200, { ErrorCode: 'ShiftNotOpened', ErrorMessage: 'Зміну для ПРРО наразі не відкрито' });
        const check = body.Check as Record<string, Record<string, unknown>>;
        if ((check.CHECKHEAD.TESTING === true) !== this.testing) {
          return json(200, {
            ErrorCode: 'DocumentValidationError',
            ErrorMessage: `Значення ознаки тестового нефіскального документа (TESTING: ${check.CHECKHEAD.TESTING === true}) не дорівнює значенню ознаки зміни`,
          });
        }
        this.local += 1;
        const offline = this.nextOffline;
        this.nextOffline = false;
        const numFiscal = offline ? `82563.${this.local}.6127` : String(100000 + this.local);
        this.uids.set(uid, numFiscal);
        this.docs.set(this.local, {
          numFiscal,
          uid: String(check.CHECKHEAD.UID ?? ''),
          sum: Number(check.CHECKTOTAL.SUM),
          offline,
        });
        if (this.loseNextAnswer) {
          this.loseNextAnswer = false;
          throw new TypeError('fetch failed');
        }
        return json(200, {
          NumFiscal: numFiscal,
          NumLocal: this.local,
          OrderDateTime: '2026-10-24T12:05:00+03:00',
          Offline: offline,
          ...(this.omitUrl ? {} : { Url: `https://cabinet.tax.gov.ua/cashregs/check?id=${numFiscal}&fn=${this.numFiscal}` }),
        });
      }

      case 'DocumentInfoByLocalNum': {
        const doc = this.docs.get(Number(body.NumLocal));
        return doc
          ? json(200, { NumFiscal: doc.numFiscal, DocClass: 'Check', CheckDocType: 'SaleGoods' })
          : json(200, { ErrorCode: 'NoContent', ErrorMessage: 'Запитані дані відсутні' });
      }

      case 'GetCheck': {
        const found = [...this.docs.values()].find((d) => d.numFiscal === String(body.NumFiscal));
        if (!found) return json(200, { ResultCode: 1, ResultText: 'OnlineDocumentAbsent' });
        const xml = `<?xml version="1.0" encoding="UTF-8"?><CHECK><CHECKHEAD><DOCTYPE>0</DOCTYPE><UID>${found.uid}</UID><ORDERDATE>24102026</ORDERDATE><ORDERTIME>120500</ORDERTIME>${found.offline ? '<OFFLINE>true</OFFLINE>' : ''}</CHECKHEAD><CHECKTOTAL><SUM>${found.sum.toFixed(2)}</SUM></CHECKTOTAL></CHECK>`;
        return json(200, { Data: b64(xml), ResultCode: found.offline ? 2 : 0, ...(this.omitUrl ? {} : { Url: `https://cabinet.tax.gov.ua/cashregs/check?id=${found.numFiscal}` }) });
      }

      case 'CloseShift':
        if (!this.shiftOpen) return json(200, { ErrorCode: 'ShiftNotOpened', ErrorMessage: 'Зміну для ПРРО наразі не відкрито' });
        this.shiftOpen = false;
        this.local += 1;
        return json(200, { NumFiscal: String(600 + this.local), OrderDateTime: '2026-10-24T22:00:00+03:00', ZRepAutoInfo: { NumFiscal: String(599 + this.local) }, Visualization: b64('Z-ЗВІТ') });

      case 'LastShiftTotals':
        return json(200, { ShiftOpened: '2026-10-24T09:00:00+03:00', CashInHand: 123.45, Visualization: b64('X-ЗВІТ') });

      default:
        return json(200, { ErrorCode: 'InvalidQueryParameter', ErrorMessage: `Невідома команда ${command}` });
    }
  };
}
