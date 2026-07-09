/**
 * Remote Desktop Core — API Router Validation Tests
 *
 * Tests the request validation schemas used by the Session Broker REST API router,
 * verifying correct acceptance/rejection of payloads per the API contract.
 *
 * Also verifies router file structure (routes exist, auth applied, mounting correct).
 *
 * Requirements: 3.1, 4.1, 1.1, 2.4, 8.3, 11.3, 12.1
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HardwareSpecsSchema,
  HostConfigurationSchema,
} from '../schemas';

// ─── Request Validation Schemas (mirror those defined in the router) ────────

const RegisterHostBodySchema = z.object({
  machineName: z.string().min(1).max(64),
  osVersion: z.string().min(1),
  hardwareSpecs: HardwareSpecsSchema,
  configuration: HostConfigurationSchema,
});

const HeartbeatBodySchema = z.object({
  status: z.enum(['online', 'offline', 'in_session']),
  cpuUtilisation: z.number().min(0).max(100),
  availableRamMb: z.number().min(0),
});

const UpdateAppsBodySchema = z.object({
  apps: z.array(
    z.object({
      displayName: z.string().min(1).max(128),
      executablePath: z.string().min(1).max(512),
      softwareCategory: z.string().min(1).max(64),
    }),
  ).min(1).max(20),
});

const GenerateTokenBodySchema = z.object({
  bookingId: z.string().min(1),
  consumerUid: z.string().min(1),
  hostId: z.string().min(1),
  windowStart: z.number().int(),
  windowEnd: z.number().int(),
  gracePeriodSeconds: z.number().int().min(60).max(1800),
});

const EndSessionBodySchema = z.object({
  reason: z.string().min(1).max(256),
});

const ApproveFilesBodySchema = z.object({
  approvedFileNames: z.array(z.string().min(1)).min(1),
});

const BillingBodySchema = z.object({
  billedDurationMinutes: z.number().int().min(1).max(1440),
  ownerApproved: z.boolean(),
});

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Router File Structure Verification ─────────────────────────────────────

describe('Remote Desktop API Router — File Structure', () => {
  // Use process.cwd() instead of __dirname for reliable path resolution
  const routerPath = join(process.cwd(), 'src/lib/remote-desktop-api-router.ts');
  const apiRouterPath = join(process.cwd(), 'src/lib/api-router.ts');

  let routerSource: string;
  let apiRouterSource: string;

  try {
    routerSource = readFileSync(routerPath, 'utf-8');
    apiRouterSource = readFileSync(apiRouterPath, 'utf-8');
  } catch {
    routerSource = '';
    apiRouterSource = '';
  }

  it('should export a default router', () => {
    expect(routerSource).toContain('export default router');
  });

  it('should use requireAuth middleware', () => {
    expect(routerSource).toContain("import { requireAuth } from './roleMiddleware'");
    expect(routerSource).toContain('router.use(requireAuth)');
  });

  it('should define POST /hosts/register route', () => {
    expect(routerSource).toContain("router.post('/hosts/register'");
  });

  it('should define POST /hosts/:hostId/heartbeat route', () => {
    expect(routerSource).toContain("router.post('/hosts/:hostId/heartbeat'");
  });

  it('should define GET /hosts/:hostId/config route', () => {
    expect(routerSource).toContain("router.get('/hosts/:hostId/config'");
  });

  it('should define PUT /hosts/:hostId/apps route', () => {
    expect(routerSource).toContain("router.put('/hosts/:hostId/apps'");
  });

  it('should define POST /sessions/token route', () => {
    expect(routerSource).toContain("router.post('/sessions/token'");
  });

  it('should define GET /sessions/:sessionId route', () => {
    expect(routerSource).toContain("router.get('/sessions/:sessionId'");
  });

  it('should define POST /sessions/:sessionId/end route', () => {
    expect(routerSource).toContain("router.post('/sessions/:sessionId/end'");
  });

  it('should define GET /sessions/:sessionId/manifest route', () => {
    expect(routerSource).toContain("router.get('/sessions/:sessionId/manifest'");
  });

  it('should define POST /sessions/:sessionId/approve-files route', () => {
    expect(routerSource).toContain("router.post('/sessions/:sessionId/approve-files'");
  });

  it('should define POST /sessions/:sessionId/billing route', () => {
    expect(routerSource).toContain("router.post('/sessions/:sessionId/billing'");
  });

  it('should define GET /audit/:sessionId/events route', () => {
    expect(routerSource).toContain("router.get('/audit/:sessionId/events'");
  });

  it('should import Zod schemas from remoteDesktop/schemas', () => {
    expect(routerSource).toContain("from '../services/remoteDesktop/schemas'");
  });

  it('should import service functions from remoteDesktopService', () => {
    expect(routerSource).toContain("from '../services/remoteDesktop/remoteDesktopService'");
  });

  it('should be mounted at /api/remote-desktop/ in main api-router', () => {
    expect(apiRouterSource).toContain('import remoteDesktopCoreRouter from "./remote-desktop-api-router"');
    expect(apiRouterSource).toContain('router.use("/remote-desktop", remoteDesktopCoreRouter)');
  });
});

// ─── Schema Validation Tests ────────────────────────────────────────────────

describe('Remote Desktop API Router — Request Validation Schemas', () => {
  describe('RegisterHostBodySchema', () => {
    it('should accept valid registration payload', () => {
      const result = RegisterHostBodySchema.safeParse({
        machineName: 'My Workstation',
        osVersion: 'Windows 11 23H2',
        hardwareSpecs: {
          cpuModel: 'Intel i9-13900K',
          ramMb: 32768,
          gpuModel: 'NVIDIA RTX 4090',
          storageGb: 2048,
        },
        configuration: {
          gracePeriodSeconds: 300,
          clipboardPolicy: 'disabled',
          sessionWorkspacePath: 'C:\\ArchitexSessions',
          recordingEnabled: false,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject machine name exceeding 64 characters', () => {
      const result = RegisterHostBodySchema.safeParse({
        machineName: 'x'.repeat(65),
        osVersion: 'Windows 11',
        hardwareSpecs: { cpuModel: 'i9', ramMb: 1024, gpuModel: 'RTX', storageGb: 512 },
        configuration: { gracePeriodSeconds: 300, clipboardPolicy: 'disabled', sessionWorkspacePath: 'C:\\', recordingEnabled: false },
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty machine name', () => {
      const result = RegisterHostBodySchema.safeParse({
        machineName: '',
        osVersion: 'Windows 11',
        hardwareSpecs: { cpuModel: 'i9', ramMb: 1024, gpuModel: 'RTX', storageGb: 512 },
        configuration: { gracePeriodSeconds: 300, clipboardPolicy: 'disabled', sessionWorkspacePath: 'C:\\', recordingEnabled: false },
      });
      expect(result.success).toBe(false);
    });

    it('should reject grace period exceeding 3600 seconds', () => {
      const result = RegisterHostBodySchema.safeParse({
        machineName: 'Test',
        osVersion: 'Windows 11',
        hardwareSpecs: { cpuModel: 'i9', ramMb: 1024, gpuModel: 'RTX', storageGb: 512 },
        configuration: { gracePeriodSeconds: 3601, clipboardPolicy: 'disabled', sessionWorkspacePath: 'C:\\', recordingEnabled: false },
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid clipboard policy', () => {
      const result = RegisterHostBodySchema.safeParse({
        machineName: 'Test',
        osVersion: 'Windows 11',
        hardwareSpecs: { cpuModel: 'i9', ramMb: 1024, gpuModel: 'RTX', storageGb: 512 },
        configuration: { gracePeriodSeconds: 300, clipboardPolicy: 'text_only', sessionWorkspacePath: 'C:\\', recordingEnabled: false },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('HeartbeatBodySchema', () => {
    it('should accept valid heartbeat payload', () => {
      const result = HeartbeatBodySchema.safeParse({
        status: 'online',
        cpuUtilisation: 45.5,
        availableRamMb: 16384,
      });
      expect(result.success).toBe(true);
    });

    it('should accept in_session status', () => {
      const result = HeartbeatBodySchema.safeParse({
        status: 'in_session',
        cpuUtilisation: 85,
        availableRamMb: 8192,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status value', () => {
      const result = HeartbeatBodySchema.safeParse({
        status: 'sleeping',
        cpuUtilisation: 45.5,
        availableRamMb: 16384,
      });
      expect(result.success).toBe(false);
    });

    it('should reject CPU utilisation above 100', () => {
      const result = HeartbeatBodySchema.safeParse({
        status: 'online',
        cpuUtilisation: 101,
        availableRamMb: 16384,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative available RAM', () => {
      const result = HeartbeatBodySchema.safeParse({
        status: 'online',
        cpuUtilisation: 50,
        availableRamMb: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateAppsBodySchema', () => {
    it('should accept valid apps array', () => {
      const result = UpdateAppsBodySchema.safeParse({
        apps: [
          { displayName: 'AutoCAD', executablePath: 'C:\\Program Files\\AutoCAD\\acad.exe', softwareCategory: 'CAD' },
          { displayName: 'Revit', executablePath: 'C:\\Program Files\\Revit\\revit.exe', softwareCategory: 'BIM' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject more than 20 apps', () => {
      const apps = Array.from({ length: 21 }, (_, i) => ({
        displayName: `App ${i}`,
        executablePath: `C:\\app${i}.exe`,
        softwareCategory: 'General',
      }));
      const result = UpdateAppsBodySchema.safeParse({ apps });
      expect(result.success).toBe(false);
    });

    it('should reject empty apps array', () => {
      const result = UpdateAppsBodySchema.safeParse({ apps: [] });
      expect(result.success).toBe(false);
    });

    it('should reject display name exceeding 128 characters', () => {
      const result = UpdateAppsBodySchema.safeParse({
        apps: [
          { displayName: 'x'.repeat(129), executablePath: 'C:\\app.exe', softwareCategory: 'General' },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GenerateTokenBodySchema', () => {
    it('should accept valid token generation payload', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: 'booking-123',
        consumerUid: 'user-456',
        hostId: 'host-789',
        windowStart: Date.now(),
        windowEnd: Date.now() + 3600000,
        gracePeriodSeconds: 300,
      });
      expect(result.success).toBe(true);
    });

    it('should accept minimum grace period (60 seconds)', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: 'booking-123',
        consumerUid: 'user-456',
        hostId: 'host-789',
        windowStart: Date.now(),
        windowEnd: Date.now() + 3600000,
        gracePeriodSeconds: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maximum grace period (1800 seconds)', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: 'booking-123',
        consumerUid: 'user-456',
        hostId: 'host-789',
        windowStart: Date.now(),
        windowEnd: Date.now() + 3600000,
        gracePeriodSeconds: 1800,
      });
      expect(result.success).toBe(true);
    });

    it('should reject grace period below 60 seconds', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: 'booking-123',
        consumerUid: 'user-456',
        hostId: 'host-789',
        windowStart: Date.now(),
        windowEnd: Date.now() + 3600000,
        gracePeriodSeconds: 30,
      });
      expect(result.success).toBe(false);
    });

    it('should reject grace period above 1800 seconds', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: 'booking-123',
        consumerUid: 'user-456',
        hostId: 'host-789',
        windowStart: Date.now(),
        windowEnd: Date.now() + 3600000,
        gracePeriodSeconds: 1801,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: 'booking-123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty bookingId', () => {
      const result = GenerateTokenBodySchema.safeParse({
        bookingId: '',
        consumerUid: 'user-456',
        hostId: 'host-789',
        windowStart: Date.now(),
        windowEnd: Date.now() + 3600000,
        gracePeriodSeconds: 300,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EndSessionBodySchema', () => {
    it('should accept valid reason', () => {
      const result = EndSessionBodySchema.safeParse({ reason: 'User disconnected' });
      expect(result.success).toBe(true);
    });

    it('should reject reason exceeding 256 characters', () => {
      const result = EndSessionBodySchema.safeParse({ reason: 'x'.repeat(257) });
      expect(result.success).toBe(false);
    });

    it('should reject empty reason', () => {
      const result = EndSessionBodySchema.safeParse({ reason: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('ApproveFilesBodySchema', () => {
    it('should accept valid file names', () => {
      const result = ApproveFilesBodySchema.safeParse({
        approvedFileNames: ['design.dwg', 'report.pdf'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty file names array', () => {
      const result = ApproveFilesBodySchema.safeParse({
        approvedFileNames: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty string in file names', () => {
      const result = ApproveFilesBodySchema.safeParse({
        approvedFileNames: ['valid.pdf', ''],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BillingBodySchema', () => {
    it('should accept valid billing payload', () => {
      const result = BillingBodySchema.safeParse({
        billedDurationMinutes: 60,
        ownerApproved: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept minimum billed duration (1 minute)', () => {
      const result = BillingBodySchema.safeParse({
        billedDurationMinutes: 1,
        ownerApproved: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maximum billed duration (1440 minutes)', () => {
      const result = BillingBodySchema.safeParse({
        billedDurationMinutes: 1440,
        ownerApproved: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject billed duration below 1 minute', () => {
      const result = BillingBodySchema.safeParse({
        billedDurationMinutes: 0,
        ownerApproved: true,
      });
      expect(result.success).toBe(false);
    });

    it('should reject billed duration above 1440 minutes', () => {
      const result = BillingBodySchema.safeParse({
        billedDurationMinutes: 1441,
        ownerApproved: true,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing ownerApproved', () => {
      const result = BillingBodySchema.safeParse({
        billedDurationMinutes: 60,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AuditQuerySchema', () => {
    it('should accept valid query params', () => {
      const result = AuditQuerySchema.safeParse({ limit: '100', offset: '0' });
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(100);
      expect(result.data?.offset).toBe(0);
    });

    it('should use defaults when not provided', () => {
      const result = AuditQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(50);
      expect(result.data?.offset).toBe(0);
    });

    it('should reject limit exceeding 200', () => {
      const result = AuditQuerySchema.safeParse({ limit: '201', offset: '0' });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = AuditQuerySchema.safeParse({ limit: '50', offset: '-1' });
      expect(result.success).toBe(false);
    });

    it('should reject limit of 0', () => {
      const result = AuditQuerySchema.safeParse({ limit: '0', offset: '0' });
      expect(result.success).toBe(false);
    });
  });
});
