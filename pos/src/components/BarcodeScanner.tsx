import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode('pos-camera-reader');
    let cancelled = false;

    async function start() {
      if (started.current) return;
      started.current = true;
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 260, height: 140 } },
          (decoded) => {
            if (cancelled) return;
            void scanner.stop().finally(() => {
              onScan(decoded);
              onClose();
            });
          },
          () => undefined
        );
      } catch {
        if (!cancelled) {
          setError('Не вдалося відкрити камеру. Перевірте дозвіл у браузері.');
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (scanner.isScanning) {
        void scanner.stop().catch(() => undefined);
      }
    };
  }, [onClose, onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="bg-white rounded-sq p-4 w-full max-w-md space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Сканування камерою</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 text-sm text-sq-secondary hover:text-sq-text"
          >
            Закрити
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-600 py-6 text-center">{error}</p>
        ) : (
          <div id="pos-camera-reader" className="overflow-hidden rounded-sq" />
        )}
      </div>
    </div>
  );
}
