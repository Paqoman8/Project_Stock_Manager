// Tests du contexte de session — en particulier la déconnexion forcée sur 401/403
// (organisation suspendue) et sur isActive=false, aux trois points d'entrée :
// hydratation initiale, polling, retour de focus. C'est la logique la plus
// facile à casser silencieusement (un `if` mal placé ne fait pas planter la
// compilation) et qui n'était protégée que par des vérifications manuelles
// avant ce fichier.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionContext';

const mockReplace = vi.fn();
// Référence stable — le vrai useRouter() de Next.js renvoie toujours le même
// objet entre les renders. Un mock qui recrée un objet à chaque appel fait
// changer la dépendance [router] du useEffect d'hydratation à chaque render,
// ce qui le fait re-déclencher en boucle et fausse tous les comptages d'appels.
const mockRouter = { replace: mockReplace };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('@/lib/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

function axiosError(status: number) {
  return { isAxiosError: true, response: { status } };
}

const ME_RESPONSE = {
  data: {
    success: true,
    user: {
      id: 'u1', username: 'jean.dupont', email: 'jean@example.com',
      roleId: 'r1', roleName: 'Opérateur',
      storeId: 's1', storeName: 'Hub Central', storeColor: '#1D4ED8',
      orgId: 'o1', orgName: 'Acme Corp',
      isPlatformManager: false, mustChangePassword: false,
      isActive: true,
    },
  },
};

function TestConsumer() {
  const { user, isLoading } = useSession();
  if (isLoading) return <div>loading</div>;
  return <div>{user ? `connected:${user.username}` : 'no-user'}</div>;
}

beforeEach(() => {
  mockReplace.mockClear();
  mockGet.mockReset();
  mockPost.mockReset();
  mockPost.mockResolvedValue({});
});

afterEach(() => {
  // @testing-library/react auto-cleanup ne s'active que si `test.globals: true`
  // est activé — ce n'est pas le cas ici (imports explicites de vitest), donc
  // le démontage est fait manuellement pour éviter les fuites entre tests
  // (composants toujours montés = intervalles setInterval qui continuent de
  // tourner et polluent les mocks des tests suivants).
  cleanup();
  vi.useRealTimers();
});

describe('SessionProvider — hydratation initiale', () => {
  it('redirige vers /login sur 401', async () => {
    mockGet.mockRejectedValue(axiosError(401));

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('redirige vers /login sur 403 (organisation suspendue)', async () => {
    mockGet.mockRejectedValue(axiosError(403));

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });

  it('ne redirige pas sur une erreur 500 et laisse user à null', async () => {
    mockGet.mockRejectedValue(axiosError(500));

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    await waitFor(() => screen.getByText('no-user'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('hydrate le user quand la requête réussit', async () => {
    mockGet.mockResolvedValue(ME_RESPONSE);

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    await waitFor(() => screen.getByText('connected:jean.dupont'));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('SessionProvider — polling (toutes les 2 minutes)', () => {
  it('déconnecte quand le polling reçoit un 403', async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValueOnce(ME_RESPONSE);
    mockGet.mockRejectedValueOnce(axiosError(403));

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    // Attendre que le get() ait été APPELÉ ne suffit pas : il faut attendre que
    // sa résolution ait été traitée (setUser + re-render), sinon le useEffect
    // de polling voit encore `user === null` et ne programme aucun intervalle.
    await vi.waitFor(() => screen.getByText('connected:jean.dupont'));

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/auth/logout'));

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('déconnecte quand le polling détecte isActive=false', async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValueOnce(ME_RESPONSE);
    mockGet.mockResolvedValueOnce({
      data: { success: true, user: { ...ME_RESPONSE.data.user, isActive: false } },
    });

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    await vi.waitFor(() => screen.getByText('connected:jean.dupont'));

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/auth/logout'));

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('ne déconnecte pas quand le polling reste en succès avec isActive=true', async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue(ME_RESPONSE);

    render(<SessionProvider><TestConsumer /></SessionProvider>);

    await vi.waitFor(() => screen.getByText('connected:jean.dupont'));

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('SessionProvider — retour de focus (visibilitychange)', () => {
  it('déconnecte si le document redevient visible et que la session est invalidée (403)', async () => {
    mockGet.mockResolvedValueOnce(ME_RESPONSE);
    mockGet.mockRejectedValueOnce(axiosError(403));

    render(<SessionProvider><TestConsumer /></SessionProvider>);
    await waitFor(() => screen.getByText('connected:jean.dupont'));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/auth/logout'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
