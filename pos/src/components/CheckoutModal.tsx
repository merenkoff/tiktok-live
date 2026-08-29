// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { formatUah, uahInputToCents } from '../lib/money';
import { useDragScroll } from '../hooks/useDragScroll';
import { useAuthStore } from '../hooks/useAuth';
import { displayImageUrl } from '../offline/photos';
import type { SalePaymentInput } from '../types';

interface Props {
  totalCents: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payments: SalePaymentInput[]) => void;
}

type Step = 'methods' | 'cash' | 'mixed' | 'qr';

export function CheckoutModal({ totalCents, loading, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<Step>('methods');
  const [cash, setCash] = useState((totalCents / 100).toFixed(2));
  const [card, setCard] = useState('0');
  const bodyRef = useDragScroll<HTMLDivElement>();
  const qrPayment = useAuthStore((s) => s.auth?.store.qr_payment);
  const qrEnabled = Boolean(qrPayment?.enabled);

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

  const cashCents = uahInputToCents(cash);
  const cardCents = uahInputToCents(card);
  const change = useMemo(() => {
    if (step === 'cash') return Math.max(0, cashCents - totalCents);
    if (step === 'mixed') return Math.max(0, cashCents + cardCents - totalCents);
    return 0;
  }, [step, cashCents, cardCents, totalCents]);

  function payCard() {
    onConfirm([{ method: 'card', amount_cents: totalCents }]);
  }

  function payQr() {
    onConfirm([{ method: 'qr', amount_cents: totalCents }]);
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

  const methods: Array<{ label: string; action: () => void }> = [
    { label: 'Готівка', action: () => setStep('cash') },
    { label: 'Картка (вручну)', action: () => payCard() },
    { label: 'Мікс', action: () => setStep('mixed') },
  ];
  if (qrEnabled) methods.push({ label: 'QR-код', action: () => setStep('qr') });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-up font-sans text-sq-text">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-text"
          aria-label="Закрити"
        >
          <X size={22} />
        </button>
        <span className="text-sm font-medium text-sq-blue">Оплата</span>
        <div className="min-w-11" />
      </div>

      <div ref={bodyRef} className="flex-1 flex flex-col items-center px-6 pt-6 overflow-auto select-none">
        <p className="text-5xl font-bold tracking-tight">{formatUah(totalCents)}</p>
        <p className="text-sm text-sq-muted mt-3 text-center">
          {step === 'qr' ? 'Покажіть QR-код покупцеві' : 'Оберіть спосіб оплати'}
        </p>

        {step === 'methods' && (
          <ul className="w-full max-w-md mt-10 border-t border-sq-divider">
            {methods.map((item) => (
              <li key={item.label} className="border-b border-sq-divider">
                <button
                  type="button"
                  disabled={loading}
                  onClick={item.action}
                  className="w-full min-h-14 flex items-center justify-between gap-3 text-left text-[17px] font-medium disabled:text-sq-muted"
                >
                  <span>{item.label}</span>
                  <ChevronRight size={18} className="text-sq-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 'qr' && (
          <div className="w-full max-w-md mt-8 flex flex-col items-center gap-5">
            <div className="w-64 h-64 grid place-items-center border border-sq-divider rounded-sq bg-white">
              {qrImageLoading ? (
                <span className="text-sm text-sq-muted">Завантаження…</span>
              ) : qrImage ? (
                <img src={qrImage} alt="QR-код для оплати" className="w-full h-full object-contain p-2" />
              ) : (
                <span className="text-sm text-sq-muted text-center px-4">
                  QR-код не налаштований. Додайте зображення в «Налаштування».
                </span>
              )}
            </div>
            <p className="text-sm text-sq-secondary text-center">
              Сума до сплати: <span className="font-semibold text-sq-text">{formatUah(totalCents)}</span>
            </p>
            <button
              type="button"
              disabled={loading || !qrImage}
              onClick={payQr}
              className="pos-btn-primary w-full py-3.5"
            >
              {loading ? 'Обробка…' : 'Підтвердити оплату'}
            </button>
            <button
              type="button"
              className="w-full min-h-11 text-sq-secondary text-sm"
              onClick={() => setStep('methods')}
            >
              Назад
            </button>
          </div>
        )}

        {step === 'cash' && (
          <form onSubmit={submitCash} className="w-full max-w-md mt-10 space-y-5">
            <label className="block">
              <span className="text-sm text-sq-secondary">Отримано готівкою</span>
              <input
                className="pos-field-underline mt-1 text-3xl font-semibold"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                inputMode="decimal"
                autoFocus
              />
            </label>
            {change > 0 && (
              <p className="text-sq-blue font-semibold text-lg">Решта: {formatUah(change)}</p>
            )}
            <button
              type="submit"
              disabled={loading || cashCents < totalCents}
              className="pos-btn-primary w-full py-3.5"
            >
              {loading ? 'Обробка…' : 'Готово'}
            </button>
            <button
              type="button"
              className="w-full min-h-11 text-sq-secondary text-sm"
              onClick={() => setStep('methods')}
            >
              Назад
            </button>
          </form>
        )}

        {step === 'mixed' && (
          <form onSubmit={submitMixed} className="w-full max-w-md mt-10 space-y-4">
            <label className="block">
              <span className="text-sm text-sq-secondary">Готівка</span>
              <input
                className="pos-field mt-1.5 text-lg"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="block">
              <span className="text-sm text-sq-secondary">Картка</span>
              <input
                className="pos-field mt-1.5 text-lg"
                value={card}
                onChange={(e) => setCard(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <p className="text-sm text-sq-secondary">
              Разом: {formatUah(cashCents + cardCents)}
              {change > 0 ? ` · Решта: ${formatUah(change)}` : ''}
            </p>
            <button
              type="submit"
              disabled={loading || cashCents + cardCents < totalCents}
              className="pos-btn-primary w-full py-3.5"
            >
              {loading ? 'Обробка…' : 'Готово'}
            </button>
            <button
              type="button"
              className="w-full min-h-11 text-sq-secondary text-sm"
              onClick={() => setStep('methods')}
            >
              Назад
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
