export type WorkspaceRouteUpdate = Partial<Record<'module' | 'cartable' | 'status' | 'q', string | null>>;

const routeText = (url: URL) => `${url.pathname}${url.search}${url.hash}`;

export function pageFromUrl(href: string): string {
  try { return new URL(href).searchParams.get('page')?.trim() || 'dashboard'; }
  catch { return 'dashboard'; }
}

export function pageRouteUrl(href: string, page: string): string {
  const url = new URL(href);
  url.searchParams.set('page', page);
  for (const key of ['module', 'cartable', 'status', 'q']) url.searchParams.delete(key);
  return routeText(url);
}

export function workspaceParam(href: string, key: keyof WorkspaceRouteUpdate): string {
  try { return new URL(href).searchParams.get(key)?.trim() || ''; }
  catch { return ''; }
}

export function workspaceRouteUrl(href: string, update: WorkspaceRouteUpdate): string {
  const url = new URL(href);
  for (const [key, value] of Object.entries(update)) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  return routeText(url);
}
