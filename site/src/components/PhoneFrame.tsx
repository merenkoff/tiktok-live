interface Props {
  src: string;
  alt: string;
}

/** A real screenshot of a phone screen — what the GUEST sees — in a quiet handset frame, the counterpart of `BrowserFrame`. */
export function PhoneFrame({ src, alt }: Props) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[38px] bg-paper p-2.5 shadow-ambient ring-1 ring-line">
      <img src={src} alt={alt} className="w-full h-auto block rounded-[28px]" loading="lazy" />
    </div>
  );
}
