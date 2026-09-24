// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Download,
  DownloadLine,
  Printer,
  PrinterColor,
  RefreshCw,
  ScanLine,
  Usb,
  type Glyph,
} from '../platform/glyphs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { HardwareDevice, listHardware } from '../lib/hardware';
import { installUpdate } from '../lib/updates';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  KitchenTicketData,
  PrinterInfo,
  RECEIPT_PAPER_WIDTHS,
  ReceiptData,
  ReceiptPaperWidth,
  listPrinters,
  printKitchenTicket,
  printReceipt,
} from '../lib/printer';
import {
  BAR_PAPER_META_KEY,
  BAR_PRINTER_META_KEY,
  KITCHEN_PAPER_META_KEY,
  KITCHEN_PRINTER_META_KEY,
} from '../lib/kitchenPrinters';
import { STATION_TITLES, type Station } from '../lib/kitchenTicket';
import { usePrintableReceipt } from '../hooks/usePrintableReceipt';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { getMeta, setMeta } from '../offline/db';
import { useAuthStore, useVertical } from '@pos/platform';

const RECEIPT_PRINTER_META_KEY = 'receiptPrinterName';
const RECEIPT_PAPER_META_KEY = 'receiptPaperWidthMm';

const STATION_META: Record<Station, { printer: string; paper: string }> = {
  kitchen: { printer: KITCHEN_PRINTER_META_KEY, paper: KITCHEN_PAPER_META_KEY },
  bar: { printer: BAR_PRINTER_META_KEY, paper: BAR_PAPER_META_KEY },
};

/** What a station's «Тестовий тікет» prints — every element a real one can carry. */
function testKitchenTicket(station: Station): KitchenTicketData {
  return {
    order_label: '17',
    station: STATION_TITLES[station],
    created_at: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
    staff_name: 'Тест',
    note: 'тестовий друк',
    receipt_number: null,
    items: [
      { name: 'Латте', variant_label: 'M', quantity: 1, modifiers: ['вівсяне', 'без цукру'], note: 'гарячіше' },
      { name: 'Круасан', variant_label: '', quantity: 2, modifiers: [], note: null },
    ],
  };
}

interface StationPrinterSectionProps {
  station: Station;
  title: string;
  hint: string;
  printers: PrinterInfo[];
  selected: string | null;
  paperWidth: ReceiptPaperWidth;
  onSelect: (name: string) => void;
  onPaperWidth: (mm: ReceiptPaperWidth) => void;
  /** The bar only: forget its own printer and follow the kitchen's. */
  onFollowKitchen?: () => void;
  onTest: () => void;
  testing: boolean;
  testStatus: string | null;
}

/**
 * A station's printer (К3e): the same picker as the receipt printer's, minus
 * the PDF fallback — a kitchen ticket that is not printed is not a ticket.
 */
function StationPrinterSection({
  station,
  title,
  hint,
  printers,
  selected,
  paperWidth,
  onSelect,
  onPaperWidth,
  onFollowKitchen,
  onTest,
  testing,
  testStatus,
}: StationPrinterSectionProps) {
  return (
    <section className={CARD} data-testid={`station-printer-${station}`}>
      <CardTitle glyph={PrinterColor} title={title} hint={hint} />
      {printers.length === 0 && (
        <p className="text-[15px] text-sq-secondary mt-3">Принтерів не знайдено — див. «Принтер чеків».</p>
      )}
      <PrinterList printers={printers} selected={selected} onSelect={onSelect} />
      {selected && (
        <>
          <PaperWidthPicker value={paperWidth} onChange={onPaperWidth} />
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button type="button" onClick={onTest} disabled={testing} className="sq-btn-quiet">
              <Printer size={20} />
              {testing ? 'Друк…' : 'Тестовий тікет'}
            </button>
            {onFollowKitchen && (
              <button
                type="button"
                onClick={onFollowKitchen}
                className="min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
              >
                Той самий, що кухня
              </button>
            )}
            {testStatus && <span className="text-[15px] text-sq-secondary">{testStatus}</span>}
          </div>
        </>
      )}
    </section>
  );
}

// Till screens group their content in white cards on the grey page.
const CARD = 'rounded-card bg-sq-surface shadow-card p-5';

