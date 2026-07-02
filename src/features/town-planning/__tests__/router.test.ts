/**
 * Town Planning Router — Integration Tests
 *
 * Tests:
 * - Auth header extraction (x-user-id, x-user-role)
 * - Access control enforcement (403 without permission)
 * - Successful CRUD operations
 * - Validation error handling (400)
 * - Not found handling (404)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock firebase-admin before any imports
vi.mock('@/lib/firebase-admin', () => {
  const mockGet = vi.fn().mockResolvedValue({
    exists: false,
    empty: true,
    docs: [],
    id: 'mock-id',
    data: () => null,
  });

  const mockDoc = vi.fn().mockReturnValue({
    get: mockGet,
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: mockGet }),
      add: vi.fn().mockResolvedValue({ id: 'new-doc-id' }),
      get: mockGet,
    }),
  });

  const mockCollection = vi.fn().mockReturnValue({
    doc: mockDoc,
    add: vi.fn().mockResolvedValue({ id: 'new-doc-id' }),
    get: mockGet,
  });

  return {
    adminDb: { collection: mockCollection },
    auth: { verifyIdToken: vi.fn() },
    admin: {},
    firebaseConfig: { projectId: 'test-project', firestoreDatabaseId: 'test-db' },
  };
});

// Mock the access control service
vi.mock('../services/accessControl', () => ({
  checkPermission: vi.fn(),
  getEffectivePermissions: vi.fn().mockReturnValue({ allowedActions: [], isAdmin: false, roles: [] }),
  isAdminRole: vi.fn().mockReturnValue(false),
  PERMISSION_MATRIX: {},
}));

// Mock the application engine (avoids triggering firebase-admin in test)
vi.mock('../services/applicationEngine', () => ({
  createApplication: vi.fn(),
  getApplication: vi.fn(),
  listApplicationsByProject: vi.fn(),
  generateDocumentChecklist: vi.fn(),
  getCompletenessIndicator: vi.fn(),
  updateDocumentChecklistItem: vi.fn(),
  validateSubmissionReadiness: vi.fn(),
}));

// Mock municipality config
vi.mock('../services/municipalityConfig', () => ({
  listMunicipalities: vi.fn(),
  getMunicipalityProfile: vi.fn(),
  createMunicipalityProfile: vi.fn(),
  updateMunicipalityProfile: vi.fn(),
}));

import townPlanningRouter from '../router';
import { checkPermission } from '../services/accessControl';
import { getApplication, listApplicationsByProject } from '../services/applicationEngine';
import { getMunicipalityProfile, listMunicipalities } from '../services/municipalityConfig';

const mockedCheckPermission = vi.mocked(checkPermission);
const mockedGetApplication = vi.mocked(getApplication);
const mockedListApplications = vi.mocked(listApplicationsByProject);
const mockedGetMunicipality = vi.mocked(getMunicipalityProfile);
const mockedListMunicipalities = vi.mocked(listMunicipalities);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/town-planning', townPlanningRouter);
  return app;
}

describe('Town Planning Router', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    // Default: allow access
    mockedCheckPermission.mockResolvedValue({ allowed: true });
  });

  // ─── Auth Header Extraction ──────────────────────────────────────────────

  describe('Authentication', () => {
    it('returns 401 when x-user-id header is missing', async () => {
      const res = await request(app)
        .get('/api/town-planning/applications')
        .query({ projectId: 'proj-1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing x-user-id header');
    });

    it('extracts user info from x-user-id and x-user-role headers', async () => {
      mockedListApplications.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/town-planning/applications')
        .set('x-user-id', 'user-123')
        .set('x-user-role', 'town_planner')
        .query({ projectId: 'proj-1' });

      expect(res.status).not.toBe(401);
      expect(mockedCheckPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          roles: ['town_planner'],
        })
      );
    });

    it('defaults role to client when x-user-role not provided', async () => {
      mockedListApplications.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/town-planning/applications')
        .set('x-user-id', 'user-456')
        .query({ projectId: 'proj-1' });

      expect(res.status).not.toBe(401);
      expect(mockedCheckPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: ['client'],
        })
      );
    });
  });

  // ─── Access Control ────────────────────────────────────────────────────────

  describe('Access Control', () => {
    it('returns 403 when user lacks permission', async () => {
      mockedCheckPermission.mockResolvedValue({
        allowed: false,
        reason: "Action 'create_application' is not permitted for roles: client",
      });

      const res = await request(app)
        .post('/api/town-planning/applications')
        .set('x-user-id', 'user-123')
        .set('x-user-role', 'client')
        .send({ projectId: 'proj-1', applicationType: 'rezoning' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not permitted');
    });

    it('allows access when checkPermission returns allowed: true', async () => {
      mockedCheckPermission.mockResolvedValue({ allowed: true });
      mockedListApplications.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/town-planning/applications')
        .set('x-user-id', 'user-123')
        .set('x-user-role', 'town_planner')
        .query({ projectId: 'proj-1' });

      expect(res.status).toBe(200);
    });

    it('passes correct action to checkPermission for GET /applications', async () => {
      mockedCheckPermission.mockResolvedValue({ allowed: true });
      mockedListApplications.mockResolvedValue([]);

      await request(app)
        .get('/api/town-planning/applications')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'admin')
        .query({ projectId: 'proj-1' });

      expect(mockedCheckPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'view_application',
          projectId: 'proj-1',
        })
      );
    });
  });

  // ─── Validation Error Handling ─────────────────────────────────────────────

  describe('Validation (400)', () => {
    it('returns 400 when projectId is missing from GET /applications', async () => {
      const res = await request(app)
        .get('/api/town-planning/applications')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'admin');

      // requireAction needs projectId from query
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Project context required');
    });

    it('returns 400 when required fields missing from PATCH /comments/:id', async () => {
      const res = await request(app)
        .patch('/api/town-planning/comments/comment-1')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'town_planner')
        .send({}); // Missing applicationId and projectId

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('applicationId and projectId');
    });

    it('returns 400 when field missing from PATCH /property/:projectId', async () => {
      mockedCheckPermission.mockResolvedValue({ allowed: true });

      const res = await request(app)
        .patch('/api/town-planning/property/proj-1')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'town_planner')
        .send({}); // Missing field

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('field is required');
    });
  });

  // ─── Not Found Handling ────────────────────────────────────────────────────

  describe('Not Found (404)', () => {
    it('returns 404 when application not found', async () => {
      mockedCheckPermission.mockResolvedValue({ allowed: true });
      mockedGetApplication.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/town-planning/applications/nonexistent')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'admin')
        .query({ projectId: 'proj-1' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('returns 404 when municipality profile not found', async () => {
      mockedGetMunicipality.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/town-planning/municipalities/nonexistent')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'admin');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  // ─── Successful Operations ─────────────────────────────────────────────────

  describe('Successful Operations', () => {
    it('GET /applications returns list of applications', async () => {
      mockedCheckPermission.mockResolvedValue({ allowed: true });
      mockedListApplications.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/town-planning/applications')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'town_planner')
        .query({ projectId: 'proj-1' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /municipalities returns list', async () => {
      mockedListMunicipalities.mockResolvedValue([
        { id: 'muni-1', name: 'City of Cape Town', province: 'Western Cape' } as any,
      ]);

      const res = await request(app)
        .get('/api/town-planning/municipalities')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'admin');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('City of Cape Town');
    });

    it('GET /applications/:id returns single application', async () => {
      mockedCheckPermission.mockResolvedValue({ allowed: true });
      mockedGetApplication.mockResolvedValue({
        id: 'app-1',
        projectId: 'proj-1',
        referenceNumber: 'TP-PROJ-001',
        applicationType: 'rezoning',
        stage: 'preparation',
      } as any);

      const res = await request(app)
        .get('/api/town-planning/applications/app-1')
        .set('x-user-id', 'user-1')
        .set('x-user-role', 'town_planner')
        .query({ projectId: 'proj-1' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('app-1');
      expect(res.body.data.referenceNumber).toBe('TP-PROJ-001');
    });
  });
});
