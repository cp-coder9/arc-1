/**
 * Unit tests for refuseIntegrationService
 *
 * Tests the integration logic for Project Passport writes, SpecForge pushes,
 * retry behaviour, and Action Centre alert creation.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import {
  saveToProjectPassport,
  pushToSpecForge,
  createFailedSyncAlert,
  projectPassportService,
  specForgeService,
  actionCentreService,
} from './refuseIntegrationService';
import type { Refuse_Area_Result, Professional_Sign_Off_Record } from './types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockResult: Refuse_Area_Result = {
  id: 'result-001',
  computedAt: '2026-05-15T10:30:00.000Z',
  municipalityId: 'city-of-johannesburg',
  municipalityName: 'City of Johannesburg',
  profileLastUpdated: '30 Apr 2026',
  buildingType: 'residential',
  inputs: {
    type: 'residential',
    data: { unitCount: 24, averageOccupantsPerUnit: 4 },
  },
  area: {
    totalAreaSqm: 8.64,
    dimensions: { length: 3.0, width: 2.9, height: 2.4 },
    minimumApplied: false,
  },
  bins: {
    totalWasteVolumeLitres: 5760,
    generalWaste: {
      binCapacityLitres: 1100,
      binCount: 6,
      totalVolumeLitres: 6600,
      binLabel: '1100L Bulk Bin',
    },
    totalFloorSpaceSqm: 4.32,
  },
  vehicleAccess: {
    minimumRoadWidth: 6.0,
    turningCircleRadius: 12.5,
    maximumGradient: 8,
    maximumCarryDistance: 30,
    hardstandRequired: true,
    hardstandDimensions: { length: 12, width: 4 },
    missingFields: [],
  },
  ventilation: {
    type: 'natural',
    naturalOpeningArea: 0.5,
    mechanicalRate: null,
    missingFields: [],
  },
  drainage: {
    floorGradient: 1.5,
    drainDiameter: 100,
    washDownRequired: true,
    washDownType: 'hose_connection',
    washDownLocation: 'adjacent to entrance',
    missingFields: [],
  },
  pestControl: 'Vermin-proof door sweeps required',
  advisoryDisclaimer:
    'This output is advisory only. It does not constitute legal compliance certification.',
};

const mockSignOff: Professional_Sign_Off_Record = {
  id: 'sign-off-001',
  resultId: 'result-001',
  timestamp: '2026-05-15T10:35:00.000Z',
  uid: 'user-123',
  displayName: 'John Architect',
  platformRole: 'architect',
  acknowledgementStatement: 'I confirm that I have reviewed this advisory output.',
  projectId: 'project-abc',
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('refuseIntegrationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('saveToProjectPassport', () => {
    it('writes a correctly shaped ProjectRecord on first attempt success', async () => {
      const writeSpy = vi
        .spyOn(projectPassportService, 'writeRecord')
        .mockResolvedValueOnce(undefined);

      const promise = saveToProjectPassport(mockResult, mockSignOff, 'project-abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy).toHaveBeenCalledWith('project-abc', {
        recordType: 'refuse_area_calculation',
        phase: 'comply',
        data: mockResult,
        metadata: {
          source: 'municipal-refuse-area-calculator',
          signOffId: 'sign-off-001',
          timestamp: '2026-05-15T10:35:00.000Z',
        },
      });
    });

    it('retries up to 3 times with exponential backoff on failure', async () => {
      const writeSpy = vi
        .spyOn(projectPassportService, 'writeRecord')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      const alertSpy = vi.spyOn(actionCentreService, 'createAlert');

      const promise = saveToProjectPassport(mockResult, mockSignOff, 'project-abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(writeSpy).toHaveBeenCalledTimes(3);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('creates an Action Centre alert after 3 failed attempts', async () => {
      vi.spyOn(projectPassportService, 'writeRecord')
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'));

      const alertSpy = vi.spyOn(actionCentreService, 'createAlert');

      const promise = saveToProjectPassport(mockResult, mockSignOff, 'project-abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(alertSpy).toHaveBeenCalledOnce();
      expect(alertSpy).toHaveBeenCalledWith({
        type: 'failed_sync',
        targetModule: 'project_passport',
        toolSource: 'municipal-refuse-area-calculator',
        message: 'Refuse area result could not be saved to project_passport. Manual retry required.',
        resultId: 'result-001',
      });
    });
  });

  describe('pushToSpecForge', () => {
    it('creates a correctly shaped spec item on first attempt success', async () => {
      const addSpy = vi
        .spyOn(specForgeService, 'addSpecItem')
        .mockResolvedValueOnce(undefined);

      const promise = pushToSpecForge(mockResult, mockSignOff, 'project-abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(addSpy).toHaveBeenCalledOnce();
      expect(addSpy).toHaveBeenCalledWith('project-abc', {
        elementType: 'refuse_room',
        specCategory: 'compliance',
        title: 'Refuse Storage Area — City of Johannesburg',
        summary: '8.64m² | 6 bins | City of Johannesburg',
        data: mockResult,
        status: 'issued',
        signOffId: 'sign-off-001',
      });
    });

    it('retries up to 3 times on failure then succeeds', async () => {
      const addSpy = vi
        .spyOn(specForgeService, 'addSpecItem')
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(undefined);

      const alertSpy = vi.spyOn(actionCentreService, 'createAlert');

      const promise = pushToSpecForge(mockResult, mockSignOff, 'project-abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(addSpy).toHaveBeenCalledTimes(2);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('creates an Action Centre alert after 3 failed attempts', async () => {
      vi.spyOn(specForgeService, 'addSpecItem')
        .mockRejectedValueOnce(new Error('Fail'))
        .mockRejectedValueOnce(new Error('Fail'))
        .mockRejectedValueOnce(new Error('Fail'));

      const alertSpy = vi.spyOn(actionCentreService, 'createAlert');

      const promise = pushToSpecForge(mockResult, mockSignOff, 'project-abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(alertSpy).toHaveBeenCalledOnce();
      expect(alertSpy).toHaveBeenCalledWith({
        type: 'failed_sync',
        targetModule: 'specforge',
        toolSource: 'municipal-refuse-area-calculator',
        message: 'Refuse area result could not be saved to specforge. Manual retry required.',
        resultId: 'result-001',
      });
    });
  });

  describe('createFailedSyncAlert', () => {
    it('creates an alert for project_passport target', () => {
      const alertSpy = vi.spyOn(actionCentreService, 'createAlert');

      createFailedSyncAlert('project_passport', 'result-xyz');

      expect(alertSpy).toHaveBeenCalledWith({
        type: 'failed_sync',
        targetModule: 'project_passport',
        toolSource: 'municipal-refuse-area-calculator',
        message: 'Refuse area result could not be saved to project_passport. Manual retry required.',
        resultId: 'result-xyz',
      });
    });

    it('creates an alert for specforge target', () => {
      const alertSpy = vi.spyOn(actionCentreService, 'createAlert');

      createFailedSyncAlert('specforge', 'result-abc');

      expect(alertSpy).toHaveBeenCalledWith({
        type: 'failed_sync',
        targetModule: 'specforge',
        toolSource: 'municipal-refuse-area-calculator',
        message: 'Refuse area result could not be saved to specforge. Manual retry required.',
        resultId: 'result-abc',
      });
    });
  });
});
