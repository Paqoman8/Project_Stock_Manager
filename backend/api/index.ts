import serverless from 'serverless-http';
import { app } from '../src/server';

// Wrapper Vercel (serverless) pour l'API Express.
// Note : Socket.IO n'est pas supporté en mode serverless (pas de WebSocket persistant).
export default serverless(app);
