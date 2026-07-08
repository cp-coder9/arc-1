import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

const mode = process.env.NODE_ENV || 'production';
dotenv.config({
  path: ['.env.' + mode + '.local', '.env.local', '.env.' + mode, '.env'],
});

const port = Number(process.env.PORT) || 3000;
const BODY_LIMIT = '50mb';
const ALLOWED_CORS_ORIGINS = [
  'https://architex.co.za',
  'https://www.architex.co.za',
  'https://test.architex.co.za',
  'https://architex-marketplace.vercel.app',
  /\.vercel\.app$/,
];

const app = express();
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});
app.use(cors({ origin: ALLOWED_CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/check-admin', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  return next();
});

app.use('/api/marketplace', async (req, res, next) => {
  try {
    const { default: marketplaceRouter } = await import('./src/lib/marketplace-api-router.ts');
    return marketplaceRouter(req, res, next);
  } catch (error) {
    console.error('Failed to load Marketplace API router:', error);
    return res.status(500).json({
      error: 'Marketplace API router failed to initialize',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use('/api/fee-proposal', async (req, res, next) => {
  try {
    const { default: feeProposalRouter } = await import('./src/lib/fee-proposal-api-router.ts');
    return feeProposalRouter(req, res, next);
  } catch (error) {
    console.error('Failed to load Fee Proposal API router:', error);
    return res.status(500).json({
      error: 'Fee Proposal API router failed to initialize',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/forms')) return next();
  try {
    const { formsApiRouter } = await import('./src/lib/forms-api-router.ts');
    return formsApiRouter(req, res, next);
  } catch (error) {
    console.error('Failed to load Forms API router:', error);
    return res.status(500).json({
      error: 'Forms API router failed to initialize',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use('/api', async (req, res, next) => {
  try {
    const { default: apiRouter } = await import('./src/lib/api-router.ts');
    return apiRouter(req, res, next);
  } catch (error) {
    console.error('Failed to load API router:', error);
    return res.status(500).json({
      error: 'API router failed to initialize',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

const server = app.listen(port, '0.0.0.0', async () => {
  console.log('Architex API server running on http://localhost:' + port);
  console.log('Environment: ' + (process.env.NODE_ENV || 'production'));

  // ── WebSocket upgrade handling for Remote Desktop signalling ───────────────
  try {
    const { signallingService } = await import('./src/services/remoteDesktop/signallingService.ts');
    signallingService.attach(server);
    console.log('[Remote Desktop] Signalling WebSocket attached at /api/remote-desktop/signal');
  } catch (error) {
    console.warn(
      '[Remote Desktop] Signalling service disabled:',
      error instanceof Error ? error.message : String(error),
    );
  }
});

server.on('error', (error) => {
  console.error('Architex API server failed to start:', error);
  process.exitCode = 1;
});
