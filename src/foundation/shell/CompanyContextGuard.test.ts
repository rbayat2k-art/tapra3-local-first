import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyContextGuard } from './CompanyContextGuard';

const { useFoundationSession } = vi.hoisted(() => ({
  useFoundationSession: vi.fn(),
}));

vi.mock('../auth/FoundationSessionContext', () => ({ useFoundationSession }));

describe('company context guard', () => {
  beforeEach(() => useFoundationSession.mockReset());

  it('does not mount a company-scoped child in the workspace-wide context', () => {
    useFoundationSession.mockReturnValue({
      session: { activeContext: { company: null } },
    });
    const child = React.createElement('span', null, 'محتوای وابسته به شرکت');
    const html = renderToStaticMarkup(React.createElement(CompanyContextGuard, null, child));
    expect(html).toContain('انتخاب شرکت لازم است');
    expect(html).not.toContain('محتوای وابسته به شرکت');
  });

  it('mounts the child after a valid company context is active', () => {
    useFoundationSession.mockReturnValue({
      session: { activeContext: { company: { id: 'company-alpha', name: 'آلفا' } } },
    });
    const child = React.createElement('span', null, 'محتوای وابسته به شرکت');
    const html = renderToStaticMarkup(React.createElement(CompanyContextGuard, null, child));
    expect(html).toContain('محتوای وابسته به شرکت');
    expect(html).not.toContain('انتخاب شرکت لازم است');
  });
});
