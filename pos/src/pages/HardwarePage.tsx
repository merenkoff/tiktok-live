import { useCallback, useEffect, useState } from 'react';
import { Printer, RefreshCw, ScanLine, Usb } from 'lucide-react';
import { HardwareDevice, listHardware } from '../lib/hardware';
import { useAuthStore } from '../hooks/useAuth';
import { AppRail } from '../components/cashier/AppRail';
import { BottomNav } from '../components/cashier/BottomNav';
import { OfflineStatusBanner } from '../components/cashier/OfflineStatusBanner';

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
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listHardware()
      .then(setDevices)
      .catch(() => setError('Не вдалося отримати список обладнання.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    </div>
  );
}
