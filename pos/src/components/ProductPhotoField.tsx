// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { assetUrl } from '../lib/urls';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}

export function ProductPhotoField({ value, onChange, label = 'Фото' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.uploadProductImage(file);
      onChange(url);
    } catch (err) {
      const message =
        typeof err === 'object' &&
        err &&
        'response' in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Не вдалося завантажити фото';
      setError(message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-xs font-semibold text-sq-secondary">{label}</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-28 h-28 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden grid place-items-center shrink-0">
          {value ? (
            <img src={assetUrl(value) ?? undefined} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus size={28} className="text-sq-muted" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="sq-btn-primary px-3 py-2 text-sm w-fit"
          >
            {uploading ? 'Завантаження…' : value ? 'Змінити фото' : 'Додати фото'}
          </button>
          {value && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 w-fit"
            >
              <Trash2 size={14} />
              Прибрати
            </button>
          )}
          <p className="text-xs text-sq-muted">JPEG, PNG, WebP або GIF · до 5 МБ</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
