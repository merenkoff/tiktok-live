// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { formatDecimal, parseDecimal } from '../lib/stockUnits';

type Props = {
  /** The number the box stands for, in whatever it counts — kilograms, packs. */
  value: number;
  /** Called on every keystroke with what the text means now; an empty box is 0. */
  onValue: (n: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

/**
 * The quantity box of a row counted in kilograms or litres: a text box with a
 * decimal keyboard rather than `type="number"`. A number box drops the comma
 * a Ukrainian types whenever the browser's own language is not Ukrainian —
 * «20,5» arrives as 205 — and a weight ten times too big is a delivery that
 * never balances. The product card reads weights the same way
 * (`parseWeightInput`). The box keeps the text while it is typed («20,»
 * stays «20,») and hands its owner the number; a value changed from outside
 * — the pack toggle — replaces the text.
 */
export function DecimalInput({ value, onValue, ...rest }: Props) {
  const [text, setText] = useState(() => formatDecimal(value));

  useEffect(() => {
    setText((current) => ((parseDecimal(current) ?? 0) === value ? current : formatDecimal(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onValue(parseDecimal(e.target.value) ?? 0);
      }}
    />
  );
}

/**
 * A row's quantity box: `DecimalInput` for a weighed row, and for any other
 * the number box it always had — so a clothing shop's screens do not change.
 */
export function QuantityBox({
  weighed,
  value,
  onValue,
  min,
  step,
  ...rest
}: Props & { weighed: boolean; min?: number; step?: string }) {
  if (weighed) return <DecimalInput value={value} onValue={onValue} {...rest} />;
  return (
    <input
      {...rest}
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(e) => onValue(Number(e.target.value))}
    />
  );
}
