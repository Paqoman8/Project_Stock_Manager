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
import transactionRouter      from './routes/transactionRoutes';


// ---------------------------------------------------------------------------
// INITIALIZATION                                                           
// ---------------------------------------------------------------------------

dotenv.config();

const app = express();
const server = http.createServer(app);


// ---------------------------------------------------------------------------
// GLOBAL MIDDLEWARES                                                       
// ---------------------------------------------------------------------------

// CORS configuration — restrict to frontend origin only
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// JSON request parsing
app.use(express.json());

// Cookie parsing — required for auth_token
app.use(cookieParser());


// ---------------------------------------------------------------------------
// WEBSOCKET CONFIGURATION                                                  
// ---------------------------------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});


// ---------------------------------------------------------------------------
// ROUTE DECLARATIONS                                                       
// ---------------------------------------------------------------------------

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'L\'API GStock est opérationnelle' });
});


// ── AUTHENTICATION ────────────────────────────────────────────────────
app.use('/api/auth', authRouter);


// ── USER & ROLE MANAGEMENT ──────────────────────────────────────────
app.use('/api/users', userRouter);
app.use('/api/roles', roleRouter);


// ── AUDIT LOG ────────────────────────────────────────────────────────
app.use('/api/audit', auditRouter);


// ── STORE MANAGEMENT ─────────────────────────────────────────────────
app.use('/api/stores', storeRouter);


// ── SUPPLIER MANAGEMENT ──────────────────────────────────────────────
app.use('/api/suppliers', supplierRouter);
app.use('/api/supplier-products', supplierProductRouter);


// ── PRODUCT CATALOG ──────────────────────────────────────────────────
app.use('/api/categories', categoryRouter);
app.use('/api/products',   productRouter);
app.use('/api/products/:productId/packaging-formats', packagingFormatRouter);


// ── PROCUREMENT ──────────────────────────────────────────────────────
app.use('/api/purchase-orders', purchaseOrderRouter);
app.use('/api/receptions',      stockReceptionRouter);
app.use('/api/invoices',        supplierInvoiceRouter);


// ── INVENTORY & STOCK MANAGEMENT ──────────────────────────────────────
app.use('/api/inventory',         inventoryRouter);
app.use('/api/stock-movements',   stockMovementRouter);
app.use('/api/inventory-reports', inventoryReportRouter);


// ── INTER-STORE TRANSFERS ────────────────────────────────────────────
app.use('/api/transfers', transferRouter);


// ── POS / CASHIER (M13) ──────────────────────────────────────────────
app.use('/api/transactions', transactionRouter);


// ---------------------------------------------------------------------------
// WEBSOCKET HANDLERS                                                       
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log('Nouveau client WebSocket connecté:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client WebSocket déconnecté:', socket.id);
  });
});


// ---------------------------------------------------------------------------
// SERVER STARTUP                                                           
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Le serveur GStock a démarré sur le port ${PORT}`);
});
