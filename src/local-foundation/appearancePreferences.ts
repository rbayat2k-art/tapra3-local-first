export type ThemePreference = 'light' | 'dark' | 'system';
export type BrandPalette = 'classic' | 'navy-gold';
export type FontSizePreference = 'standard' | 'large' | 'xlarge';
export type DensityPreference = 'compact' | 'comfortable' | 'spacious';

export interface UiPreferences {
  theme: ThemePreference;
  palette: BrandPalette;
  fontSize: FontSizePreference;
  density: DensityPreference;
  columnGap: number;
  reduceMotion: boolean;
  highContrast: boolean;
}

export const DEFAULT_PREFERENCES: UiPreferences = {
  theme: 'system',
  palette: 'classic',
  fontSize: 'large',
  density: 'comfortable',
  columnGap: 8,
  reduceMotion: false,
  highContrast: false,
};

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.includes(value as T);

export function normalizeUiPreferences(value: unknown, legacyV1 = false): UiPreferences {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawGap = typeof stored.columnGap === 'number' ? stored.columnGap : Number.NaN;
  const normalizedGap = Number.isFinite(rawGap) ? Math.min(24, Math.max(0, rawGap)) : DEFAULT_PREFERENCES.columnGap;
  return {
    theme: isOneOf(stored.theme, ['light', 'dark', 'system']) ? stored.theme : DEFAULT_PREFERENCES.theme,
    palette: isOneOf(stored.palette, ['classic', 'navy-gold']) ? stored.palette : DEFAULT_PREFERENCES.palette,
    fontSize: isOneOf(stored.fontSize, ['standard', 'large', 'xlarge']) ? stored.fontSize : DEFAULT_PREFERENCES.fontSize,
    density: isOneOf(stored.density, ['compact', 'comfortable', 'spacious']) ? stored.density : DEFAULT_PREFERENCES.density,
    columnGap: legacyV1 && normalizedGap === 4 ? 8 : normalizedGap,
    reduceMotion: typeof stored.reduceMotion === 'boolean' ? stored.reduceMotion : DEFAULT_PREFERENCES.reduceMotion,
    highContrast: typeof stored.highContrast === 'boolean' ? stored.highContrast : DEFAULT_PREFERENCES.highContrast,
  };
}
