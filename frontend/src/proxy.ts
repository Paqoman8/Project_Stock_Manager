// src/proxy.ts
// Next.js 16 : "middleware" est renommé "proxy" (voir node_modules/next/dist/docs/…/proxy.md).
// Ce fichier protège les routes /dashboard contre les accès non authentifiés.
// Le cookie httpOnly "token" est posé par le backend Express lors du login.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Le cookie "token" est httpOnly — posé par le backend Express avec res.cookie('token', ...).
  // Sa présence suffit à considérer l'utilisateur comme authentifié côté proxy ;
  // la validation JWT réelle est effectuée par le backend sur chaque requête API.
  const token = request.cookies.get('auth_token');
  const isAuthenticated = Boolean(token?.value);

  // Rediriger vers /login si une route protégée est accédée sans token.
  if (pathname.startsWith('/dashboard') && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Rediriger vers /dashboard si un utilisateur authentifié tente d'accéder à /login.
  if (pathname === '/login' && isAuthenticated) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Le proxy s'exécute sur toutes les routes applicatives.
  // Exclut : assets statiques Next.js, images optimisées, favicon, sitemap, robots.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
