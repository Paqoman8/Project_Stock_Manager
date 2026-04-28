import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';

// Chargement des variables d'environnement
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuration Socket.io pour la communication temps réel (ex: remonter des transactions)
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Middlewares globaux
app.use(cors()); // Autoriser les requêtes cross-origin depuis le frontend
app.use(express.json()); // Parser les body JSON

// Route de base pour vérifier que l'API est en vie
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'L\'API GStock est opérationnelle' });
});

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
  console.log('Nouveau client WebSocket connecté:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client WebSocket déconnecté:', socket.id);
  });
});

// Port d'écoute
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Le serveur GStock a démarré sur le port ${PORT}`);
});
