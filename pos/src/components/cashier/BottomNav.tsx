import { Grid3X3, ListOrdered, LogOut, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePosShell } from '../../shell';

interface Props {
  isOwner: boolean;
  onLogout: () => void;
}

export function BottomNav({ isOwner, onLogout }: Props) {
  const { pathname } = useLocation();
  const showAdmin = usePosShell() === 'web' && isOwner;
  const item = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center ${
      active ? 'text-sq-blue' : 'text-sq-secondary hover:text-sq-text'
    }`;

  return (
    <nav className="h-14 border-t border-sq-divider bg-white flex items-stretch px-2">
      <Link to="/register" className={item(pathname.startsWith('/register'))}>
        <Grid3X3 size={20} strokeWidth={1.75} />
        <span className="text-[11px] mt-0.5 font-medium">Каса</span>
      </Link>
      <Link to="/customers" className={item(pathname.startsWith('/customers'))}>
        <Users size={20} strokeWidth={1.75} />
        <span className="text-[11px] mt-0.5">Клієнти</span>
      </Link>
      {showAdmin && (
        <Link to="/admin/sales" className={item(pathname.startsWith('/admin/sales'))}>
          <ListOrdered size={20} strokeWidth={1.75} />
          <span className="text-[11px] mt-0.5">Продажі</span>
        </Link>
      )}
      <button type="button" onClick={onLogout} className={item(false)}>
        <LogOut size={20} strokeWidth={1.75} />
        <span className="text-[11px] mt-0.5">Вихід</span>
      </button>
    </nav>
  );
}
