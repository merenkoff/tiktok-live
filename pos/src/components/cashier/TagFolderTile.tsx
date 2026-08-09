import { Folder } from 'lucide-react';

interface Props {
  name: string;
  onClick: () => void;
}

/** Cool slate folder tile — distinct from primary CTA blue */
export function TagFolderTile({ name, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pos-folder-tile aspect-square flex flex-col items-center justify-center gap-2 px-2"
    >
      <Folder size={28} strokeWidth={1.5} color="#3D5266" />
      <span className="text-[13px] font-medium text-center leading-tight line-clamp-2 text-[#3D5266]">
        {name}
      </span>
    </button>
  );
}
