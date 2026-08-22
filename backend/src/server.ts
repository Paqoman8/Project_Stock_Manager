import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
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
import productFormatRouter    from './routes/productFormatRoutes';
import transferRouter         from './routes/transferRoutes';
import transactionRouter      from './routes/transactionRoutes';
import dashboardRouter        from './routes/dashboardRoutes';
import platformRouter          from './routes/platformRoutes';


// ---------------------------------------------------------------------------
// INITIALIZATION                                                           
// ---------------------------------------------------------------------------

dotenv.config();

const app = express();
const server = http.createServer(app);


// ---------------------------------------------------------------------------
// GLOBAL MIDDLEWARES                                                       
// ---------------------------------------------------------------------------

// Trust proxy — configurable via env for safer deployments
// Required for express-rate-limit to read X-Forwarded-For correctly
function configureTrustProxy(): void {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined) {
    app.set('trust proxy', 1);
    return;
  }
  const num = Number(raw);
  if (!Number.isNaN(num)) {
    app.set('trust proxy', num);
  } else if (['true', 'false', 'loopback', 'linklocal', 'uniquelocal'].includes(raw)) {
    app.set('trust proxy', raw === 'true' ? true : raw === 'false' ? false : raw);
  } else {
    app.set('trust proxy', raw.split(',').map((s) => s.trim()));
  }
}
configureTrustProxy();

// CORS configuration — restrict to frontend origin only
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Global rate limiting — protection basique contre le scraping / brute-force
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes. Veuillez réessayer plus tard.' },
});
app.use(globalLimiter);

// Security headers — équivalent léger à Helmet sans nouvelle dépendance
app.disable('x-powered-by');
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  // CSP restrictive ; ajuster si des ressources externes sont nécessaires
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  );
  // HSTS en production uniquement
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

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
  res.json({ status: 'ok', message: 'L\'API Stock Manager est opérationnelle' });
});


// ── AUTHENTICATION ────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── PLATFORM MANAGER ──────────────────────────────────────────────────
app.use('/api/platform', platformRouter);


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
app.use('/api/categories',      categoryRouter);
app.use('/api/products',        productRouter);
app.use('/api/products/:productId/packaging-formats', packagingFormatRouter);
app.use('/api/product-formats', productFormatRouter);


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
app.use('/api/dashboard', dashboardRouter);


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

// Export app & server so the API can be wrapped for serverless platforms
// (Vercel, AWS Lambda, etc.) or imported in tests without starting a port.
export { app, server };

// Only start the long-running HTTP server when this file is run directly.
// Prevents the server from starting during serverless imports.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Le serveur Stock Manager a démarré sur le port ${PORT}`);
  });
}
