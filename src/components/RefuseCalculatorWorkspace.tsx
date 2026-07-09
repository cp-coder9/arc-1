/**
 * Municipal Refuse Area Calculator — Workspace Component
 *
 * Main workspace for the refuse area calculator tool. Renders inside AppShell
 * content area following the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 9.5, 9.8
 */

import React, { useReducer, useCallback } from 'react';
import type { UserProfile } from '@/types';
import type {
  Municipality_Profile,
  BuildingType,
  BuildingInputs,
  Refuse_Area_Result,
  Professional_Sign_Off_Record,
} from '@/services/refuseArea/types';
import { loadProfile } from '@/services/refuseArea/municipalityProfileService';
import { computeRefuseArea } from '@/services/refuseArea/refuseAreaCalculatorService';
import { generateRefuseAreaPdf } from '@/services/refuseArea/refuseReportService';
import { createSignOff } from '@/services/refuseArea/signOffService';
import { saveToProjectPassport, pushToSpecForge } from '@/services/refuseArea/refuseIntegrationService';
import MunicipalitySelector from '@/components/refuseArea/MunicipalitySelector';
import BuildingInputForm from '@/components/refuseArea/BuildingInputForm';
import SignOffModal from '@/components/refuseArea/SignOffModal';
import ActionBar from '@/components/refuseArea/ActionBar';

// ── Props ────────────────────────────────────────────────────────────────────

interface RefuseCalculatorWorkspaceProps {
  user: UserProfile;
  projectId?: string;
}

// ── State ────────────────────────────────────────────────────────────────────

interface CalculatorState {
  step: 'input' | 'results';
  municipalityId: string | null;
  profile: Municipality_Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  buildingType: BuildingType | null;
  inputs: BuildingInputs | null;
  result: Refuse_Area_Result | null;
  signOffCompleted: boolean;
  signOffRecord: Professional_Sign_Off_Record | null;
  signOffModalOpen: boolean;
  signOffDismissed: boolean;
  saving: boolean;
  exportingPdf: boolean;
  saveError: boolean;
  exportError: boolean;
  specForgeError: boolean;
}

// ── Actions ──────────────────────────────────────────────────────────────────

type CalculatorAction =
  | { type: 'SET_MUNICIPALITY'; payload: string }
  | { type: 'SET_PROFILE'; payload: Municipality_Profile }
  | { type: 'SET_PROFILE_ERROR'; payload: string | null }
  | { type: 'SET_BUILDING_TYPE'; payload: BuildingType }
  | { type: 'SET_INPUTS'; payload: BuildingInputs }
  | { type: 'SET_RESULT'; payload: Refuse_Area_Result }
  | { type: 'SET_SIGN_OFF'; payload: Professional_Sign_Off_Record }
  | { type: 'OPEN_SIGN_OFF_MODAL' }
  | { type: 'CLOSE_SIGN_OFF_MODAL' }
  | { type: 'DISMISS_SIGN_OFF' }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_EXPORTING'; payload: boolean }
  | { type: 'SET_SAVE_ERROR'; payload: boolean }
  | { type: 'SET_EXPORT_ERROR'; payload: boolean }
  | { type: 'SET_SPECFORGE_ERROR'; payload: boolean }
  | { type: 'RESET' };

// ── Initial State ────────────────────────────────────────────────────────────

const initialState: CalculatorState = {
  step: 'input',
  municipalityId: null,
  profile: null,
  profileLoading: false,
  profileError: null,
  buildingType: null,
  inputs: null,
  result: null,
  signOffCompleted: false,
  signOffRecord: null,
  signOffModalOpen: false,
  signOffDismissed: false,
  saving: false,
  exportingPdf: false,
  saveError: false,
  exportError: false,
  specForgeError: false,
};

// ── Reducer ──────────────────────────────────────────────────────────────────

