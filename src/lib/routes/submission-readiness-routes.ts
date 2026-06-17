/**
 * H1 — Stub Router Template
 *
 * Template for each domain-specific router file in src/lib/routes/.
 *
 * Pattern:
 * 1. Import express Router and Firebase Admin
 * 2. Define middleware (requireAuth applied at router level)
 * 3. Define route handlers with proper error handling
 * 4. Export the router
 *
 * Replace the placeholder comment below with actual route definitions.
 */

import { Router, Request, Response } from 'express';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const router = Router();

// ===========================================================================
// Middleware
// ===========================================================================

/**
 * Apply requireAuth to all routes in this router.
 * Replace this with your project's actual auth middleware if different.
 */
async function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
}

/**
 * Apply requireAdmin to specific routes that need elevated privileges.
 */
async function requireAdmin(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (!userData || userData.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden — admin role required' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

// Apply auth middleware to all routes in this router
router.use(requireAuth);

// ===========================================================================
// Routes
// ===========================================================================
// TODO: Replace this section with the actual route definitions extracted
// from api-router.ts for this domain.
//
// Example:
//
// router.get('/items', async (req: Request, res: Response) => {
//   try {
//     const snapshot = await db.collection('items').get();
//     const items: any[] = [];
//     snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
//     return res.status(200).json({ items });
//   } catch (error: any) {
//     console.error('[items] Error:', error.message);
//     return res.status(500).json({ error: 'Failed to fetch items' });
//   }
// });
//
// router.post('/items', async (req: Request, res: Response) => {
//   try {
//     const user = (req as any).user;
//     const { name, description } = req.body;
//     const docRef = await db.collection('items').add({
//       name,
//       description,
//       createdBy: user.uid,
//       createdAt: admin.firestore.Timestamp.now(),
//     });
//     return res.status(201).json({ id: docRef.id });
//   } catch (error: any) {
//     console.error('[items POST] Error:', error.message);
//     return res.status(500).json({ error: 'Failed to create item' });
//   }
// });
// ===========================================================================

// ===========================================================================
// Health check for this domain
// ===========================================================================
router.get('/_health', (_req: Request, res: Response) => {
  res.status(200).json({
    domain: 'submission-readiness-routes',
    status: 'initialized',
    timestamp: new Date().toISOString(),
  });
});

export { router as domainRouter };
