// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useId } from 'react';

/**
 * The LiveShop app icon (design/app-icon/app-icon.svg): a white receipt on the
 * POS-blue squircle. Drawn inline rather than as an <img> so the header mark is
 * crisp at any size and costs no request; the ids are per-instance because the
 * header and the footer both draw it.
 */
export function AppIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  const u = useId().replace(/:/g, '');
  const paper = 'M29 83V22q0-6 6-6h30q6 0 6 6v61l-5.25-4-5.25 4-5.25-4L50 83l-5.25-4-5.25 4-5.25-4Z';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3D8EFF" />
          <stop offset="1" stopColor="#0052D1" />
        </linearGradient>
        <linearGradient id={`${u}pp`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E8ECF2" />
        </linearGradient>
        <linearGradient id={`${u}gl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".28" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22.5" fill={`url(#${u}bg)`} />
      <rect x="1" y="1" width="98" height="50" rx="21.5" fill={`url(#${u}gl)`} />
      <path d={paper} fill="#00307A" fillOpacity=".28" transform="translate(0 3)" />
      <path d={paper} fill={`url(#${u}pp)`} />
      <rect x="37" y="28" width="20" height="5" rx="2.5" fill="#C3CAD5" />
      <rect x="37" y="39" width="26" height="5" rx="2.5" fill="#D7DCE3" />
      <rect x="37" y="50" width="16" height="5" rx="2.5" fill="#D7DCE3" />
      <rect x="37" y="62" width="26" height="7" rx="3.5" fill="#303336" />
    </svg>
  );
}
