import axios from 'axios';

// Instance axios configurée pour toujours pointer vers notre backend
// et toujours inclure les cookies dans les requêtes (withCredentials)
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001',
  withCredentials: true, // Indispensable pour envoyer/recevoir les cookies httpOnly
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
