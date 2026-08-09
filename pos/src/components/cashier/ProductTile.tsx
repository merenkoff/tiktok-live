import { formatUah } from '../../lib/money';
import { assetUrl } from '../../lib/urls';

interface Props {
  name: string;
  subtitle?: string;
  priceCents?: number;
  imageUrl?: string | null;
  stock?: number;
  onClick: () => void;
  disabled?: boolean;
}

export function ProductTile({
  name,
  subtitle,
  priceCents,
  imageUrl,
  stock,
  onClick,
  disabled,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-center bg-white border border-sq-divider rounded-sq overflow-hidden hover:border-sq-blue/60 transition-colors disabled:cursor-not-allowed"
    >
      <div className="aspect-square bg-sq-empty">
        {imageUrl ? (
          <img src={assetUrl(imageUrl) ?? undefined} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-sq-secondary text-xs px-2 font-medium">
            {subtitle || ' '}
          </div>
        )}
      </div>
      <div className="px-1.5 py-2 bg-white text-left">
        <p className="text-[13px] leading-tight font-medium text-sq-text line-clamp-2">{name}</p>
        {priceCents != null && (
          <p className="text-xs text-sq-secondary mt-0.5">{formatUah(priceCents)}</p>
        )}
        {stock != null && (
          <p className={`text-[11px] mt-0.5 ${stock > 0 ? 'text-sq-secondary' : 'text-red-600'}`}>
            {stock > 0 ? `${stock} шт` : 'немає'}
          </p>
        )}
      </div>
    </button>
  );
}
