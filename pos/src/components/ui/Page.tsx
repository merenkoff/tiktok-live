// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The three pieces every owner screen is built from, in Things' voice: the
// page title with its colour glyph, a blue section head over a hairline, and
// the segmented control. Exported through `@pos/platform/ui` so a module's
// screen reads like the host's without copying markup.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, type Glyph } from '../../platform/glyphs';

export interface PageHeaderProps {
  title: ReactNode;
  /** A colour glyph, drawn at 32. */
  glyph?: Glyph;
  subtitle?: ReactNode;
  /** Buttons on the right of the title row. */
  actions?: ReactNode;
  /** «← Склад» above the title, for a page one level down. */
  back?: { to: string; label: string };
}

export function PageHeader({ title, glyph: Icon, subtitle, actions, back }: PageHeaderProps) {
  return (
    <header className="mb-7 space-y-1.5" data-testid="page-header">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue"
        >
          <ArrowLeft size={20} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {Icon && <Icon size={32} className="shrink-0" />}
        <h2 className="text-[30px] font-bold text-sq-heading leading-tight">{title}</h2>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <div className="text-[15px] text-sq-secondary max-w-3xl leading-relaxed">{subtitle}</div>}
    </header>
  );
}

export interface SectionHeadProps {
  title: ReactNode;
  /** A quiet number after the title. */
  count?: number;
  /** A link or button on the right, in the same blue. */
  action?: ReactNode;
}

/** Things' section title: blue, bold, a hairline under it. */
export function SectionHead({ title, count, action }: SectionHeadProps) {
  return (
    <div className="flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
      <h3 className="flex items-baseline gap-2 text-[15px] font-bold text-sq-blue">
        {title}
        {count != null && <span className="text-[13px] font-normal text-sq-muted tabular-nums">{count}</span>}
      </h3>
      {action && <div className="text-[15px] font-semibold text-sq-blue">{action}</div>}
    </div>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; testId?: string }>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** `w-full` in a dialog, where the track spans the panel and the choices share it. */
  className?: string;
}

/** A row of choices on a grey track; the chosen one is a white chip. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, className = '' }: SegmentedProps<T>) {
  const fill = className.includes('w-full');
  return (
    <div
      className={`inline-flex max-w-full overflow-x-auto gap-1 p-[3px] rounded-xl bg-sq-empty ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            data-testid={o.testId}
            className={`min-h-[34px] px-3.5 rounded-[9px] text-[15px] whitespace-nowrap transition-colors ${fill ? 'flex-1' : ''} ${
              on
                ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                : 'font-medium text-sq-secondary hover:text-sq-text'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
