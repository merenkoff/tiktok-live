/**
 * Four overlapping discs — the four businesses the POS is sold to — as the
 * section mark over «Для якого бізнесу», the way Things marks a section with
 * its three circles. The colours are the verticals' glyph hues (design/icons).
 */
export function VerticalsMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="15" fill="#1B9DF0" fillOpacity=".9" />
      <circle cx="40" cy="24" r="15" fill="#EE5B93" fillOpacity=".85" />
      <circle cx="24" cy="40" r="15" fill="#F4891F" fillOpacity=".85" />
      <circle cx="40" cy="40" r="15" fill="#6C7D93" fillOpacity=".85" />
    </svg>
  );
}
