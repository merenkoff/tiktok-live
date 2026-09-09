// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Link } from 'react-router-dom';
// Via the platform barrel, not a relative path: a host-local copy of the auth
// store would be a second, disconnected instance once `@pos/platform` is an
// external chunk.
import { useAuthStore } from '@pos/platform';
import { isOfflinePosEnabled, useOfflineStatus } from '../../offline';

export function OfflineStatusBanner() {
  const online = useOfflineStatus((s) => s.online);
  const pending = useOfflineStatus((s) => s.pending);
  const dead = useOfflineStatus((s) => s.dead);
  const syncing = useOfflineStatus((s) => s.syncing);
  const lastError = useOfflineStatus((s) => s.lastError);
  const fiscal = useAuthStore((s) => s.auth?.store.fiscal?.enabled ?? false);

  if (!isOfflinePosEnabled()) return null;

  // A fiscalising store cannot sell at all without a connection, so say it up
  // front rather than at the payment screen with a customer waiting.
  const blocked = !online && fiscal;
  if (online && pending === 0 && dead === 0 && !syncing && !lastError) return null;

  const parts: string[] = [];
  if (blocked) parts.push('Офлайн — продаж неможливий, магазин працює з ПРРО');
  else if (!online) parts.push('Офлайн');
  if (pending > 0) {
    parts.push(
      // A queued sale is registered in whatever shift is open when it finally
      // syncs, not the one it was rung in. Say so rather than let a Z-report
      // surprise the owner.
      fiscal
        ? `Очікує синк: ${pending} — буде зареєстровано поточною зміною ПРРО`
        : `Очікує синк: ${pending}`
    );
  }
  if (dead > 0) parts.push(`Не синхронізовано: ${dead}`);
  if (syncing) parts.push('Синхронізація…');
  if (lastError && (pending > 0 || dead > 0)) parts.push(lastError);

  const tone = dead > 0 || blocked ? 'bg-red-700' : 'bg-slate-800';

  return (
    <div className={`mx-3 mt-2 rounded-sq ${tone} text-white px-3 py-2 text-sm shrink-0`}>
      {parts.join(' · ')}
      {dead > 0 && (
        <Link to="/sales" className="ml-2 underline">
          Переглянути
        </Link>
      )}
    </div>
  );
}
