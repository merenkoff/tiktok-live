// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  ChevronRight,
  CreditCard,
  Delete,
  QrCode,
  Split,
  X,
  type Glyph,
} from '../platform/glyphs';
import { formatUah, formatUahCompact, uahInputToCents } from '../lib/money';
import { centsToPadText, padInput, quickCashAmounts, type PadKey } from '../lib/cash';
import { positionsText } from '../lib/plural';
import { useDragScroll } from '../hooks/useDragScroll';
import { api, useAuthStore } from '@pos/platform';
import { displayImageUrl } from '../offline/photos';
import type { SalePaymentInput } from '../types';

interface Props {
  totalCents: number;
  /** Lines in the cart — «До сплати · 3 позиції». */
  itemCount?: number;
  loading: boolean;
  /** Client-generated draft id for the open cart — used as the QR payment reference. */
  saleRef?: string;
  /**
   * A failure the cashier must read before doing anything else.
   *
   * This modal is an opaque full-screen overlay, so anything rendered behind it
   * is invisible — a checkout error shown on the cart banner never reaches the
   * person who needs it.
   */
  error?: { message: string; supportCode?: string | null; action?: ReactNode } | null;
  onClose: () => void;
  onConfirm: (payments: SalePaymentInput[]) => void;
}

type Step = 'methods' | 'cash' | 'card' | 'mixed' | 'qr';

type DynamicInvoice = { src: string; invoiceId: string };

/** Two panels side by side from `md` — methods on the left, the chosen one on the right. */
function isWide(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 768px)').matches
    : false;
}

