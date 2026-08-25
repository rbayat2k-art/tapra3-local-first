import {describe, expect, it} from 'vitest';
import {
  frequentNavigationDestinations,
  incrementNavigationUsage,
  loadNavigationUsage,
  navigationUsageStorageKeyForTest,
  normalizeNavigationText,
  saveNavigationUsage,
  searchNavigationDestinations,
  type NavigationDestinationBase,
  type NavigationUsageStorage,
} from './navigationDiscovery';

const destinations: NavigationDestinationBase[] = [
  {id: 'page:personnel', title: 'پرسنل', subtitle: 'پرونده پرسنلی', group: 'سازمان', page: 'personnel', aliases: ['پرستل', 'کارکنان']},
  {id: 'module:employee-advance', title: 'مساعده پرسنلی', subtitle: 'درخواست مساعده', group: 'منابع انسانی', page: 'hcm', moduleId: 'employee-advance'},
  {id: 'module:purchase-request', title: 'درخواست‌های خرید', subtitle: 'ثبت و بررسی خرید', group: 'تدارکات', page: 'procurement', moduleId: 'purchase-request', aliases: ['درخواست خرید']},
];

class MemoryStorage implements NavigationUsageStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('navigation discovery', () => {
  it('normalizes Persian variants, zero-width spaces and punctuation', () => {
    expect(normalizeNavigationText('  درخواست‌خريد / جديد ')).toBe('درخواست خرید جدید');
  });

  it('finds the three approved examples and common personnel typo', () => {
    expect(searchNavigationDestinations(destinations, 'مساعده')[0]?.id).toBe('module:employee-advance');
    expect(searchNavigationDestinations(destinations, 'درخواست خريد')[0]?.id).toBe('module:purchase-request');
    expect(searchNavigationDestinations(destinations, 'پرستل')[0]?.id).toBe('page:personnel');
  });

  it('searches only the accessible catalog supplied by the caller', () => {
    const accessible = destinations.filter((item) => item.id !== 'module:purchase-request');
    expect(searchNavigationDestinations(accessible, 'درخواست خرید')).toEqual([]);
  });
});

describe('navigation usage', () => {
  it('keeps usage per user and never stores a query or title', () => {
    const storage = new MemoryStorage();
    const entries = incrementNavigationUsage([], 'module:employee-advance', '2026-08-25T08:00:00.000Z');
    expect(saveNavigationUsage('user-a', entries, storage)).toBe(true);
    expect(loadNavigationUsage('user-a', storage)).toEqual(entries);
    expect(loadNavigationUsage('user-b', storage)).toEqual([]);
    const raw = storage.values.get(navigationUsageStorageKeyForTest('user-a')) ?? '';
    expect(raw).not.toContain('مساعده');
    expect(raw).not.toContain('query');
  });

  it('ranks by count, then recency, and filters stale inaccessible destinations', () => {
    let entries = incrementNavigationUsage([], 'page:personnel', '2026-08-25T08:00:00.000Z');
    entries = incrementNavigationUsage(entries, 'module:employee-advance', '2026-08-25T09:00:00.000Z');
    entries = incrementNavigationUsage(entries, 'page:personnel', '2026-08-25T10:00:00.000Z');
    entries = incrementNavigationUsage(entries, 'module:purchase-request', '2026-08-25T11:00:00.000Z');
    const accessible = destinations.filter((item) => item.id !== 'module:purchase-request');
    expect(frequentNavigationDestinations(accessible, entries).map((item) => item.destination.id)).toEqual([
      'page:personnel',
      'module:employee-advance',
    ]);
  });

  it('fails open for navigation personalization when storage is corrupt or unavailable', () => {
    const corrupt = new MemoryStorage();
    corrupt.values.set(navigationUsageStorageKeyForTest('user-a'), '{bad json');
    expect(loadNavigationUsage('user-a', corrupt)).toEqual([]);
    const unavailable: NavigationUsageStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
    };
    expect(loadNavigationUsage('user-a', unavailable)).toEqual([]);
    expect(saveNavigationUsage('user-a', [], unavailable)).toBe(false);
  });

  it('deduplicates malformed persisted entries and limits visible frequent items to six', () => {
    const storage = new MemoryStorage();
    storage.values.set(navigationUsageStorageKeyForTest('user-a'), JSON.stringify([
      {destinationId: 'page:1', count: 2, lastUsedAt: '2026-08-25T10:00:00.000Z'},
      {destinationId: 'page:1', count: 99, lastUsedAt: '2026-08-25T11:00:00.000Z'},
      {destinationId: 'invalid', count: 0, lastUsedAt: 'bad'},
    ]));
    expect(loadNavigationUsage('user-a', storage)).toEqual([
      {destinationId: 'page:1', count: 2, lastUsedAt: '2026-08-25T10:00:00.000Z'},
    ]);
    const catalog = Array.from({length: 8}, (_, index): NavigationDestinationBase => ({
      id: `page:${index + 1}`, title: `Page ${index + 1}`, subtitle: '', group: 'test', page: String(index + 1), trackUsage: index !== 7,
    }));
    const entries = catalog.map((destination, index) => ({destinationId: destination.id, count: 8 - index, lastUsedAt: `2026-08-25T0${index}:00:00.000Z`}));
    expect(frequentNavigationDestinations(catalog, entries).map((item) => item.destination.id)).toEqual([
      'page:1', 'page:2', 'page:3', 'page:4', 'page:5', 'page:6',
    ]);
  });
});
