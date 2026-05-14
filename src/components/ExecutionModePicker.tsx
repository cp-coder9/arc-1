import React from 'react';
import { ExecutionMode } from '@/types';

const MODES: { value: ExecutionMode; label: string }[] = [
  { value: 'basic_ai_screen', label: 'Basic AI Screen' },
  { value: 'council_readiness', label: 'Council Readiness' },
  { value: 'fire_plan_review', label: 'Fire Plan Review' },
  { value: 'engineering_coordination', label: 'Engineering Coordination' },
  { value: 'full_professional_review', label: 'Full Professional Review' },
  { value: 'resubmission_delta_review', label: 'Resubmission Delta Review' },
  { value: 'specialist_pack_review', label: 'Specialist Pack Review' }
];

export function ExecutionModePicker({ value, onChange, className }: { value: ExecutionMode; onChange: (mode: ExecutionMode) => void; className?: string }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as ExecutionMode)} className={className || 'h-10 rounded-md border border-input bg-background px-3 py-2 text-sm'}>
      {MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
    </select>
  );
}

export default ExecutionModePicker;
