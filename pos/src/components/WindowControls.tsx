// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The three window buttons of the desktop till's login screen
// (TechDocs/POS_DESKTOP.md, «Вікно каси»). The release window is a kiosk —
// fullscreen, no frame, not closable — so without these there was no way out
// of it on Windows or Linux. They are drawn the way the system draws its own,
// where it puts them: the traffic lights on the left on macOS, Windows 11's
// caption buttons on the right, GNOME's round ones on the right on Linux.

import { useEffect, useState, type ReactNode } from 'react';
import {
  closeApp,
  desktopPlatform,
  minimizeWindow,
  toggleFullscreen,
  windowIsFullscreen,
  type DesktopPlatform,
} from '../lib/desktopWindow';

interface Labels {
  minimize: string;
  fullscreen: string;
  close: string;
}

function labelsFor(platform: DesktopPlatform, fullscreen: boolean): Labels {
  return {
    // A fullscreen window cannot be minimised on macOS: the till hides itself.
    minimize: platform === 'mac' ? 'Сховати касу' : 'Згорнути',
    fullscreen: fullscreen ? 'У вікні' : 'На весь екран',
    close: 'Закрити касу',
  };
}

interface ButtonProps {
  label: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
}

function WindowButton({ label, onClick, className, children }: ButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={className}>
      {children}
    </button>
  );
}

const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" fill="none">
    {children}
  </svg>
);

/** macOS: three 12 px lights on the left, their glyphs showing only under the pointer. */
function MacLights({ labels, fullscreen, act }: { labels: Labels; fullscreen: boolean; act: Actions }) {
  const light =
    'relative flex h-3 w-3 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sq-primary';
  const show = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100';
  return (
    <div className="group flex items-center gap-2 pl-3" data-platform="mac">
      <WindowButton
        label={labels.close}
        onClick={act.close}
        className={`${light} bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_#e2463f]`}
      >
        {svg(
          8,
          <g className={`${show} stroke-[rgba(0,0,0,.55)]`} strokeWidth={1.2} strokeLinecap="round">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
          </g>
        )}
      </WindowButton>
      <WindowButton
        label={labels.minimize}
        onClick={act.minimize}
        className={`${light} bg-[#febc2e] shadow-[inset_0_0_0_0.5px_#e1a116]`}
      >
        {svg(
          8,
          <g className={`${show} stroke-[rgba(0,0,0,.55)]`} strokeWidth={1.3} strokeLinecap="round">
            <path d="M1.5 4h5" />
          </g>
        )}
      </WindowButton>
      <WindowButton
        label={labels.fullscreen}
        onClick={act.fullscreen}
        className={`${light} bg-[#28c840] shadow-[inset_0_0_0_0.5px_#1aab29]`}
      >
        {svg(
          8,
          <g className={`${show} fill-[rgba(0,0,0,.55)]`}>
            {fullscreen ? (
              <path d="M4.3 0.8v2.9h2.9zM3.7 7.2V4.3H0.8z" />
            ) : (
              <path d="M1.2 1.2h4L1.2 5.2zM6.8 6.8h-4l4-4z" />
            )}
          </g>
        )}
      </WindowButton>
    </div>
  );
}

/** Windows 11: 46 × 32 caption buttons on the right; «✕» turns red under the pointer. */
function WindowsCaption({ labels, fullscreen, act }: { labels: Labels; fullscreen: boolean; act: Actions }) {
  const base =
    'flex h-8 w-[46px] items-center justify-center text-[#1a1a1a] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sq-primary';
  const glyph = (children: ReactNode) => (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1}>
      {children}
    </svg>
  );
  return (
    <div className="ml-auto flex" data-platform="windows">
      <WindowButton label={labels.minimize} onClick={act.minimize} className={`${base} hover:bg-black/[0.06]`}>
        {glyph(<path d="M0 5.5h10" />)}
      </WindowButton>
      <WindowButton label={labels.fullscreen} onClick={act.fullscreen} className={`${base} hover:bg-black/[0.06]`}>
        {glyph(
          fullscreen ? (
            <>
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
              <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
          )
        )}
      </WindowButton>
      <WindowButton
        label={labels.close}
        onClick={act.close}
        className={`${base} hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90`}
      >
        {glyph(<path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />)}
      </WindowButton>
    </div>
  );
}

/** GNOME (Adwaita): round grey 24 px buttons on the right with symbolic icons. */
function GnomeButtons({ labels, fullscreen, act }: { labels: Labels; fullscreen: boolean; act: Actions }) {
  const base =
    'flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.08] text-[#2e3436] transition-colors hover:bg-black/[0.14] active:bg-black/[0.2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sq-primary';
  const glyph = (children: ReactNode) => (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
  return (
    <div className="ml-auto flex items-center gap-3 pr-2.5" data-platform="linux">
      <WindowButton label={labels.minimize} onClick={act.minimize} className={base}>
        {glyph(<path d="M4.5 11.5h7" />)}
      </WindowButton>
      <WindowButton label={labels.fullscreen} onClick={act.fullscreen} className={base}>
        {glyph(
          fullscreen ? (
            <>
              <rect x="4.5" y="6.5" width="5" height="5" rx="1" />
              <path d="M6.5 4.5h4a1 1 0 0 1 1 1v4" />
            </>
          ) : (
            <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" />
          )
        )}
      </WindowButton>
      <WindowButton label={labels.close} onClick={act.close} className={base}>
        {glyph(<path d="M5 5l6 6M11 5l-6 6" />)}
      </WindowButton>
    </div>
  );
}

interface Actions {
  minimize: () => void;
  fullscreen: () => void;
  close: () => void;
}

export interface WindowControlsProps {
  /** Whose buttons to draw; the system the webview runs on unless a test or a screenshot says. */
  platform?: DesktopPlatform;
}

/**
 * A 32 px band across the top (under the licence strip, if one is shown) with
 * the window's buttons where that system keeps them. Only the desktop till's
 * login screen renders it (`LoginPage`); after sign-in the till is the kiosk again.
 */
export function WindowControls({ platform: forced }: WindowControlsProps) {
  const platform = forced ?? desktopPlatform();
  // A release till starts fullscreen; the window says for sure once asked.
  const [fullscreen, setFullscreen] = useState(true);

  useEffect(() => {
    let alive = true;
    void windowIsFullscreen().then((value) => {
      if (alive && value !== null) setFullscreen(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const act: Actions = {
    minimize: () => void minimizeWindow(),
    fullscreen: () =>
      void toggleFullscreen().then((value) => {
        if (value !== null) setFullscreen(value);
      }),
    close: () => void closeApp(),
  };
  const labels = labelsFor(platform, fullscreen);

  return (
    <div
      role="toolbar"
      aria-label="Вікно каси"
      data-testid="window-controls"
      className="fixed inset-x-0 z-40 flex h-8 items-center"
      style={{ top: 'var(--lic-h, 0px)' }}
    >
      {platform === 'mac' ? (
        <MacLights labels={labels} fullscreen={fullscreen} act={act} />
      ) : platform === 'windows' ? (
        <WindowsCaption labels={labels} fullscreen={fullscreen} act={act} />
      ) : (
        <GnomeButtons labels={labels} fullscreen={fullscreen} act={act} />
      )}
    </div>
  );
}
