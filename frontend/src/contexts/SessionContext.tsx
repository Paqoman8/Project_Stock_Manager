// src/contexts/SessionContext.tsx
// Contexte de session utilisateur pour Stock Manager.
//
// Responsabilités :
//   1. Appeler GET /api/auth/me au montage pour hydrater le user courant.
//   2. Rediriger vers /login si la réponse est 401 (cookie expiré ou absent).
//   3. Exposer logout() : POST /api/auth/logout puis redirection /login.
//   4. Polling toutes les 2 minutes pour détecter une désactivation de compte.
//   5. Vérification immédiate au retour de focus (visibilitychange).
//
// Ce contexte est destiné à être posé sur le layout /dashboard
// afin que tous les composants enfants puissent lire la session
// sans re-fetcher le endpoint à chaque render.

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Types exportés — consommés par Navbar, pages, etc.
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  roleId: string;
  roleName: string;
  storeId: string;
  storeName: string;
  storeColor: string;
  orgId: string;
  orgName: string | null;
  isPlatformManager: boolean;
  mustChangePassword: boolean;
}

export interface SessionContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Forme de la réponse brute de GET /api/auth/me
// ---------------------------------------------------------------------------

interface MeApiResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string | null;
    roleId: string;
    roleName: string;
    storeId: string;
    storeName: string;
    storeColor: string;
    orgId: string;
    orgName: string | null;
    isPlatformManager: boolean;
    mustChangePassword: boolean;
    isActive: boolean;
  };
}

// ---------------------------------------------------------------------------
// Création du contexte — valeur par défaut jamais exposée (guard dans useSession)
// ---------------------------------------------------------------------------

const SessionContext = createContext<SessionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      // On redirige quoi qu'il arrive
    } finally {
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  // Hydratation initiale
  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const { data } = await apiClient.get<MeApiResponse>('/api/auth/me');

        if (data.success) {
          const {
            id, username, email, roleId, roleName,
            storeId, storeName, storeColor,
            orgId, orgName, isPlatformManager, mustChangePassword,
          } = data.user;
          setUser({
            id, username, email, roleId, roleName,
            storeId, storeName, storeColor,
            orgId, orgName, isPlatformManager, mustChangePassword,
          });
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          router.replace('/login');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchCurrentUser();
  }, [router]);

  // Polling toutes les 2 minutes
  useEffect(() => {
    if (!user) return;

    const intervalle = setInterval(async () => {
      try {
        const res = await apiClient.get<MeApiResponse>('/api/auth/me');
        if (!res.data.user.isActive) {
          await logout();
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          await logout();
        }
      }
    }, 2 * 60 * 1000);

    return () => clearInterval(intervalle);
  }, [user, logout]);

  // Vérification au retour de focus
  useEffect(() => {
    if (!user) return;

    async function verifierAuFocus() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await apiClient.get<MeApiResponse>('/api/auth/me');
        if (!res.data.user.isActive) {
          await logout();
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          await logout();
        }
      }
    }

    document.addEventListener('visibilitychange', verifierAuFocus);
    return () => document.removeEventListener('visibilitychange', verifierAuFocus);
  }, [user, logout]);

  return (
    <SessionContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error('useSession doit être utilisé dans un <SessionProvider>.');
  }
  return ctx;
}
