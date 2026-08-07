// Tests du garde d'accès au panneau plateforme — c'est la seule barrière entre
// un compte d'organisation normal et l'espace Platform Manager. Une régression
// silencieuse ici (ex: condition inversée) exposerait le panneau plateforme à
// n'importe quel utilisateur connecté.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlatformGuard } from './PlatformGuard';

const mockReplace = vi.fn();
const mockRouter = { replace: mockReplace };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockUseSession = vi.fn();
vi.mock('@/contexts/SessionContext', () => ({
  useSession: () => mockUseSession(),
}));

function baseUser(overrides: Partial<{ isPlatformManager: boolean }> = {}) {
  return {
    id: 'u1', username: 'jean.dupont', email: 'jean@example.com',
    roleId: 'r1', roleName: 'Opérateur',
    storeId: 's1', storeName: 'Hub Central', storeColor: '#1D4ED8',
    orgId: 'o1', orgName: 'Acme Corp',
    isPlatformManager: false, mustChangePassword: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockReplace.mockClear();
  mockUseSession.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PlatformGuard', () => {
  it('pendant le chargement de la session : affiche le squelette, ne rend pas les enfants, ne redirige pas', () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: true });

    render(<PlatformGuard><div>Contenu plateforme</div></PlatformGuard>);

    expect(screen.queryByText('Contenu plateforme')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sans utilisateur (session non hydratée) : n\'affiche pas les enfants et ne redirige pas elle-même', () => {
    mockUseSession.mockReturnValue({ user: null, isLoading: false });

    render(<PlatformGuard><div>Contenu plateforme</div></PlatformGuard>);

    expect(screen.queryByText('Contenu plateforme')).toBeNull();
    // PlatformGuard délègue la redirection "session absente" à SessionContext
    // lui-même (401) — elle ne doit pas dupliquer cette redirection.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('utilisateur non Platform Manager : redirige vers /dashboard et n\'affiche pas les enfants', () => {
    mockUseSession.mockReturnValue({ user: baseUser({ isPlatformManager: false }), isLoading: false });

    render(<PlatformGuard><div>Contenu plateforme</div></PlatformGuard>);

    expect(screen.queryByText('Contenu plateforme')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('Platform Manager : affiche les enfants et ne redirige pas', () => {
    mockUseSession.mockReturnValue({ user: baseUser({ isPlatformManager: true }), isLoading: false });

    render(<PlatformGuard><div>Contenu plateforme</div></PlatformGuard>);

    expect(screen.getByText('Contenu plateforme')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
