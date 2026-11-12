// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Link } from 'react-router-dom';
import type { MenuChangeRow } from '../data/menuChangesApi';
import { actionWord, authorOf, describeChange, whenText } from '../lib/menuChangeWords';

/**
 * Rows of the menu journal: when, who, what happened and each changed field.
 * `showName` names the card or group — the store-wide page needs it, the
 * card's own history does not.
 */
export function MenuChangesList({ rows, showName }: { rows: MenuChangeRow[]; showName: boolean }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id} className="sq-row py-2.5 block" data-testid="menu-change">
          <div className="text-[13px] text-sq-muted tabular-nums">
            {whenText(row.created_at)} · {authorOf(row)}
          </div>
          <div className="text-base text-sq-text">
            {showName &&
              (row.entity === 'product' ? (
                <Link to={`/admin/products/${row.entity_id}`} className="font-medium text-sq-blue">
                  {row.entity_name}
                </Link>
              ) : (
                <Link to="/admin/modifiers" className="font-medium text-sq-blue">
                  Модифікатор «{row.entity_name}»
                </Link>
              ))}
            {showName && ' — '}
            <span className="font-medium">{actionWord(row.action)}</span>
          </div>
          {row.changes.length > 0 && (
            <ul className="mt-0.5 text-[14px] text-sq-secondary list-disc pl-5">
              {row.changes.map((change, i) => (
                <li key={i} className="break-words">
                  {describeChange(change)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