/** A card's head: colour glyph, title, and the sentence that says what it is for. */
function CardTitle({ glyph: Icon, title, hint }: { glyph: Glyph; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={24} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold text-sq-heading">{title}</h2>
        {hint && <p className="text-[15px] text-sq-secondary mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * The printers the OS reports, as a pick-one list: hairline rows with the
 * chosen one ticked, the way a Things list marks its selection.
 */
function PrinterList({
  printers,
  selected,
  onSelect,
}: {
  printers: PrinterInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (printers.length === 0) return null;
  return (
    <ul className="mt-3">
      {printers.map((printer) => {
        const on = selected === printer.name;
        return (
          <li key={printer.name} className="sq-row">
            <button
              type="button"
              onClick={() => onSelect(printer.name)}
              className={`w-full min-h-12 py-2 -mx-2 px-2 rounded-lg flex items-center gap-3 text-left hover:bg-sq-sidebar/60 ${
                on ? 'font-semibold' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base text-sq-text truncate">{printer.name}</span>
                {printer.is_default && (
                  <span className="block text-[13px] font-normal text-sq-muted">Системний за замовчуванням</span>
                )}
              </span>
              {on && <Check size={20} className="shrink-0 text-sq-blue" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Roll width, as the segmented control — touch-sized, since this is the till. */
function PaperWidthPicker({
  value,
  onChange,
}: {
  value: ReceiptPaperWidth;
  onChange: (mm: ReceiptPaperWidth) => void;
}) {
  return (
    <div className="mt-4 inline-flex gap-1 p-[3px] rounded-xl bg-sq-empty">
      {RECEIPT_PAPER_WIDTHS.map((mm) => (
        <button
          key={mm}
          type="button"
          onClick={() => onChange(mm)}
          className={`min-h-[42px] px-5 rounded-[9px] text-[15px] transition-colors ${
            value === mm
              ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
              : 'font-medium text-sq-secondary hover:text-sq-text'
          }`}
        >
          {mm} мм
        </button>
      ))}
    </div>
  );
}

function testReceipt(storeName: string): ReceiptData {
  return {
    store_name: storeName,
    kind: 'sale',
    receipt_number: 'ТЕСТ',
    refund_of_receipt: null,
    created_at: new Date().toLocaleString('uk-UA'),
    staff_name: 'Тест',
    customer_name: null,
    items: [
      {
        name: 'Тестовий товар',
        variant_label: 'M',
        quantity: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000,
      },
    ],
    subtotal_cents: 10000,
    discount_cents: null,
    total_cents: 10000,
    payments: [{ method: 'cash', amount_cents: 10000 }],
  };
}

// Colour glyphs: a device list row is a Things list row, glyph first.
const kindIcon = {
  scanner: ScanLine,
  printer: PrinterColor,
  unknown: Usb,
};

const kindLabel: Record<HardwareDevice['kind'], string> = {
  scanner: 'Сканер штрихкодів',
  printer: 'Принтер',
  unknown: 'Невідомий пристрій',
};

function formatId(value: number) {
  return value.toString(16).padStart(4, '0').toUpperCase();
}

export function HardwarePage() {
  const storeName = useAuthStore((s) => s.auth?.store.name) ?? '';
  // A café has a kitchen and a bar to send tickets to; nobody else does.
  const cafe = useVertical().id === 'cafe';
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>(DEFAULT_RECEIPT_PAPER_WIDTH);
  const [stationPrinters, setStationPrinters] = useState<Record<Station, string | null>>({
    kitchen: null,
    bar: null,
  });
  const [stationPaper, setStationPaper] = useState<Record<Station, ReceiptPaperWidth>>({
    kitchen: DEFAULT_RECEIPT_PAPER_WIDTH,
    bar: DEFAULT_RECEIPT_PAPER_WIDTH,
  });
  const [ticketTesting, setTicketTesting] = useState<Station | null>(null);
  const [ticketStatus, setTicketStatus] = useState<{ station: Station; text: string } | null>(null);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const updateInfo = useUpdateStore((s) => s.updateInfo);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listHardware()
      .then(setDevices)
      .catch(() => setError('Не вдалося отримати список обладнання.'))
      .finally(() => setLoading(false));
  }, []);

  const refreshPrinters = useCallback(() => {
    setPrintersLoading(true);
    setPrintersError(null);
    listPrinters()
      .then(setPrinters)
      .catch(() => setPrintersError('Не вдалося отримати список принтерів.'))
      .finally(() => setPrintersLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    refreshPrinters();
    void getMeta<string>(RECEIPT_PRINTER_META_KEY).then((name) => setSelectedPrinter(name ?? null));
    void getMeta<ReceiptPaperWidth>(RECEIPT_PAPER_META_KEY).then((mm) => {
      if (mm && RECEIPT_PAPER_WIDTHS.includes(mm)) setPaperWidth(mm);
    });
    for (const station of ['kitchen', 'bar'] as const) {
      void getMeta<string>(STATION_META[station].printer).then((name) =>
        setStationPrinters((prev) => ({ ...prev, [station]: typeof name === 'string' ? name : null }))
      );
      void getMeta<ReceiptPaperWidth>(STATION_META[station].paper).then((mm) => {
        if (mm && RECEIPT_PAPER_WIDTHS.includes(mm)) setStationPaper((prev) => ({ ...prev, [station]: mm }));
      });
    }
  }, [refresh, refreshPrinters]);

  function selectStationPrinter(station: Station, name: string | null) {
    setStationPrinters((prev) => ({ ...prev, [station]: name }));
    setTicketStatus(null);
    void setMeta(STATION_META[station].printer, name);
  }

  function selectStationPaper(station: Station, mm: ReceiptPaperWidth) {
    setStationPaper((prev) => ({ ...prev, [station]: mm }));
    setTicketStatus(null);
    void setMeta(STATION_META[station].paper, mm);
  }

  async function testTicket(station: Station) {
    const name = stationPrinters[station];
    if (!name) return;
    setTicketTesting(station);
    setTicketStatus(null);
    try {
      await printKitchenTicket(name, testKitchenTicket(station), stationPaper[station]);
      setTicketStatus({ station, text: 'Надіслано на друк' });
    } catch (e) {
      setTicketStatus({ station, text: `Помилка друку: ${typeof e === 'string' ? e : String(e)}` });
    } finally {
      setTicketTesting(null);
    }
  }

  function selectPrinter(name: string) {
    setSelectedPrinter(name);
    setTestStatus(null);
    void setMeta(RECEIPT_PRINTER_META_KEY, name);
  }

  function selectPaperWidth(mm: ReceiptPaperWidth) {
    setPaperWidth(mm);
    setTestStatus(null);
    void setMeta(RECEIPT_PAPER_META_KEY, mm);
  }

  // Resolves only on failure: a successful install restarts the app from
  // under us, so there is no success state to render.
  async function runUpdate() {
    setInstalling(true);
    setInstallError(null);
    try {
      await installUpdate();
    } catch (e) {
      setInstallError(typeof e === 'string' ? e : 'Не вдалося встановити оновлення.');
      setInstalling(false);
    }
  }

  async function testPrint() {
    if (!selectedPrinter) return;
    setTesting(true);
    setTestStatus(null);
    try {
      await printReceipt(selectedPrinter, testReceipt(storeName), paperWidth);
      setTestStatus('Надіслано на друк');
    } catch (e) {
      setTestStatus(`Помилка друку: ${typeof e === 'string' ? e : String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  const body = (
    <div className="flex-1 overflow-auto px-4 py-5 md:px-7 max-w-3xl mx-auto w-full space-y-4 text-sq-text">
      <div className="flex items-center justify-between gap-3 pb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <ScanLine size={24} className="shrink-0" />
            <h1 className="text-2xl font-bold text-sq-heading">Обладнання</h1>
          </div>
          <p className="text-[15px] text-sq-secondary mt-1">
            Пристрої, підключені до цього комп'ютера.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading} className="sq-btn-quiet shrink-0">
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          Оновити
        </button>
      </div>

      <section className={CARD}>
        <CardTitle glyph={Download} title="Версія програми" />
        {updateInfo?.update_available ? (
          <div className="mt-3 space-y-3">
            <p className="text-[15px]">
              Встановлено <span className="font-semibold tabular-nums">{updateInfo.current_version}</span>,
              доступна <span className="font-semibold tabular-nums text-sq-warning">{updateInfo.latest_version}</span>
            </p>
            {updateInfo.notes && (
              <p className="text-[13px] text-sq-muted whitespace-pre-line line-clamp-3">{updateInfo.notes}</p>
            )}
            {updateInfo.can_self_update ? (
              <button
                type="button"
                onClick={() => void runUpdate()}
                disabled={installing}
                className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-2"
              >
                {installing ? (
                  <RefreshCw size={20} className="animate-spin" />
                ) : (
                  <DownloadLine size={20} />
                )}
                {installing ? 'Встановлення… програма перезапуститься' : 'Встановити оновлення'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const url = updateInfo.download_url ?? updateInfo.release_url;
                  if (url) void openUrl(url);
                }}
                className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-2"
              >
                <DownloadLine size={20} />
                Завантажити оновлення
              </button>
            )}
            {installError && <p className="text-[13px] text-red-600">{installError}</p>}
          </div>
        ) : (
          <p className="text-[15px] text-sq-secondary mt-2">
            {updateInfo ? `Встановлено ${updateInfo.current_version} — актуальна версія.` : 'Перевірка версії…'}
          </p>
        )}
      </section>

      <section className={CARD}>
        <CardTitle glyph={Usb} title="Пристрої" />
        {error && <p className="text-[15px] text-red-600 mt-3">{error}</p>}

        {!loading && !error && devices.length === 0 && (
          <div className="py-6 flex flex-col items-center gap-2 text-center">
            <Usb size={48} />
            <p className="text-[15px] text-sq-secondary">Пристроїв не знайдено.</p>
          </div>
        )}

        {devices.length > 0 && (
          <ul className="mt-3">
            {devices.map((device, i) => {
              const Icon = kindIcon[device.kind];
              return (
                <li
                  key={`${device.vendor_id}-${device.product_id}-${i}`}
                  className="sq-row min-h-12 py-2 flex items-center gap-3"
                >
                  <Icon size={24} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-sq-text truncate">
                      {device.name ?? kindLabel[device.kind]}
                    </p>
                    <p className="text-[13px] text-sq-muted tabular-nums">
                      VID:PID {formatId(device.vendor_id)}:{formatId(device.product_id)}
                    </p>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      device.recognized ? 'bg-sq-success' : 'bg-sq-warning'
                    }`}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <CardTitle glyph={PrinterColor} title="Принтер чеків" hint="Оберіть, куди друкувати чеки продажу." />
          <button
            type="button"
            onClick={refreshPrinters}
            disabled={printersLoading}
            className="sq-btn-quiet shrink-0"
          >
            <RefreshCw size={20} className={printersLoading ? 'animate-spin' : ''} />
            Оновити
          </button>
        </div>

        {printersError && <p className="text-[15px] text-red-600 mt-3">{printersError}</p>}

        {!printersLoading && !printersError && printers.length === 0 && (
          <div className="pt-6 pb-2 flex flex-col items-center text-center">
            <PrinterColor size={48} />
            <p className="text-[15px] text-sq-secondary mt-3">
              Принтерів не знайдено. Встановіть принтер як системний і натисніть "Оновити".
            </p>
            <p className="text-[15px] text-sq-secondary mt-2 max-w-lg">
              Немає чекового принтера? Друкуйте чеки через системний діалог друку — оберіть "Зберегти
              як PDF" (на macOS і Windows цей варіант вбудований; на Linux залежить від дистрибутива).
            </p>
            <button
              type="button"
              onClick={() => printToPdf(testReceipt(storeName))}
              className="sq-btn-quiet mt-4"
            >
              <Printer size={20} />
              Тестовий друк у PDF
            </button>
          </div>
        )}

        <PrinterList printers={printers} selected={selectedPrinter} onSelect={selectPrinter} />

        {selectedPrinter && (
          <>
            <div className="mt-5">
              <p className="text-[15px] font-semibold text-sq-heading">Ширина стрічки</p>
              <p className="text-[15px] text-sq-secondary">
                Оберіть розмір рулону чекового принтера.
              </p>
              <PaperWidthPicker value={paperWidth} onChange={selectPaperWidth} />
            </div>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => void testPrint()} disabled={testing} className="sq-btn-quiet">
                <Printer size={20} />
                {testing ? 'Друк…' : 'Тестовий друк'}
              </button>
              {testStatus && <span className="text-[15px] text-sq-secondary">{testStatus}</span>}
            </div>
          </>
        )}
      </section>

      {cafe && (
        <>
          <StationPrinterSection
            station="kitchen"
            title="Принтер кухні"
            hint="Тікет кожного замовлення: без цін, з номером на весь рулон. Без нього тікети не друкуються."
            printers={printers}
            selected={stationPrinters.kitchen}
            paperWidth={stationPaper.kitchen}
            onSelect={(name) => selectStationPrinter('kitchen', name)}
            onPaperWidth={(mm) => selectStationPaper('kitchen', mm)}
            onTest={() => void testTicket('kitchen')}
            testing={ticketTesting === 'kitchen'}
            testStatus={ticketStatus?.station === 'kitchen' ? ticketStatus.text : null}
          />
          <StationPrinterSection
            station="bar"
            title="Принтер бару"
            hint="Напої з теґів зі станцією «Бар». Не обрано — друкуються на принтері кухні."
            printers={printers}
            selected={stationPrinters.bar}
            paperWidth={stationPaper.bar}
            onSelect={(name) => selectStationPrinter('bar', name)}
            onPaperWidth={(mm) => selectStationPaper('bar', mm)}
            onFollowKitchen={() => selectStationPrinter('bar', null)}
            onTest={() => void testTicket('bar')}
            testing={ticketTesting === 'bar'}
            testStatus={ticketStatus?.station === 'bar' ? ticketStatus.text : null}
          />
        </>
      )}
    </div>
  );

  return (
    <>
      {body}
      {printablePortal}
    </>
  );
}
