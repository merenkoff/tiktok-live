import { isOfflinePosEnabled, useOfflineStatus } from '../../offline';

export function OfflineStatusBanner() {
  const online = useOfflineStatus((s) => s.online);
  const pending = useOfflineStatus((s) => s.pending);
  const syncing = useOfflineStatus((s) => s.syncing);
  const lastError = useOfflineStatus((s) => s.lastError);

  if (!isOfflinePosEnabled()) return null;
  if (online && pending === 0 && !syncing && !lastError) return null;

  const parts: string[] = [];
  if (!online) parts.push('Офлайн');
  if (pending > 0) parts.push(`Очікує синк: ${pending}`);
  if (syncing) parts.push('Синхронізація…');
  if (lastError && pending > 0) parts.push(lastError);

  return (
    <div className="mx-3 mt-2 rounded-sq bg-slate-800 text-white px-3 py-2 text-sm shrink-0">
      {parts.join(' · ')}
    </div>
  );
}
