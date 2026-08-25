import { useCallback, useEffect, useState } from 'react';
import { Download, Printer, RefreshCw, ScanLine, Usb } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { HardwareDevice, listHardware } from '../lib/hardware';
import { PrinterInfo, listPrinters, printReceipt } from '../lib/printer';
import { usePrintableReceipt } from '../hooks/usePrintableReceipt';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { getMeta, setMeta } from '../offline/db';
import { useAuthStore } from '../hooks/useAuth';
import { AppRail } from '../components/cashier/AppRail';
import { BottomNav } from '../components/cashier/BottomNav';
import { OfflineStatusBanner } from '../components/cashier/OfflineStatusBanner';

const RECEIPT_PRINTER_META_KEY = 'receiptPrinterName';

function testReceipt(storeName: string) {
  return {
    store_name: storeName,
    receipt_number: 'ТЕСТ',
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

const kindIcon = {
  scanner: ScanLine,
  printer: Printer,
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
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role());
  const storeName = useAuthStore((s) => s.auth?.store.name) ?? '';
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const updateInfo = useUpdateStore((s) => s.updateInfo);

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
  }, [refresh, refreshPrinters]);

  function selectPrinter(name: string) {
    setSelectedPrinter(name);
    setTestStatus(null);
    void setMeta(RECEIPT_PRINTER_META_KEY, name);
  }

  async function testPrint() {
    if (!selectedPrinter) return;
    setTesting(true);
    setTestStatus(null);
    try {
      await printReceipt(selectedPrinter, testReceipt(storeName));
      setTestStatus('Надіслано на друк');
    } catch {
      setTestStatus('Помилка друку');
    } finally {
      setTesting(false);
    }
  }

  const body = (
    <div className="flex-1 overflow-auto p-4 max-w-3xl mx-auto w-full space-y-6 text-sq-text">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Обладнання</h1>
          <p className="text-sq-secondary mt-1 text-sm">
            Пристрої, підключені до цього комп'ютера.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="min-h-11 px-3 flex items-center gap-2 text-sm text-sq-secondary hover:text-sq-text disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Оновити
        </button>
      </div>

      <div className="bg-sq-surface border border-sq-divider rounded-sq p-4">
        <p className="sq-section-label">Версія програми</p>
        {updateInfo?.update_available ? (
          <div className="mt-1 space-y-2">
            <p className="text-sm">
              Встановлено <span className="font-medium">{updateInfo.current_version}</span>,
              доступна <span className="font-medium text-amber-600">{updateInfo.latest_version}</span>
            </p>
            {updateInfo.notes && (
              <p className="text-xs text-sq-muted whitespace-pre-line line-clamp-3">{updateInfo.notes}</p>
            )}
            <button
              type="button"
              onClick={() => {
                const url = updateInfo.download_url ?? updateInfo.release_url;
                if (url) void openUrl(url);
              }}
              className="min-h-11 px-4 flex items-center gap-2 text-sm font-medium text-sq-blue"
            >
              <Download size={16} />
              Завантажити оновлення
            </button>
          </div>
        ) : (
          <p className="text-sm text-sq-secondary mt-1">
            {updateInfo ? `Встановлено ${updateInfo.current_version} — актуальна версія.` : 'Перевірка версії…'}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && devices.length === 0 && (
        <p className="text-sm text-sq-secondary py-6 text-center bg-sq-surface border border-sq-divider rounded-sq">
          Пристроїв не знайдено.
        </p>
      )}

      <ul className="space-y-2">
        {devices.map((device, i) => {
          const Icon = kindIcon[device.kind];
          return (
            <li
              key={`${device.vendor_id}-${device.product_id}-${i}`}
              className="flex items-center gap-3 bg-sq-surface border border-sq-divider rounded-sq p-4"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  device.recognized ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden
              />
              <Icon size={20} className="text-sq-secondary shrink-0" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {device.name ?? kindLabel[device.kind]}
                </p>
                <p className="text-xs text-sq-muted">
                  VID:PID {formatId(device.vendor_id)}:{formatId(device.product_id)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="sq-section-label">Принтер чеків</p>
            <p className="text-sq-secondary text-sm">Оберіть, куди друкувати чеки продажу.</p>
          </div>
          <button
            type="button"
            onClick={refreshPrinters}
            disabled={printersLoading}
            className="min-h-11 px-3 flex items-center gap-2 text-sm text-sq-secondary hover:text-sq-text disabled:opacity-50"
          >
            <RefreshCw size={16} className={printersLoading ? 'animate-spin' : ''} />
            Оновити
          </button>
        </div>

        {printersError && <p className="text-sm text-red-600 mt-2">{printersError}</p>}

        {!printersLoading && !printersError && printers.length === 0 && (
          <div className="py-6 text-center bg-sq-surface border border-sq-divider rounded-sq mt-2 px-4">
            <p className="text-sm text-sq-secondary">
              Принтерів не знайдено. Встановіть принтер як системний і натисніть "Оновити".
            </p>
            <p className="text-sm text-sq-secondary mt-2">
              Немає чекового принтера? Друкуйте чеки через системний діалог друку — оберіть "Зберегти
              як PDF" (на macOS і Windows цей варіант вбудований; на Linux залежить від дистрибутива).
            </p>
            <button
              type="button"
              onClick={() => printToPdf(testReceipt(storeName))}
              className="mt-3 min-h-11 px-4 text-sm font-medium text-sq-blue"
            >
              Тестовий друк у PDF
            </button>
          </div>
        )}

        <ul className="space-y-2 mt-2">
          {printers.map((printer) => (
            <li key={printer.name}>
              <button
                type="button"
                onClick={() => selectPrinter(printer.name)}
                className={`w-full flex items-center gap-3 border rounded-sq p-4 text-left ${
                  selectedPrinter === printer.name
                    ? 'border-sq-blue bg-sq-surface'
                    : 'border-sq-divider bg-sq-surface'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    selectedPrinter === printer.name ? 'bg-sq-blue' : 'bg-sq-muted'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{printer.name}</span>
                  {printer.is_default && (
                    <span className="block text-xs text-sq-muted">Системний за замовчуванням</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selectedPrinter && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void testPrint()}
              disabled={testing}
              className="min-h-11 px-4 text-sm font-medium text-sq-blue disabled:opacity-50"
            >
              {testing ? 'Друк…' : 'Тестовий друк'}
            </button>
            {testStatus && <span className="text-sm text-sq-secondary">{testStatus}</span>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] flex bg-sq-bg font-sans overflow-hidden">
      <AppRail isOwner={role === 'owner'} onLogout={() => void logout()} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <OfflineStatusBanner />
        {body}
        <div className="lg:hidden shrink-0">
          <BottomNav isOwner={role === 'owner'} onLogout={() => void logout()} />
        </div>
      </div>
      {printablePortal}
    </div>
  );
}
