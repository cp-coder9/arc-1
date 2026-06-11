import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { seedUserSandbox } from '../demo-seed/seedAllData';

export type DemoRole =
  | 'client'
  | 'project_manager'
  | 'architect'
  | 'architectural_technologist'
  | 'candidate_architect'
  | 'engineer_structural'
  | 'engineer_civil'
  | 'engineer_electrical'
  | 'engineer_mechanical'
  | 'engineer_fire'
  | 'quantity_surveyor'
  | 'contractor'
  | 'subcontractor'
  | 'supplier'
  | 'energy_consultant'
  | 'town_planner'
  | 'environmental_consultant'
  | 'accessibility_consultant'
  | 'bep'
  | 'freelancer'
  | 'cpd_officer'
  | 'admin';

export interface DemoGroup {
  label: string;
  roles: { value: DemoRole; label: string }[];
}

export const DEMO_ROLE_GROUPS: DemoGroup[] = [
  {
    label: 'Client-side',
    roles: [
      { value: 'client', label: 'Client / Developer' },
      { value: 'project_manager', label: 'Project Manager' },
    ],
  },
  {
    label: 'Design Team',
    roles: [
      { value: 'architect', label: 'Architect (PrArch)' },
      { value: 'architectural_technologist', label: 'Architectural Technologist' },
      { value: 'candidate_architect', label: 'Candidate Architect' },
      { value: 'town_planner', label: 'Town Planner' },
      { value: 'energy_consultant', label: 'Energy Consultant' },
      { value: 'accessibility_consultant', label: 'Accessibility Consultant' },
      { value: 'environmental_consultant', label: 'Environmental Consultant' },
    ],
  },
  {
    label: 'Engineering',
    roles: [
      { value: 'engineer_structural', label: 'Structural Engineer (PrEng)' },
      { value: 'engineer_civil', label: 'Civil Engineer (PrEng)' },
      { value: 'engineer_electrical', label: 'Electrical Engineer (PrEng)' },
      { value: 'engineer_mechanical', label: 'Mechanical Engineer (PrEng)' },
      { value: 'engineer_fire', label: 'Fire Engineer' },
    ],
  },
  {
    label: 'Quantity Surveying',
    roles: [
      { value: 'quantity_surveyor', label: 'Quantity Surveyor (PrQS)' },
    ],
  },
  {
    label: 'Construction',
    roles: [
      { value: 'contractor', label: 'Contractor (Main)' },
      { value: 'subcontractor', label: 'Subcontractor' },
      { value: 'supplier', label: 'Supplier' },
    ],
  },
  {
    label: 'CPD & Learning',
    roles: [
      { value: 'cpd_officer', label: 'CPD Officer / Administrator' },
    ],
  },
  {
    label: 'Platform',
    roles: [
      { value: 'bep', label: 'BEP / Professional' },
      { value: 'freelancer', label: 'Freelancer / Draughtsperson' },
      { value: 'admin', label: 'Administrator' },
    ],
  },
];

// Map demo role to the codebase's internal UserRole for dashboard routing
export const DEMO_ROLE_TO_INTERNAL: Record<DemoRole, string> = {
  client: 'client',
  project_manager: 'client',
  architect: 'architect',
  architectural_technologist: 'architect',
  candidate_architect: 'architect',
  engineer_structural: 'bep',
  engineer_civil: 'bep',
  engineer_electrical: 'bep',
  engineer_mechanical: 'bep',
  engineer_fire: 'bep',
  quantity_surveyor: 'bep',
  contractor: 'contractor',
  subcontractor: 'subcontractor',
  supplier: 'supplier',
  energy_consultant: 'bep',
  town_planner: 'bep',
  environmental_consultant: 'bep',
  accessibility_consultant: 'bep',
  bep: 'bep',
  freelancer: 'freelancer',
  cpd_officer: 'admin',    // CPD admin maps to admin dashboard
  admin: 'admin',
};

interface DemoModeContextValue {
  isDemoMode: boolean;
  demoRole: DemoRole;
  setDemoRole: (role: DemoRole) => void;
  internalRole: string;
  isSeeded: boolean;
  seeding: boolean;
  reseed: () => Promise<void>;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  demoRole: 'architect',
  setDemoRole: () => {},
  internalRole: 'architect',
  isSeeded: false,
  seeding: false,
  reseed: async () => {},
});

export function useDemoMode() {
  return useContext(DemoModeContext);
}

/** For any component that needs the effective role (demo overrides real auth role) */
export function useDemoRole() {
  const { demoRole, internalRole, isDemoMode, setDemoRole } = useContext(DemoModeContext);
  return { demoRole, internalRole, isDemoMode, setDemoRole };
}

interface DemoModeProviderProps {
  children: ReactNode;
}

export function DemoModeProvider({ children }: DemoModeProviderProps) {
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const [demoRole, setDemoRoleState] = useState<DemoRole>('architect');
  const [isSeeded, setIsSeeded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    if (!isDemoMode) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Check if seed flag exists
        const flagDoc = await getDoc(doc(db, 'demo_seed_flags', u.uid));
        if (flagDoc.exists() && flagDoc.data()?.seeded === true) {
          setIsSeeded(true);
        } else {
          // Auto-seed on first login
          setSeeding(true);
          try {
            await seedUserSandbox(u.uid);
            await setDoc(doc(db, 'demo_seed_flags', u.uid), {
              seeded: true,
              seededAt: new Date().toISOString(),
            });
            setIsSeeded(true);
          } catch (err) {
            console.error('Demo seed failed:', err);
          } finally {
            setSeeding(false);
          }
        }
      }
    });
    return () => unsub();
  }, [isDemoMode]);

  const setDemoRole = useCallback((role: DemoRole) => {
    setDemoRoleState(role);
    localStorage.setItem('demo:activeRole', role);
  }, []);

  // Restore last-used role from localStorage on mount
  useEffect(() => {
    if (!isDemoMode) return;
    const saved = localStorage.getItem('demo:activeRole') as DemoRole | null;
    if (saved && DEMO_ROLE_TO_INTERNAL[saved] !== undefined) {
      setDemoRoleState(saved);
    }
  }, [isDemoMode]);

  const reseed = useCallback(async () => {
    if (!user) return;
    setSeeding(true);
    try {
      await seedUserSandbox(user.uid, true); // force = true replaces existing
      await setDoc(doc(db, 'demo_seed_flags', user.uid), {
        seeded: true,
        seededAt: new Date().toISOString(),
      });
      setIsSeeded(true);
    } catch (err) {
      console.error('Demo reseed failed:', err);
    } finally {
      setSeeding(false);
    }
  }, [user]);

  const internalRole = DEMO_ROLE_TO_INTERNAL[demoRole];

  return (
    <DemoModeContext.Provider value={{ isDemoMode, demoRole, setDemoRole, internalRole, isSeeded, seeding, reseed }}>
      {children}
    </DemoModeContext.Provider>
  );
}
