/**
 * Five overlapping discs — the five businesses the POS is sold to — as the
 * section mark over «Для якого бізнесу», the way Things marks a section with
 * its three circles. The colours are the verticals' glyph hues (design/icons),
 * clockwise from the top: clothing, flowers, café, restaurant, grocery.
 */
export function VerticalsMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="20.5" r="13.5" fill="#1B9DF0" fillOpacity=".9" />
      <circle cx="43.9" cy="29.1" r="13.5" fill="#EE5B93" fillOpacity=".85" />
      <circle cx="39.3" cy="43.1" r="13.5" fill="#F4891F" fillOpacity=".85" />
      <circle cx="24.7" cy="43.1" r="13.5" fill="#6C7D93" fillOpacity=".85" />
      <circle cx="20.1" cy="29.1" r="13.5" fill="#2E9F91" fillOpacity=".85" />
    </svg>
  );
}
