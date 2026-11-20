// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { TechCardSheet } from '../lib/techCardSheet';

/**
 * The tech card on a sheet of paper, for the kitchen.
 *
 * Rendered off-screen and shown only to the print engine, like the receipt
 * and the refund act. It borrows the act's sheet — `.act-print-area` and its
 * table in the host's `tokens.css` — on purpose: that class is what the print
 * rules already let through while they hide the app around it, so a module
 * built as a remote prints with no rule of its own, and an A4 sheet with a
 * ruled table is exactly what a tech card is too.
 *
 * Weights only. The purchase prices stay on the screen.
 */
export function TechCardPrintable({ sheet }: { sheet: TechCardSheet | null }) {
  if (!sheet) return null;
  return (
    <div className="act-print-area" data-testid="tech-card-printable">
      <p className="act-print-store">{sheet.store}</p>
      <h1 className="act-print-title">Технологічна карта</h1>
      <p className="act-print-meta">
        {sheet.title}
        {sheet.size ? ` · ${sheet.size}` : ''} · на 1 порцію · {sheet.date}
      </p>
      <table className="act-print-table">
        <thead>
          <tr>
            <th>Складник</th>
            {/* The second and third columns are the right-aligned ones of the sheet. */}
            <th>{sheet.lossy ? 'Брутто' : 'Кількість'}</th>
            {sheet.lossy && <th>Нетто</th>}
            {sheet.lossy && <th>Втрати, %</th>}
          </tr>
        </thead>
        <tbody>
          {sheet.lines.map((line, index) => (
            <tr key={index}>
              <td>
                {line.caption}
                {line.prep ? ' (заготовка)' : ''}
              </td>
              <td>
                {line.gross} {line.unit}
              </td>
              {sheet.lossy && (
                <td>
                  {line.net} {line.unit}
                </td>
              )}
              {sheet.lossy && <td>{line.loss}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {sheet.yield && <p className="act-print-total">Вихід: {sheet.yield}</p>}
    </div>
  );
}
