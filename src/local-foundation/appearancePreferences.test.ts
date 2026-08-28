import {describe, expect, it} from 'vitest';
import {DEFAULT_PREFERENCES, normalizeUiPreferences} from './appearancePreferences';

describe('appearance preferences', () => {
  it('keeps old preferences and adds the classic palette', () => {
    expect(normalizeUiPreferences({theme: 'dark', fontSize: 'xlarge', density: 'compact', columnGap: 12, reduceMotion: true, highContrast: true})).toEqual({
      theme: 'dark', palette: 'classic', fontSize: 'xlarge', density: 'compact', columnGap: 12, reduceMotion: true, highContrast: true,
    });
  });

  it('keeps palette independent from theme', () => {
    expect(normalizeUiPreferences({...DEFAULT_PREFERENCES, theme: 'system', palette: 'navy-gold'})).toMatchObject({theme: 'system', palette: 'navy-gold'});
  });

  it('falls back field by field for malformed values', () => {
    expect(normalizeUiPreferences({theme: 'sepia', palette: 'remote-css', fontSize: 12, density: null, columnGap: 999, reduceMotion: 'yes'})).toEqual({...DEFAULT_PREFERENCES, columnGap: 24});
    expect(normalizeUiPreferences({columnGap: null}).columnGap).toBe(DEFAULT_PREFERENCES.columnGap);
    expect(normalizeUiPreferences({columnGap: false}).columnGap).toBe(DEFAULT_PREFERENCES.columnGap);
    expect(normalizeUiPreferences({columnGap: ''}).columnGap).toBe(DEFAULT_PREFERENCES.columnGap);
    expect(normalizeUiPreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it('retains the legacy v1 spacing migration', () => {
    expect(normalizeUiPreferences({columnGap: 4}, true).columnGap).toBe(8);
  });
});
