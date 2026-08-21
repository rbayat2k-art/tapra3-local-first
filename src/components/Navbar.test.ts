import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import { Navbar } from './Navbar';

const user: User = {
  id: 'u1', username: 'u1', fullName: 'کاربر آزمون', phone: '', email: 'user@example.test',
  role: 'member', roleTitle: 'عضو', isActive: true,
};

function renderNavbar() {
  return renderToStaticMarkup(React.createElement(Navbar, {
    currentUser: user,
    notifications: [],
    theme: 'light',
    onToggleTheme: vi.fn(),
    onOpenLogin: vi.fn(),
    onLogout: vi.fn(),
    onSearchTrackingCode: vi.fn(),
    onSelectNotificationRequest: vi.fn(),
    onSelectNotificationColleague: vi.fn(),
    onMarkNotificationRead: vi.fn(),
    activeTab: 'dashboard',
    onOpenTab: vi.fn(),
    onToggleSidebar: vi.fn(),
  }));
}

describe('responsive operational header', () => {
  it('renders one compact landmark with mobile-safe controls', () => {
    const html = renderNavbar();
    expect((html.match(/<header/g) ?? [])).toHaveLength(1);
    expect(html).toContain('max-w-[150px]');
    expect(html).toContain('sm:max-w-[240px]');
    expect(html).toContain('aria-label="باز یا بسته کردن منوی اصلی"');
  });

  it('does not expose legacy search, notifications or technical product wording', () => {
    const html = renderNavbar();
    const visibleText = html.replace(/<[^>]+>/g, ' ');
    expect(visibleText).not.toContain('کد پیگیری');
    expect(visibleText).not.toContain('اعلان‌های سیستم');
    expect(visibleText).not.toMatch(/Workspace|Company|Membership|Scope|Server-backed|Foundation SaaS/);
  });
});