export function CheckoutModal({
  totalCents,
  itemCount,
  loading,
  saleRef,
  error,
  onClose,
  onConfirm,
}: Props) {
  // A wide till opens straight on cash, the common case, with the list beside
  // it; a phone-width screen shows the list first and one method at a time.
  const [step, setStep] = useState<Step>(() => (isWide() ? 'cash' : 'methods'));
  const [cash, setCash] = useState(() => centsToPadText(totalCents));
  // The amount on screen was put there by the till, not typed: the first key replaces it.
  const [fresh, setFresh] = useState(true);
  const [card, setCard] = useState('0');
  const bodyRef = useDragScroll<HTMLDivElement>();
  const qrPayment = useAuthStore((s) => s.auth?.store.qr_payment);
  const qrEnabled = Boolean(qrPayment?.enabled);

  // Static QR image (uploaded in admin) — always resolved as the offline / fallback source.
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrImageLoading, setQrImageLoading] = useState(false);
  useEffect(() => {
    if (step !== 'qr') return;
    let cancelled = false;
    setQrImageLoading(true);
    void displayImageUrl(qrPayment?.static_image_url ?? null)
      .then((url) => {
        if (!cancelled) setQrImage(url);
      })
      .finally(() => {
        if (!cancelled) setQrImageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, qrPayment?.static_image_url]);

  // Dynamic QR (exact amount) via Opendatabot — one invoice per sale draft, cached
  // so re-entering the step never re-bills.
  const invoiceCache = useRef(new Map<string, DynamicInvoice>());
  const [dynamicInvoice, setDynamicInvoice] = useState<DynamicInvoice | null>(null);
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [dynamicFailed, setDynamicFailed] = useState(false);
  useEffect(() => {
    if (step !== 'qr') return;
    const wantDynamic = qrPayment?.mode === 'dynamic' && navigator.onLine && Boolean(saleRef);
    if (!wantDynamic || !saleRef) {
      setDynamicInvoice(null);
      setDynamicFailed(false);
      return;
    }
    const cached = invoiceCache.current.get(saleRef);
    if (cached) {
      setDynamicInvoice(cached);
      setDynamicFailed(false);
      return;
    }
    let cancelled = false;
    setDynamicLoading(true);
    setDynamicFailed(false);
    void api
      .qrInvoice(totalCents, saleRef)
      .then((inv) => {
        if (cancelled) return;
        const rec: DynamicInvoice = { src: inv.qrcode_data_uri, invoiceId: inv.invoice_id };
        invoiceCache.current.set(saleRef, rec);
        setDynamicInvoice(rec);
      })
      .catch(() => {
        if (!cancelled) setDynamicFailed(true);
      })
      .finally(() => {
        if (!cancelled) setDynamicLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, qrPayment?.mode, saleRef, totalCents]);

  const cashCents = uahInputToCents(cash);
  const cardCents = uahInputToCents(card);
  const change = useMemo(() => {
    if (step === 'cash') return Math.max(0, cashCents - totalCents);
    if (step === 'mixed') return Math.max(0, cashCents + cardCents - totalCents);
    return 0;
  }, [step, cashCents, cardCents, totalCents]);
  const quick = useMemo(() => quickCashAmounts(totalCents), [totalCents]);

  function payCard() {
    onConfirm([{ method: 'card', amount_cents: totalCents }]);
  }

  function payQr() {
    onConfirm([
      { method: 'qr', amount_cents: totalCents, provider_ref: dynamicInvoice?.invoiceId ?? null },
    ]);
  }

  function submitCash(e: FormEvent) {
    e.preventDefault();
    if (cashCents < totalCents) return;
    onConfirm([{ method: 'cash', amount_cents: cashCents }]);
  }

  function submitMixed(e: FormEvent) {
    e.preventDefault();
    if (cashCents + cardCents < totalCents) return;
    const payments: SalePaymentInput[] = [];
    if (cashCents > 0) payments.push({ method: 'cash', amount_cents: cashCents });
    if (cardCents > 0) payments.push({ method: 'card', amount_cents: cardCents });
    onConfirm(payments);
  }

  function press(key: PadKey) {
    setCash((text) => padInput(text, key, fresh));
    setFresh(false);
  }

  function pickQuick(cents: number) {
    setCash(centsToPadText(cents));
    setFresh(true);
  }

  const methods: Array<{ step: Step; glyph: Glyph; label: string; hint: string }> = [
    { step: 'cash', glyph: Banknote, label: 'Готівка', hint: 'рахує решту' },
    { step: 'card', glyph: CreditCard, label: 'Картка', hint: 'термінал банку' },
    ...(qrEnabled
      ? [{ step: 'qr' as Step, glyph: QrCode, label: 'QR-код', hint: 'покупець сканує телефоном' }]
      : []),
    { step: 'mixed', glyph: Split, label: 'Змішана', hint: 'частина готівкою, частина карткою' },
  ];

  const qrBusy = dynamicLoading || qrImageLoading;
  const qrSrc = dynamicInvoice?.src ?? qrImage;
  const qrHint = dynamicInvoice
    ? 'Сума вже в коді'
    : dynamicFailed
      ? 'QR з сумою недоступний — покажіть статичний код і назвіть суму'
      : qrPayment?.mode === 'dynamic' && !navigator.onLine
        ? 'Немає інтернету — статичний код, назвіть суму'
        : null;

  const short = Math.max(0, totalCents - cashCents);
  const current = methods.find((m) => m.step === step) ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Оплата"
      className="fixed inset-0 z-50 bg-sq-bg flex flex-col animate-fade-up text-sq-text"
    >
      <header className="h-[68px] shrink-0 px-4 md:px-7 flex items-center gap-2">
        {step !== 'methods' && (
          <button
            type="button"
            onClick={() => setStep('methods')}
            className="md:hidden w-11 h-11 -ml-2 rounded-full grid place-items-center text-sq-secondary"
            aria-label="Назад"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h2 className="flex-1 text-xl font-bold text-sq-heading">Оплата</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 -mr-2 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty"
          aria-label="Закрити"
        >
          <X size={20} />
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mx-4 md:mx-7 mb-4 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm shrink-0"
        >
          <p className="font-semibold">{error.message}</p>
          {error.supportCode && <p className="mt-1 text-xs text-red-600">Код: {error.supportCode}</p>}
          {error.action}
        </div>
      )}

      <div
        ref={bodyRef}
        className="flex-1 min-h-0 overflow-auto md:overflow-hidden px-4 md:px-7 pb-4 md:pb-7 flex flex-col md:flex-row gap-4 md:gap-6 select-none"
      >
        <section
          className={`md:w-[400px] lg:w-[460px] md:shrink-0 flex flex-col gap-4 ${
            step !== 'methods' ? 'max-md:hidden' : ''
          }`}
        >
          <div className="bg-white rounded-card shadow-card px-6 py-[22px]">
            <p className="text-sm text-sq-secondary">
              До сплати{itemCount ? ` · ${positionsText(itemCount)}` : ''}
            </p>
            <p
              className="text-[44px] lg:text-[52px] leading-tight font-bold tracking-[-0.02em] text-sq-heading tabular-nums"
              data-testid="checkout-total"
            >
              {formatUah(totalCents)}
            </p>
          </div>
          <ul className="bg-white rounded-card shadow-card p-2 space-y-0.5">
            {methods.map((m) => {
              const on = m.step === step;
              const Icon = m.glyph;
              return (
                <li key={m.step}>
                  <button
                    type="button"
                    disabled={loading}
                    aria-label={m.label}
                    aria-pressed={on}
                    onClick={() => setStep(m.step)}
                    className={`w-full min-h-16 rounded-[14px] flex items-center gap-3.5 px-4 text-left transition-colors disabled:opacity-50 ${
                      on ? 'bg-sq-selected' : 'hover:bg-sq-sidebar'
                    }`}
                  >
                    <Icon size={24} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[17px] font-semibold text-sq-text">{m.label}</span>
                      <span className="block text-[13px] text-sq-muted">{m.hint}</span>
                    </span>
                    <ChevronRight size={20} className="text-sq-muted shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {current && (
          <section className="flex-1 min-w-0 bg-white rounded-card shadow-card px-5 py-5 md:px-7 md:py-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <current.glyph size={48} />
              <h3 className="flex-1 text-[22px] font-bold text-sq-heading">{current.label}</h3>
              <span className="md:hidden text-lg font-bold tabular-nums text-sq-heading">
                {formatUah(totalCents)}
              </span>
            </div>

            {step === 'cash' && (
              <form onSubmit={submitCash} className="flex-1 min-h-0 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3.5">
                  <label className="rounded-[14px] ring-2 ring-sq-blue px-4 py-3 flex flex-col cursor-text">
                    <span className="text-[13px] text-sq-secondary">Отримано</span>
                    <span className="flex items-baseline gap-1.5 text-[26px] lg:text-[30px] font-bold text-sq-heading tabular-nums">
                      <input
                        aria-label="Отримано готівкою"
                        className="min-w-0 w-full bg-transparent outline-none border-0 p-0"
                        value={cash}
                        inputMode="none"
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          setCash(e.target.value.replace(/[^\d,.]/g, '').replace('.', ','));
                          setFresh(false);
                        }}
                        data-testid="checkout-cash-input"
                      />
                      <span className="shrink-0">₴</span>
                    </span>
                  </label>
                  <div className="rounded-[14px] bg-sq-sidebar px-4 py-3 flex flex-col" data-testid="checkout-change">
                    <span className="text-[13px] text-sq-secondary">{short > 0 ? 'Не вистачає' : 'Решта'}</span>
                    <span
                      className={`text-[26px] lg:text-[30px] font-bold tabular-nums truncate ${
                        short > 0 ? 'text-sq-danger' : 'text-sq-success'
                      }`}
                    >
                      {formatUah(short > 0 ? short : change)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {quick.map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => pickQuick(cents)}
                      className={`flex-1 min-w-0 h-11 rounded-sq text-base font-semibold tabular-nums truncate px-1 ${
                        fresh && cents === cashCents ? 'bg-sq-selected' : 'bg-sq-empty hover:bg-sq-selected'
                      }`}
                      data-testid={`checkout-quick-${cents}`}
                    >
                      {formatUahCompact(cents)}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 flex-1 min-h-[13rem] auto-rows-fr">
                  {(['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as PadKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => press(key)}
                      aria-label={key === 'del' ? 'Стерти' : undefined}
                      className="min-h-12 rounded-xl bg-sq-sidebar hover:bg-sq-selected active:bg-sq-selected text-[22px] font-semibold text-sq-text grid place-items-center"
                    >
                      {key === 'del' ? <Delete size={20} /> : key}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || cashCents < totalCents}
                  className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
                  data-testid="checkout-cash-submit"
                >
                  {loading
                    ? 'Обробка…'
                    : change > 0
                      ? `Прийняти ${formatUah(cashCents)} · решта ${formatUah(change)}`
                      : `Прийняти ${formatUah(Math.max(cashCents, totalCents))}`}
                </button>
              </form>
            )}

            {step === 'card' && (
              <div className="flex-1 flex flex-col gap-4">
                <p className="text-[15px] text-sq-secondary">
                  Проведіть оплату на терміналі банку, потім підтвердіть її тут.
                </p>
                <div className="rounded-[14px] bg-sq-sidebar px-4 py-3 self-start min-w-[16rem]">
                  <p className="text-[13px] text-sq-secondary">Сума на терміналі</p>
                  <p className="text-[30px] font-bold text-sq-heading tabular-nums">{formatUah(totalCents)}</p>
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={loading}
                  onClick={payCard}
                  className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
                >
                  {loading ? 'Обробка…' : `Оплата карткою пройшла · ${formatUah(totalCents)}`}
                </button>
              </div>
            )}

            {step === 'qr' && (
              <div className="flex-1 flex flex-col items-center gap-4">
                <div className="w-64 h-64 grid place-items-center rounded-[14px] ring-1 ring-sq-divider bg-white">
                  {qrBusy ? (
                    <span className="text-sm text-sq-muted">
                      {dynamicLoading ? 'Генеруємо QR…' : 'Завантаження…'}
                    </span>
                  ) : qrSrc ? (
                    <img src={qrSrc} alt="QR-код для оплати" className="w-full h-full object-contain p-2" />
                  ) : (
                    <span className="text-sm text-sq-muted text-center px-4">
                      QR-код не налаштований. Додайте зображення в «Налаштування».
                    </span>
                  )}
                </div>
                <p className="text-[15px] text-sq-secondary text-center">
                  Покажіть код покупцеві · <span className="font-semibold text-sq-text">{formatUah(totalCents)}</span>
                  {qrHint && <span className="block text-[13px] text-sq-muted mt-1">{qrHint}</span>}
                </p>
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={loading || qrBusy || !qrSrc}
                  onClick={payQr}
                  className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
                >
                  {loading ? 'Обробка…' : 'Підтвердити оплату'}
                </button>
              </div>
            )}

            {step === 'mixed' && (
              <form onSubmit={submitMixed} className="flex-1 flex flex-col gap-4">
                <div className="grid sm:grid-cols-2 gap-3.5">
                  <MoneyField label="Готівка" value={cash} onChange={(v) => { setCash(v); setFresh(false); }} />
                  <MoneyField label="Картка" value={card} onChange={setCard} />
                </div>
                <p className="text-[15px] text-sq-secondary tabular-nums">
                  Разом {formatUah(cashCents + cardCents)}
                  {cashCents + cardCents < totalCents
                    ? ` · не вистачає ${formatUah(totalCents - cashCents - cardCents)}`
                    : change > 0
                      ? ` · решта ${formatUah(change)}`
                      : ''}
                </p>
                <div className="flex-1" />
                <button
                  type="submit"
                  disabled={loading || cashCents + cardCents < totalCents}
                  className="pos-btn-primary w-full min-h-[60px] rounded-xl text-lg"
                >
                  {loading ? 'Обробка…' : change > 0 ? `Прийняти · решта ${formatUah(change)}` : 'Прийняти'}
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-[14px] bg-sq-sidebar focus-within:bg-white focus-within:ring-2 focus-within:ring-sq-blue px-4 py-3 flex flex-col">
      <span className="text-[13px] text-sq-secondary">{label}</span>
      <span className="flex items-baseline gap-1.5 text-[26px] font-bold text-sq-heading tabular-nums">
        <input
          aria-label={label}
          className="min-w-0 w-full bg-transparent outline-none border-0 p-0"
          value={value}
          inputMode="decimal"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="shrink-0">₴</span>
      </span>
    </label>
  );
}
