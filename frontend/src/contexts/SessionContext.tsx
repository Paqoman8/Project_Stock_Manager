// src/contexts/SessionContext.tsx
// Contexte de session utilisateur pour GStock.
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
  // isLoading démarre à true : on ne rend pas les enfants dans un état indéfini
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Déconnexion : invalide le cookie côté serveur puis redirige.
  // Défini en premier (useCallback) car les useEffect de polling le référencent.
  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {
      // On redirige quoi qu'il arrive — une erreur réseau ne doit pas
      // bloquer l'utilisateur sur une session potentiellement corrompue.
    } finally {
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  // Hydratation initiale : récupère le profil depuis le backend.
  // Le cookie httpOnly auth_token est envoyé automatiquement via withCredentials.
  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const { data } = await apiClient.get<MeApiResponse>('/api/auth/me');

        if (data.success) {
          // On ne stocke que les champs dont l'UI a besoin — isActive est ignoré ici.
          const { id, username, email, roleId, roleName, storeId, storeName, storeColor } =
            data.user;
          setUser({ id, username, email, roleId, roleName, storeId, storeName, storeColor });
        }
      } catch (err) {
        // Si le backend répond 401, le cookie est absent ou expiré :
        // on redirige vers /login. Pour toute autre erreur réseau on laisse
        // l'utilisateur sur la page (la Sidebar/Navbar affichera un état vide).
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          router.replace('/login');
        }
      } finally {
        // Dans tous les cas on quitte l'état de chargement
        setIsLoading(false);
      }
    }

    fetchCurrentUser();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Polling toutes les 2 minutes — vérification de la validité du compte
  // ---------------------------------------------------------------------------
  // On ne démarre le polling que lorsqu'un utilisateur est chargé et actif.
  // Si le compte est désactivé entre deux navigations, le polling force
  // la déconnexion sans attendre une action utilisateur.
  //
  // Les erreurs réseau non-401 (timeout, 5xx, CORS, etc.) sont ignorées
  // intentionnellement : une panne backend temporaire ne doit pas déconnecter
  // l'utilisateur. Seule une réponse 401 explicite signifie "token invalide".
  useEffect(() => {
    if (!user) return;

    const intervalle = setInterval(async () => {
      try {
        const res = await apiClient.get<MeApiResponse>('/api/auth/me');
        if (!res.data.user.isActive) {
          // Le compte a été désactivé par un administrateur → déconnexion forcée
          await logout();
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          // Token expiré ou invalidé → déconnexion propre
          await logout();
        }
        // Autres erreurs (réseau, 5xx, timeout) : on ignore.
        // Ne pas déconnecter pour une panne backend temporaire.
      }
    }, 2 * 60 * 1000); // 2 minutes

    return () => clearInterval(intervalle);
  }, [user, logout]);

  // ---------------------------------------------------------------------------
  // Vérification au retour de focus de la fenêtre (visibilitychange)
  // ---------------------------------------------------------------------------
  // Complète le polling pour les longues absences (onglet mis en veille).
  // Dès que l'utilisateur revient sur l'onglet, on vérifie immédiatement
  // si le compte est encore valide — sans attendre le prochain tick du polling.
  //
  // Même politique que le polling : les erreurs non-401 sont ignorées.
  useEffect(() => {
    if (!user) return;

    async function verifierAuFocus() {
      // On ne vérifie qu'au retour en visibilité (pas lors du masquage de l'onglet)
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
        // Erreurs réseau non-401 : ignorées (cf. commentaire polling ci-dessus)
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

/**
 * Consomme le SessionContext.
 * Lance une erreur si utilisé hors d'un SessionProvider —
 * cela révèle une erreur d'intégration en développement.
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error('useSession doit être utilisé dans un <SessionProvider>.');
  }
  return ctx;
}
