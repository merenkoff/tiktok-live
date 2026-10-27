// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/helpers/fake-cashalot-server.ts
//
// `FakeCashalot` behind a real HTTP port, for driving the Cashalot screens
// by hand before there are keys to a live register (track CA, phase CA6):
//
//   npx tsx src/__tests__/helpers/fake-cashalot-server.ts        # :5099
//   CASHALOT_BASE_URL=http://localhost:5099/ npm run dev          # the API
//
// Its credentials are the fake's own (`guid-test-1` / `9911` / `4000000004`);
// anything else answers «Відсутній доступ до ПРРО». Not a test: nothing
// imports it.

import { createServer } from 'node:http';
import { FakeCashalot } from './fake-cashalot.js';

const port = Number(process.env.FAKE_CASHALOT_PORT || 5099);
const fake = new FakeCashalot();

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    void fake
      .fetch(undefined, { body: Buffer.concat(chunks).toString('utf-8') })
      .then(async (answer) => {
        res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'text/plain' });
        res.end(await answer.text());
      })
      .catch((error: unknown) => {
        // `loseNextAnswer` and the like — the fake threw on purpose.
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      });
  });
});

server.listen(port, () => {
  console.warn(
    `fake Cashalot on http://localhost:${port}/ — KeyGuid ${fake.keyGuid}, PIN ${fake.keyPin}, ФН ${fake.numFiscal}`
  );
});
