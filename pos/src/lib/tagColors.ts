export const TAG_COLOR_KEYS = [
  'green',
  'rose',
  'blue',
  'orange',
  'teal',
  'purple',
  'slate',
  'amber',
] as const;

export type TagColorKey = (typeof TAG_COLOR_KEYS)[number];

export const TAG_COLORS: Record<TagColorKey, string> = {
  green: '#2E7D4F',
  rose: '#C45B6B',
  blue: '#3B7DD8',
  orange: '#E07A3D',
  teal: '#2A9B8F',
  purple: '#6B5B95',
  slate: '#5A6A7A',
  amber: '#C9922A',
};

export const DEFAULT_TAG_COLOR: TagColorKey = 'slate';

export function isTagColorKey(value: string | null | undefined): value is TagColorKey {
  return !!value && (TAG_COLOR_KEYS as readonly string[]).includes(value);
}

export function resolveTagColorHex(color: string | null | undefined): string {
  if (isTagColorKey(color)) return TAG_COLORS[color];
  return TAG_COLORS[DEFAULT_TAG_COLOR];
}
