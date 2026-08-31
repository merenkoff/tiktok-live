interface Props {
  src: string;
  alt: string;
  dark?: boolean;
  accentClass?: string; // border/glow accent, e.g. 'border-pos/30'
}

/** Wraps a real product screenshot in a plain browser-window chrome. */
export function BrowserFrame({ src, alt, dark, accentClass = 'border-line' }: Props) {
  return (
    <div className={`rounded-card overflow-hidden border shadow-xl ${accentClass} ${dark ? 'bg-[#0B0B0F]' : 'bg-paper'}`}>
      <div className={`flex items-center gap-1.5 px-4 py-3 ${dark ? 'bg-[#151519]' : 'bg-mist'}`}>
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
      </div>
      <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
    </div>
  );
}
