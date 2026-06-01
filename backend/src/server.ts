import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import authRouter from './routes/authRoutes';
import userRouter from './routes/userRoutes';
import roleRouter from './routes/roleRoutes';
import auditRouter from './routes/auditRoutes';
import storeRouter from './routes/storeRoutes';
import supplierRouter        from './routes/supplierRoutes';
import supplierProductRouter  from './routes/supplierProductRoutes';
import categoryRouter         from './routes/categoryRoutes';
import productRouter          from './routes/productRoutes';
import purchaseOrderRouter    from './routes/purchaseOrderRoutes';
import stockReceptionRouter   from './routes/stockReceptionRoutes';
import supplierInvoiceRouter  from './routes/supplierInvoiceRoutes';
import inventoryRouter        from './routes/inventoryRoutes';
import stockMovementRouter    from './routes/stockMovementRoutes';
import inventoryReportRouter  from './routes/inventoryReportRoutes';
import packagingFormatRouter  from './routes/packagingFormatRoutes';
import transferRouter         from './routes/transferRoutes';

// Chargement des variables d'environnement depuis le fichier .env
dotenv.config();

const app = express();
const server = http.createServer(app);

// --- Middlewares globaux ---

// Configuration CORS stricte : on autorise UNIQUEMENT notre frontend
// à envoyer des requêtes avec des cookies (credentials: true)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true, // Obligatoire pour que les cookies soient transmis entre frontend et backend
}));

// Parser les corps de requêtes au format JSON
app.use(express.json());

// Parser les cookies (nécessaire pour lire notre cookie 'auth_token')
app.use(cookieParser());


// --- Configuration Socket.io pour la communication temps réel ---
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});


// --- Déclaration des routes ---

// Route de santé : vérifie que l'API est bien démarrée
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'L\'API GStock est opérationnelle' });
});

// Routes d'authentification (login, logout, me)
app.use('/api/auth', authRouter);

// Routes de gestion des utilisateurs (CRUD — réservé Super Administrateur)
app.use('/api/users', userRouter);

// Routes des rôles — endpoint public pour alimenter les formulaires d'admin.
// "Super Administrateur" est exclu systématiquement de la réponse.
app.use('/api/roles', roleRouter);

// Journal d'audit — SA voit tout, Admin voit ses magasins uniquement
app.use('/api/audit', auditRouter);

// Gestion des établissements — réservé Super Administrateur
app.use('/api/stores', storeRouter);

// Gestion des fournisseurs — réservé Super Administrateur
app.use('/api/suppliers', supplierRouter);

// Catalogue fournisseur — liaisons produit/fournisseur
app.use('/api/supplier-products', supplierProductRouter);

// Gestion du catalogue — catégories et produits
app.use('/api/categories', categoryRouter);
app.use('/api/products',   productRouter);

// Formats de conditionnement (imbriqués sous les produits)
app.use('/api/products/:productId/packaging-formats', packagingFormatRouter);

// Commandes fournisseurs, réceptions de stock et factures fournisseurs
app.use('/api/purchase-orders', purchaseOrderRouter);
app.use('/api/receptions',      stockReceptionRouter);
app.use('/api/invoices',        supplierInvoiceRouter);

// Inventaire — niveaux de stock, seuils, mouvements et rapports
app.use('/api/inventory',         inventoryRouter);
app.use('/api/stock-movements',   stockMovementRouter);
app.use('/api/inventory-reports', inventoryReportRouter);
app.use('/api/transfers', transferRouter);


// --- Gestion des connexions WebSocket ---
io.on('connection', (socket) => {
  console.log('Nouveau client WebSocket connecté:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client WebSocket déconnecté:', socket.id);
  });
});


// --- Démarrage du serveur ---
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Le serveur GStock a démarré sur le port ${PORT}`);
});
