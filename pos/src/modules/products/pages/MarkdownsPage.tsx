// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { PageHeader, Percent, SectionHead } from '@pos/platform/ui';
import { ConfirmSheet } from '../../../components/cashier/ConfirmSheet';
import {
  countPhrase,
  endMarkdown,
  formatDay,
  listMarkdowns,
  markdownCaption,
  roundingLabel,
  type MarkdownView,
} from '../data/markdownsApi';
import { requestErrorMessage } from '../lib/saveErrors';

function whenEnded(m: MarkdownView): string {
  const day = m.ended_at ? new Date(m.ended_at).toLocaleDateString('uk-UA') : '';
  return m.ended_reason === 'expired' ? `завершилась за датою ${day}` : `завершено вручну ${day}`;
}

function MarkdownRow({ m, onEnd }: { m: MarkdownView; onEnd?: () => void }) {
  const live = m.ended_at == null;
  return (
    <li className="sq-row min-h-14 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="markdown-row">
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-sq-text truncate">{markdownCaption(m)}</span>
        <span className="block text-[13px] text-sq-muted tabular-nums">
          −{m.percent} % · {roundingLabel(m.rounding).toLowerCase()} · {countPhrase(m.items, m.products)}
          {live
            ? m.ends_on
              ? ` · діє до ${formatDay(m.ends_on)}`
              : ' · поки не завершите'
            : ` · ${whenEnded(m)}`}
        </span>
        {!live && (
          <span className="block text-[13px] text-sq-muted tabular-nums">
            Повернуто цін: {m.restored ?? 0}
            {m.skipped ? ` · залишено як змінені вручну: ${m.skipped}` : ''}
          </span>
        )}
      </span>
      {live && onEnd && (
        <button type="button" className="sq-btn-quiet" onClick={onEnd}>
          Завершити
        </button>
      )}
    </li>
  );
}

/**
 * «Уцінки» (clothing D2): the campaigns that are on and the ones that were,
 * and the one button that puts prices back before the date does. Ending
 * reports two numbers, because a variant the owner retyped since the markdown
 * is deliberately left alone — and she should know which ones.
 */
export function MarkdownsPage() {
  const [rows, setRows] = useState<MarkdownView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ending, setEnding] = useState<MarkdownView | null>(null);

  async function reload() {
    setRows(await listMarkdowns());
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити уцінки'));
  }, []);

  async function end(m: MarkdownView) {
    setEnding(null);
    setError(null);
    try {
      const result = await endMarkdown(m.id);
      setNotice(
        `«${markdownCaption(m)}»: повернуто цін — ${result.restored}` +
          (result.skipped ? `, залишено як змінені вручну — ${result.skipped}` : '')
      );
      await reload();
    } catch (err) {
      setError(requestErrorMessage(err, `Не вдалося завершити «${markdownCaption(m)}»`));
    }
  }

  const live = rows?.filter((m) => m.ended_at == null) ?? [];
  const past = rows?.filter((m) => m.ended_at != null) ?? [];

  return (
    <div className="animate-fade-up text-sq-text max-w-4xl">
      <PageHeader
        glyph={Percent}
        title="Уцінки"
        back={{ to: '/admin/products', label: 'Товари' }}
        subtitle="Масова уцінка: оберіть товари в списку й натисніть «Уцінити». Знижка рахується від старої ціни, стара ціна лишається закресленою на касі й на цінику, а «Завершити» повертає ціни — крім тих, що ви змінили вручну після уцінки."
      />

      {notice && (
        <div className="mb-5 rounded-sq bg-amber-50 text-amber-800 px-4 py-3 text-sm" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <p className="py-6 text-[15px] text-sq-muted">
          Ще жодної уцінки.{' '}
          <Link to="/admin/products" className="font-semibold text-sq-blue">
            Оберіть товари
          </Link>{' '}
          у списку й натисніть «Уцінити».
        </p>
      )}

      {live.length > 0 && (
        <section className="mb-8">
          <SectionHead title="Діють" count={live.length} />
          <ul>
            {live.map((m) => (
              <MarkdownRow key={m.id} m={m} onEnd={() => setEnding(m)} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <SectionHead title="Завершені" count={past.length} />
          <ul>
            {past.map((m) => (
              <MarkdownRow key={m.id} m={m} />
            ))}
          </ul>
        </section>
      )}

      {ending &&
        createPortal(
          <ConfirmSheet
            title={`Завершити «${markdownCaption(ending)}»?`}
            message="Ціни повернуться до тих, що були до уцінки. Варіанти, які ви змінили вручну після неї, залишаться як є."
            confirmLabel="Завершити"
            onConfirm={() => void end(ending)}
            onCancel={() => setEnding(null)}
          />,
          document.body
        )}
    </div>
  );
}
