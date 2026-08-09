import { Grid3X3, ListOrdered, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  isOwner: boolean;
  onLogout: () => void;
}

export function BottomNav({ isOwner, onLogout }: Props) {
  return (
    <nav className="h-14 border-t border-sq-divider bg-white flex items-stretch px-2">
      <div className="flex-1 flex flex-col items-center justify-center text-sq-blue">
        <Grid3X3 size={20} strokeWidth={1.75} />
        <span className="text-[11px] mt-0.5 font-medium">Каса</span>
      </div>
      {isOwner && (
        <Link
          to="/admin/sales"
          className="flex-1 flex flex-col items-center justify-center text-sq-secondary hover:text-sq-text"
        >
          <ListOrdered size={20} strokeWidth={1.75} />
          <span className="text-[11px] mt-0.5">Продажі</span>
        </Link>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="flex-1 flex flex-col items-center justify-center text-sq-secondary hover:text-sq-text"
      >
        <LogOut size={20} strokeWidth={1.75} />
        <span className="text-[11px] mt-0.5">Вихід</span>
      </button>
    </nav>
  );
}
