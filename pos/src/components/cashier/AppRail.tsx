import { Grid3X3, ListOrdered, LogOut, Package, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePosShell } from '../../shell';

interface Props {
  isOwner: boolean;
  onLogout: () => void;
}

export function AppRail({ isOwner, onLogout }: Props) {
  const { pathname } = useLocation();
  const showAdmin = usePosShell() === 'web' && isOwner;

  const itemClass = (active: boolean) =>
    `w-12 h-12 grid place-items-center rounded-sq transition-colors ${
      active ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
    }`;

  return (
    <nav
      className="hidden lg:flex w-14 shrink-0 flex-col items-center py-3 bg-[#1A1A1A] text-white"
      aria-label="Меню каси"
    >
      <div className="flex flex-col items-center gap-1 flex-1">
        <Link to="/register" className={itemClass(pathname.startsWith('/register'))} title="Каса">
          <Grid3X3 size={22} strokeWidth={1.75} />
        </Link>
        <Link
          to="/customers"
          className={itemClass(pathname.startsWith('/customers'))}
          title="Клієнти"
        >
          <Users size={22} strokeWidth={1.75} />
        </Link>
        {showAdmin && (
          <>
            <Link
              to="/admin/sales"
              className={itemClass(pathname.startsWith('/admin/sales'))}
              title="Продажі"
            >
              <ListOrdered size={22} strokeWidth={1.75} />
            </Link>
            <Link
              to="/admin/products"
              className={itemClass(pathname.startsWith('/admin/products'))}
              title="Товари"
            >
              <Package size={22} strokeWidth={1.75} />
            </Link>
          </>
        )}
      </div>
      <button type="button" onClick={onLogout} className={itemClass(false)} title="Вихід">
        <LogOut size={22} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
