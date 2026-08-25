export interface NavigationDestinationBase {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  page: string;
  moduleId?: string;
  categoryId?: string;
  aliases?: string[];
  trackUsage?: boolean;
}

export interface NavigationUsageEntry {
  destinationId: string;
  count: number;
  lastUsedAt: string;
}

export interface NavigationUsageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const USAGE_STORAGE_PREFIX = 'tira_navigation_usage_v1:';
const MAX_STORED_DESTINATIONS = 40;

export function normalizeNavigationText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fa');
}

function destinationSearchParts(destination: NavigationDestinationBase): string[] {
  return [destination.title, destination.subtitle, destination.group, ...(destination.aliases ?? [])]
    .map(normalizeNavigationText)
    .filter(Boolean);
}

function destinationSearchScore(destination: NavigationDestinationBase, query: string): number {
  const normalizedQuery = normalizeNavigationText(query);
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(' ');
  const parts = destinationSearchParts(destination);
  const searchable = parts.join(' ');
  if (!tokens.every((token) => searchable.includes(token))) return -1;
  const normalizedTitle = normalizeNavigationText(destination.title);
  const normalizedAliases = (destination.aliases ?? []).map(normalizeNavigationText);
  if (normalizedTitle === normalizedQuery) return 500;
  if (normalizedAliases.includes(normalizedQuery)) return 460;
  if (normalizedTitle.startsWith(normalizedQuery)) return 420;
  if (normalizedTitle.includes(normalizedQuery)) return 380;
  if (normalizedAliases.some((alias) => alias.startsWith(normalizedQuery))) return 340;
  return 200 - Math.min(100, searchable.length - normalizedQuery.length);
}

export function searchNavigationDestinations<T extends NavigationDestinationBase>(destinations: T[], query: string, limit = 8): T[] {
  if (!normalizeNavigationText(query)) return [];
  return destinations
    .map((destination, index) => ({destination, index, score: destinationSearchScore(destination, query)}))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.destination);
}

function usageStorageKey(userId: string): string {
  return `${USAGE_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function validUsageEntry(value: unknown): value is NavigationUsageEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NavigationUsageEntry>;
  return typeof candidate.destinationId === 'string'
    && candidate.destinationId.length > 0
    && Number.isInteger(candidate.count)
    && Number(candidate.count) > 0
    && typeof candidate.lastUsedAt === 'string'
    && Number.isFinite(Date.parse(candidate.lastUsedAt));
}

export function loadNavigationUsage(userId: string, storage: NavigationUsageStorage): NavigationUsageEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(usageStorageKey(userId)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((entry) => {
      if (!validUsageEntry(entry) || seen.has(entry.destinationId)) return false;
      seen.add(entry.destinationId);
      return true;
    }).slice(0, MAX_STORED_DESTINATIONS);
  } catch {
    return [];
  }
}

export function saveNavigationUsage(userId: string, entries: NavigationUsageEntry[], storage: NavigationUsageStorage): boolean {
  try {
    storage.setItem(usageStorageKey(userId), JSON.stringify(entries.slice(0, MAX_STORED_DESTINATIONS)));
    return true;
  } catch {
    return false;
  }
}

export function incrementNavigationUsage(entries: NavigationUsageEntry[], destinationId: string, usedAt = new Date().toISOString()): NavigationUsageEntry[] {
  const current = entries.find((entry) => entry.destinationId === destinationId);
  return [
    {destinationId, count: (current?.count ?? 0) + 1, lastUsedAt: usedAt},
    ...entries.filter((entry) => entry.destinationId !== destinationId),
  ]
    .sort((left, right) => right.count - left.count || right.lastUsedAt.localeCompare(left.lastUsedAt) || left.destinationId.localeCompare(right.destinationId))
    .slice(0, MAX_STORED_DESTINATIONS);
}

export function frequentNavigationDestinations<T extends NavigationDestinationBase>(destinations: T[], entries: NavigationUsageEntry[], limit = 6): Array<{destination: T; usage: NavigationUsageEntry}> {
  const byId = new Map(destinations.filter((destination) => destination.trackUsage !== false).map((destination) => [destination.id, destination]));
  return entries
    .filter((entry) => byId.has(entry.destinationId))
    .sort((left, right) => right.count - left.count || right.lastUsedAt.localeCompare(left.lastUsedAt) || left.destinationId.localeCompare(right.destinationId))
    .slice(0, limit)
    .map((usage) => ({destination: byId.get(usage.destinationId) as T, usage}));
}

export function navigationUsageStorageKeyForTest(userId: string): string {
  return usageStorageKey(userId);
}
