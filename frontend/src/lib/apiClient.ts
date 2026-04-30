import axios from 'axios';

// Instance axios configurée avec des URLs relatives — les requêtes /api/*
// sont automatiquement proxiées vers le backend par les rewrites Next.js.
// Cela fonctionne depuis n'importe quelle machine sur le réseau (pas de localhost hardcodé).
const apiClient = axios.create({
  // Ancienne configuration avec une URL de base, remplacée par une URL relative pour permettre le proxying via Next.js rewrites.
  // baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001',
  baseURL: '',
  withCredentials: true, // Indispensable pour envoyer/recevoir les cookies httpOnly
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
