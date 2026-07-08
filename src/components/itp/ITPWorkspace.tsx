import React, { useState } from 'react';
import type { UserProfile } from '@/types';
import ITPOverviewTab from './ITPOverviewTab';
import ITPDetailView from './ITPDetailView';
import CreateITPDialog from './CreateITPDialog';
import AddInspectionItemDialog from './AddInspectionItemDialog';
import HoldPointSignOffForm from './HoldPointSignOffForm';
import WitnessPointRecordForm from './WitnessPointRecordForm';
import ComplianceReportView from './ComplianceReportView';
import TestingScheduleTab from './TestingScheduleTab';
import MaterialTestList from './MaterialTestList';
import LabResultForm from './LabResultForm';

interface Props {
  user: UserProfile;
}

type ITPTab = 'overview' | 'itps' | 'material-testing' | 'hold-points' | 'reports';

const TABS: { id: ITPTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'itps', label: 'ITPs' },
  { id: 'material-testing', label: 'Material Testing' },
  { id: 'hold-points', label: 'Hold Points' },
  { id: 'reports', label: 'Reports' },
];

export default function ITPWorkspace({ user }: Props) {
  const [activeTab, setActiveTab] = useState<ITPTab>('overview');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">INSPECTION TEST PLANS</div>
            <h1>QA/QC & Inspection Test Plans</h1>
            <p className="sub">
              Module 7 · Site Execution · Quality Assurance Governance
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> Active
          </span>
          <span className="pill pill-success">
            <span className="dot"></span> 87.5% Compliance
          </span>
          <span className="pill pill-warning">
            <span className="dot"></span> 2 Breaches
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="panel" style={{ padding: '8px 14px' }}>
        <nav
          style={{ display: 'flex', gap: 4 }}
          role="tablist"
          aria-label="ITP workspace tabs"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--deep)' : 'var(--muted)',
                background: activeTab === tab.id ? 'var(--aqua)' : 'transparent',
                border: activeTab === tab.id ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <ITPOverviewTab />}

      {activeTab === 'itps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CreateITPDialog user={user} />
          <ITPDetailView user={user} />
          <AddInspectionItemDialog user={user} />
        </div>
      )}

      {activeTab === 'material-testing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TestingScheduleTab user={user} />
          <MaterialTestList user={user} />
          <LabResultForm user={user} />
        </div>
      )}

      {activeTab === 'hold-points' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <HoldPointSignOffForm user={user} />
          <WitnessPointRecordForm user={user} />
        </div>
      )}

      {activeTab === 'reports' && (
        <ComplianceReportView user={user} />
      )}
    </div>
  );
}