function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'SET_MUNICIPALITY':
      return {
        ...state,
        municipalityId: action.payload,
        profileLoading: true,
        profileError: null,
        profile: null,
      };

    case 'SET_PROFILE':
      return {
        ...state,
        profile: action.payload,
        profileLoading: false,
        profileError: null,
      };

    case 'SET_PROFILE_ERROR':
      return {
        ...state,
        profileLoading: false,
        profileError: action.payload,
      };

    case 'SET_BUILDING_TYPE':
      return {
        ...state,
        buildingType: action.payload,
        inputs: null,
        result: null,
        signOffCompleted: false,
        signOffRecord: null,
        signOffDismissed: false,
        saveError: false,
        exportError: false,
        specForgeError: false,
      };

    case 'SET_INPUTS':
      return {
        ...state,
        inputs: action.payload,
      };

    case 'SET_RESULT':
      return {
        ...state,
        result: action.payload,
        step: 'results',
      };

    case 'SET_SIGN_OFF':
      return {
        ...state,
        signOffCompleted: true,
        signOffRecord: action.payload,
        signOffModalOpen: false,
        signOffDismissed: false,
      };

    case 'OPEN_SIGN_OFF_MODAL':
      return {
        ...state,
        signOffModalOpen: true,
      };

    case 'CLOSE_SIGN_OFF_MODAL':
      return {
        ...state,
        signOffModalOpen: false,
      };

    case 'DISMISS_SIGN_OFF':
      return {
        ...state,
        signOffModalOpen: false,
        signOffDismissed: true,
      };

    case 'SET_SAVING':
      return {
        ...state,
        saving: action.payload,
      };

    case 'SET_EXPORTING':
      return {
        ...state,
        exportingPdf: action.payload,
      };

    case 'SET_SAVE_ERROR':
      return {
        ...state,
        saveError: action.payload,
      };

    case 'SET_EXPORT_ERROR':
      return {
        ...state,
        exportError: action.payload,
      };

    case 'SET_SPECFORGE_ERROR':
      return {
        ...state,
        specForgeError: action.payload,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RefuseCalculatorWorkspace({ user, projectId }: RefuseCalculatorWorkspaceProps) {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);

  // Municipality selection handler — loads profile after selection
  const handleMunicipalitySelect = useCallback(async (municipalityId: string) => {
    dispatch({ type: 'SET_MUNICIPALITY', payload: municipalityId });
    try {
      const profile = await loadProfile(municipalityId);
      dispatch({ type: 'SET_PROFILE', payload: profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load municipality profile';
      dispatch({ type: 'SET_PROFILE_ERROR', payload: message });
    }
  }, []);

  // Retry handler — re-attempts loading the currently selected municipality
  const handleRetry = useCallback(async () => {
    if (!state.municipalityId) return;
    dispatch({ type: 'SET_MUNICIPALITY', payload: state.municipalityId });
    try {
      const profile = await loadProfile(state.municipalityId);
      dispatch({ type: 'SET_PROFILE', payload: profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load municipality profile';
      dispatch({ type: 'SET_PROFILE_ERROR', payload: message });
    }
  }, [state.municipalityId]);

  // Calculate handler — runs the pure computation engine
  const handleCalculate = useCallback(() => {
    if (!state.profile || !state.inputs) return;
    const result = computeRefuseArea(state.profile, state.inputs);
    dispatch({ type: 'SET_RESULT', payload: result });
  }, [state.profile, state.inputs]);

  // Sign-off confirm handler — creates sign-off record
  const handleSignOffConfirm = useCallback(async () => {
    if (!state.result) return;
    try {
      const signOff = await createSignOff(
        { uid: user.uid, displayName: user.displayName, role: user.role },
        state.result,
        '(a) This output is advisory only and does not constitute legal compliance certification. (b) I have reviewed the computed results in full. (c) Professional verification against current local bylaws remains my responsibility.',
        projectId
      );
      dispatch({ type: 'SET_SIGN_OFF', payload: signOff });
    } catch {
      // Sign-off failure — close modal, user can retry
      dispatch({ type: 'CLOSE_SIGN_OFF_MODAL' });
    }
  }, [state.result, user, projectId]);

  // Sign-off modal dismiss handler
  const handleSignOffDismiss = useCallback(() => {
    dispatch({ type: 'DISMISS_SIGN_OFF' });
  }, []);

  // Export PDF handler
  const handleExportPdf = useCallback(async () => {
    if (!state.result || !state.signOffRecord) return;
    dispatch({ type: 'SET_EXPORTING', payload: true });
    dispatch({ type: 'SET_EXPORT_ERROR', payload: false });
    try {
      const pdfBytes = await generateRefuseAreaPdf(state.result, state.signOffRecord);
      // Trigger download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `refuse-area-report-${state.result.municipalityId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      dispatch({ type: 'SET_EXPORT_ERROR', payload: true });
    } finally {
      dispatch({ type: 'SET_EXPORTING', payload: false });
    }
  }, [state.result, state.signOffRecord]);

  // Save to Project Passport handler
  const handleSavePassport = useCallback(async () => {
    if (!state.result || !state.signOffRecord || !projectId) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    dispatch({ type: 'SET_SAVE_ERROR', payload: false });
    try {
      await saveToProjectPassport(state.result, state.signOffRecord, projectId);
    } catch {
      dispatch({ type: 'SET_SAVE_ERROR', payload: true });
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.result, state.signOffRecord, projectId]);

  // Push to SpecForge handler
  const handlePushSpecForge = useCallback(async () => {
    if (!state.result || !state.signOffRecord || !projectId) return;
    dispatch({ type: 'SET_SAVING', payload: true });
    dispatch({ type: 'SET_SPECFORGE_ERROR', payload: false });
    try {
      await pushToSpecForge(state.result, state.signOffRecord, projectId);
    } catch {
      dispatch({ type: 'SET_SPECFORGE_ERROR', payload: true });
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.result, state.signOffRecord, projectId]);

  const projectName = projectId ? `Project ${projectId}` : 'New Calculation';

  // Determine ActionBar state
  const canCalculate = !!(state.profile && state.inputs && !state.profileLoading);
  const hasResults = !!state.result;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">REFUSE AREA CALCULATOR</div>
            <h1>{projectName}</h1>
            <p className="sub">
              Module 4 · Compliance + Municipal Readiness · Advisory Only
            </p>
          </div>
        </div>
        {state.profile && (
          <div className="hero-pills">
            <span className="pill">
              <span className="dot"></span> {state.profile.name}
            </span>
            {state.signOffCompleted && (
              <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)' }}>
                <span className="dot" style={{ background: 'var(--green)' }}></span> Signed Off
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Stat Row — visible only after computation */}
      {state.result && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--deep)' }}>
              {state.result.area.totalAreaSqm} m²
            </div>
            <div className="stat-label">Total Area</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--teal)' }}>
              {state.result.bins.generalWaste.binCount}
              {state.result.bins.recyclableWaste
                ? ` + ${state.result.bins.recyclableWaste.binCount}`
                : ''}
            </div>
            <div className="stat-label">Bins Required</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--deep)' }}>
              {state.result.vehicleAccess.minimumRoadWidth != null
                ? `${state.result.vehicleAccess.minimumRoadWidth} m`
                : '—'}
            </div>
            <div className="stat-label">Access Width</div>
          </div>
        </div>
      )}

      {/* 3. Panel: Municipality Selection */}
      <section className="panel">
        <h2>Municipality Selection</h2>
        <MunicipalitySelector
          selectedId={state.municipalityId}
          loading={state.profileLoading}
          error={state.profileError}
          onSelect={handleMunicipalitySelect}
          onRetry={handleRetry}
        />
      </section>

      {/* 4. Panel: Building Inputs */}
      <section className="panel">
        <h2>Building Inputs</h2>
        <BuildingInputForm
          buildingType={state.buildingType}
          onBuildingTypeChange={(type) => dispatch({ type: 'SET_BUILDING_TYPE', payload: type })}
          onSubmit={(inputs) => dispatch({ type: 'SET_INPUTS', payload: inputs })}
          disabled={!state.profile || state.profileLoading}
        />
      </section>

      {/* 5. Panel: Results — visible only after computation */}
      {state.result && (
        <section className="panel">
          <h2>Results Summary</h2>
          {/* ResultSummaryPanel placeholder — will be implemented in task 10.4 */}
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>
            Result summary panel component will be rendered here.
          </p>
        </section>
      )}

      {/* 6. ActionBar */}
      <ActionBar
        canCalculate={canCalculate}
        canExport={hasResults}
        saving={state.saving}
        exporting={state.exportingPdf}
        signOffCompleted={state.signOffCompleted}
        hasProjectContext={!!projectId}
        signOffDismissed={state.signOffDismissed}
        onCalculate={handleCalculate}
        onExportPdf={handleExportPdf}
        onSavePassport={handleSavePassport}
        onPushSpecForge={handlePushSpecForge}
        onSignOff={() => dispatch({ type: 'OPEN_SIGN_OFF_MODAL' })}
        saveError={state.saveError}
        exportError={state.exportError}
        specForgeError={state.specForgeError}
      />

      {/* 7. SignOffModal */}
      <SignOffModal
        open={state.signOffModalOpen}
        onClose={handleSignOffDismiss}
        onConfirm={handleSignOffConfirm}
      />
    </div>
  );
}
