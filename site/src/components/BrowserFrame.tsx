import { useEffect, useRef } from 'react';

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

/** Wraps a real product screenshot (or a real screen-recording) in a quiet window chrome, the way Things frames its app. */
export function BrowserFrame({ src, alt, dark, accentClass = 'border-line', elevated, video }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // React sets `muted` as a property, not an attribute, so the prerendered
  // <video> is unmuted until hydration and autoplay gets blocked. Kick it here.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => {});
  }, []);

  return (
    <div
      className={`rounded-[14px] overflow-hidden ${elevated ? 'shadow-ambient' : 'shadow-card'} ${accentClass} ${dark ? 'bg-[#1F2226]' : 'bg-paper'}`}
    >
      <div className={`flex items-center gap-2 px-3.5 h-9 ${dark ? 'bg-[#2A2E33]' : 'bg-side border-b border-line'}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-3 h-3 rounded-full ring-1 ring-inset ${dark ? 'ring-white/25' : 'ring-[#C6CBD2]'}`} />
        ))}
      </div>
      {video ? (
        <video ref={videoRef} className="w-full h-auto block" autoPlay muted loop playsInline poster={video.poster}>
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
