import { app } from '../src/server';

// Handler Vercel (serverless) pour l'API Express.
// `app` a la signature (req, res) => void, directement compatible avec le
// runtime Node.js de Vercel — pas besoin de `serverless-http` (conçu pour
// traduire le format événement AWS API Gateway/Lambda, que Vercel n'utilise
// pas ici) ni d'un http.Server/Socket.io, non supportés en serverless.
export default app;
