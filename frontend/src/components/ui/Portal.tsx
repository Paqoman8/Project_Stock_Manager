// src/components/ui/Portal.tsx
// Portail générique pour les modales — rend ses enfants directement dans
// document.body, en dehors de toute hiérarchie DOM.
//
// Pourquoi : un panel de modale en `position: fixed` est censé se
// positionner par rapport au viewport entier, quel que soit son ancêtre
// DOM. Mais tout ancêtre avec `overflow` différent de `visible` (ex :
// `<main class="overflow-y-auto p-6">` dans DashboardShell/PlatformNavbar)
// peut faire "fuir" son padding dans le calcul de position des descendants
// fixed — le fond sombre se retrouve alors décalé au lieu de couvrir tout
// l'écran. Sortir la modale du DOM via un portail élimine le problème à la
// racine.
//
// `mounted` évite tout rendu côté serveur (document.body n'existe pas en
// SSR) et tout mismatch d'hydratation.

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
