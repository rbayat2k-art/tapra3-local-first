import {describe, expect, it} from 'vitest';
import {pageFromUrl, pageRouteUrl, workspaceParam, workspaceRouteUrl} from './navigationUrl';

describe('URL-backed navigation', () => {
  it('reads the current page and falls back to dashboard', () => {
    expect(pageFromUrl('http://localhost:3001/?page=treasury')).toBe('treasury');
    expect(pageFromUrl('http://localhost:3001/')).toBe('dashboard');
  });

  it('changes the main page and clears stale workspace state', () => {
    expect(pageRouteUrl('http://localhost:3001/?page=treasury&module=treasury-execution&cartable=payer-recorded', 'procurement'))
      .toBe('/?page=procurement');
  });

  it('keeps workspace module, cartable, status and search in the URL', () => {
    const url = workspaceRouteUrl('http://localhost:3001/?page=treasury', {module: 'treasury-execution', cartable: 'payer-recorded', status: 'payment_recorded', q: 'پونک'});
    expect(workspaceParam(`http://localhost:3001${url}`, 'module')).toBe('treasury-execution');
    expect(workspaceParam(`http://localhost:3001${url}`, 'cartable')).toBe('payer-recorded');
    expect(workspaceParam(`http://localhost:3001${url}`, 'status')).toBe('payment_recorded');
    expect(workspaceParam(`http://localhost:3001${url}`, 'q')).toBe('پونک');
  });
});
