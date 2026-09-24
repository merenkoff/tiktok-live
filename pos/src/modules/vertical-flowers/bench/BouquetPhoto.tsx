// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Photographing the finished bouquet (`TechDocs/POS_FLORIST_BENCH.md` §11.3).
 *
 * The printed tag ties the flowers in the bucket to the card in the database;
 * the photo is what lets a cashier pick the right one out of a window holding
 * two similar bouquets when the tag has come unstuck.
 *
 * **Two capture paths, because one is not enough.** On a tablet
 * `<input capture="environment">` opens the native camera in a single tap, with
 * no permission dance and no viewfinder to build. Inside the Tauri webview that
 * attribute is ignored and the same input opens a *file picker*, which is
 * useless standing at a counter — so there, `getUserMedia` + a `<canvas>` grab,
 * the same API `BarcodeScanner` already uses (so the webview permission is
 * known to work and no new Tauri command is needed).
 *
 * Nothing here belongs in `@pos/platform`: no other module needs it yet, and
 * `ProductPhotoField` — which does live there — posts to the owner-only
 * `/uploads` and has no camera.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from '@pos/platform/ui';
import { api, assetUrl } from '@pos/platform';

/**
 * Long edge of the stored picture.
 *
 * NOT cosmetic. A tablet camera frame is 3–8 MB and the server's limit is 5 MB,
 * so without downscaling a florist gets «Файл більше 5 МБ» for a perfectly
 * ordinary photo — the exact case this phase exists for. 1280 px at q0.8 lands
 * around 200–400 kB and is more than a 56 px thumbnail and a full-screen
 * preview will ever need.
 */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

/** Downscale to a JPEG the upload limit cannot reject. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough: re-encoding would only lose detail for nothing.
    if (scale === 1 && file.type === 'image/jpeg') return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) return file;
    return new File([blob], 'bouquet.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function BouquetPhoto({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stopLive = useCallback(() => {
    setLive((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  // The camera light staying on after the sheet closes is the kind of thing a
  // shop notices and does not forgive.
  useEffect(() => stopLive, [stopLive]);

  useEffect(() => {
    if (live && videoRef.current) videoRef.current.srcObject = live;
  }, [live]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const { url } = await api.uploadBouquetPhoto(await shrink(file));
        onChange(url);
      } catch (err) {
        const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        setError(sent || 'Не вдалося завантажити фото');
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onChange]
  );

  async function openCamera(): Promise<void> {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setLive(stream);
    } catch {
      // No camera, or the permission was refused: fall back to the picker
      // rather than dead-ending. On a tablet this is the native camera anyway.
      inputRef.current?.click();
    }
  }

  async function grabFrame(): Promise<void> {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    stopLive();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (blob) await upload(new File([blob], 'bouquet.jpg', { type: 'image/jpeg' }));
  }

  return (
    <div className="space-y-2" data-testid="bouquet-photo">
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden grid place-items-center shrink-0">
          {value ? (
            <img src={assetUrl(value) ?? undefined} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus size={40} className="text-sq-muted" />
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            // A tablet reads this as "open the back camera"; the desktop
            // webview ignores it, which is why `openCamera` exists.
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            data-testid="bouquet-photo-input"
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void openCamera()}
            className="min-h-11 px-3 rounded-sq border border-sq-divider text-sm flex items-center gap-2 disabled:opacity-50"
            data-testid="bouquet-photo-shoot"
          >
            <Camera size={16} />
            {busy ? 'Завантаження…' : value ? 'Зняти ще раз' : 'Зняти букет'}
          </button>
          {value && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 text-sm text-red-600 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Прибрати
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600" data-testid="bouquet-photo-error">
          {error}
        </p>
      )}

      {live && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 min-h-0 w-full object-contain"
          />
          <div className="p-4 flex items-center gap-3 bg-black">
            <button
              type="button"
              onClick={stopLive}
              className="min-h-12 px-4 rounded-sq border border-white/30 text-white"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={() => void grabFrame()}
              className="sq-btn-primary min-h-12 flex-1"
              data-testid="bouquet-photo-capture"
            >
              Зняти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
