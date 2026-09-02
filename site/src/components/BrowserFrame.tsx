interface VideoSources {
  mp4: string;
  webm: string;
  poster: string;
}

interface Props {
  src?: string; // required unless `video` is set
  alt: string;
  dark?: boolean;
  accentClass?: string; // border/glow accent, e.g. 'border-pos/30'
  elevated?: boolean; // heavier "resting on a surface" shadow — opt-in, hero visuals only
  video?: VideoSources; // when set, renders a looping muted video instead of the static <img>
}

/** Wraps a real product screenshot (or a real screen-recording) in a plain browser-window chrome. */
export function BrowserFrame({ src, alt, dark, accentClass = 'border-line', elevated, video }: Props) {
  return (
    <div
      className={`rounded-card overflow-hidden border ${elevated ? 'shadow-ambient' : 'shadow-xl'} ${accentClass} ${dark ? 'bg-[#0B0B0F]' : 'bg-paper'}`}
    >
      <div className={`flex items-center gap-1.5 px-4 py-3 ${dark ? 'bg-[#151519]' : 'bg-mist'}`}>
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
      </div>
      {video ? (
        <video className="w-full h-auto block" autoPlay muted loop playsInline poster={video.poster}>
          <source src={video.webm} type="video/webm" />
          <source src={video.mp4} type="video/mp4" />
          <img src={video.poster} alt={alt} className="w-full h-auto block" loading="lazy" />
        </video>
      ) : (
        <img src={src ?? ''} alt={alt} className="w-full h-auto block" loading="lazy" />
      )}
    </div>
  );
}
