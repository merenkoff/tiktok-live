// admin/src/components/SessionControl.tsx

interface SessionControlProps {
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
}

export function SessionControl({
  isActive,
  onStart,
  onStop,
  isStarting,
  isStopping,
}: SessionControlProps) {
  return (
    <div className="flex gap-4">
      {!isActive ? (
        <button
          onClick={onStart}
          disabled={isStarting}
          className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg hover:shadow-xl"
        >
          {isStarting ? '⏳ Starting...' : '▶ Start Session'}
        </button>
      ) : (
        <button
          onClick={onStop}
          disabled={isStopping}
          className="px-8 py-3 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg hover:shadow-xl"
        >
          {isStopping ? '⏳ Stopping...' : '■ Stop Session'}
        </button>
      )}
    </div>
  );
}
