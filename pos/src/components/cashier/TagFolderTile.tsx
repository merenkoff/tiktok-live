import { Folder } from 'lucide-react';
import { resolveTagColorHex } from '../../lib/tagColors';

interface Props {
  name: string;
  color?: string | null;
  onClick: () => void;
}

/** Colored Square-style folder tile — icon top-left, label bottom-left */
export function TagFolderTile({ name, color, onClick }: Props) {
  const bg = resolveTagColorHex(color);

  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square rounded-sq overflow-hidden relative text-left p-2.5 hover:brightness-110 transition-[filter]"
      style={{ backgroundColor: bg }}
    >
      <Folder size={22} strokeWidth={1.75} className="text-white/95 absolute top-2.5 left-2.5" />
      <span className="absolute bottom-2.5 left-2.5 right-2 text-[13px] font-medium leading-tight line-clamp-2 text-white">
        {name}
      </span>
    </button>
  );
}
