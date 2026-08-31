import { useEffect, useState } from 'react';

export type DetectedOs = 'windows' | 'mac' | 'linux' | null;

// Ported from public/app.js initDownloadOsDetect() — highlights the
// download card that matches the visitor's OS.
export function useOsDetect(): DetectedOs {
  const [os, setOs] = useState<DetectedOs>(null);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';

    if (/Win/i.test(platform) || /Windows/i.test(ua)) {
      setOs('windows');
    } else if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
      setOs('mac');
    } else if (/Linux/i.test(platform) && !/Android/i.test(ua)) {
      setOs('linux');
    }
  }, []);

  return os;
}
