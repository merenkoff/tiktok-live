// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The body of the «Про програму» card: the program and its version, who makes
// it, under what licence, how to reach them (`lib/about.ts`). Each host page
// supplies its own frame — the till its `CARD` + `CardTitle`, the owner's
// settings a `SectionHead` — so this is the rows only.

import type { MouseEvent, ReactNode } from 'react';
import { PLATFORM_VERSION, POS_API_CLIENT_VERSION, POS_APP_VERSION, usePosShell } from '@pos/platform';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ABOUT, type AboutLink } from '../lib/about';

function SiteLink({ link }: { link: AboutLink }) {
  const shell = usePosShell();
  // The desktop's webview opens no new windows, so there the opener plugin
  // hands the address to the system browser — within the scope
  // `capabilities/default.json` grants. The web and the tablet are browsers.
  const onClick =
    shell === 'cashier'
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          void openUrl(link.url);
        }
      : undefined;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="font-semibold text-sq-blue hover:underline"
    >
      {link.label}
    </a>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-[13px] font-semibold text-sq-secondary sm:w-28 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="text-[15px] text-sq-text">{children}</dd>
    </div>
  );
}

export function AboutCard() {
  const shell = usePosShell();
  const build = shell === 'cashier' ? `каса ${POS_APP_VERSION}` : POS_APP_VERSION;
  return (
    <div className="mt-3">
      <dl className="space-y-2.5">
        <Row label="Програма">
          <span className="font-semibold">{ABOUT.productName}</span> · <SiteLink link={ABOUT.productSite} />
        </Row>
        <Row label="Версія">
          <span className="tabular-nums">
            {build} · платформа {PLATFORM_VERSION} · API {POS_API_CLIENT_VERSION}
          </span>
        </Row>
        <Row label="Розробник">
          {ABOUT.company} — {ABOUT.companyLegalName}, ЄДРПОУ{' '}
          <span className="tabular-nums">{ABOUT.companyTaxId}</span> · <SiteLink link={ABOUT.companySite} />
        </Row>
        <Row label="Ліцензія">
          {ABOUT.license} · <SiteLink link={ABOUT.licenseSite} />
        </Row>
        <Row label="Зв'язок">{ABOUT.contactEmail}</Row>
      </dl>
      <p className="mt-3 text-[13px] text-sq-muted">{ABOUT.copyright}</p>
    </div>
  );
}
