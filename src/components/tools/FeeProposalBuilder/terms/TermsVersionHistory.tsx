// TermsVersionHistory — Version timeline per template
//
// Requirements: 7.4, 7.5

import { Clock, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface TermsVersionHistoryProps {
  templateId: string;
  templateTitle: string;
}

interface VersionEntry {
  version: number;
  date: string;
  author: string;
  changeNote: string;
  active: boolean;
}

const MOCK_VERSIONS: VersionEntry[] = [
  { version: 3, date: '2026-05-15', author: 'Admin', changeNote: 'Updated payment terms clause per client feedback', active: true },
  { version: 2, date: '2026-03-10', author: 'Legal', changeNote: 'Added mediation clause, reviewed for POPIA compliance', active: false },
  { version: 1, date: '2025-12-01', author: 'Admin', changeNote: 'Initial template creation', active: false },
];

export function TermsVersionHistory({ templateId, templateTitle }: TermsVersionHistoryProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <Clock className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Version History</h2>
        </div>
        <p className="text-sm text-surface-400">{templateTitle}</p>
      </div>

      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute left-2.5 top-2 bottom-2 w-px bg-surface-700/50" />

        <div className="space-y-4">
          {MOCK_VERSIONS.map((entry) => (
            <div key={entry.version} className="relative flex gap-4">
              {/* Timeline dot */}
              <div className={`absolute -left-3.5 top-2 w-3 h-3 rounded-full border-2 ${entry.active ? 'bg-primary-500 border-primary-400' : 'bg-surface-700 border-surface-600'}`} />

              <div className="flex-1 rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-surface-400" />
                    <span className="text-sm font-medium text-surface-100">Version {entry.version}</span>
                    {entry.active && (
                      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300 text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-surface-500">{entry.date}</span>
                </div>
                <p className="text-sm text-surface-300">{entry.changeNote}</p>
                <p className="text-xs text-surface-500 mt-1">By: {entry.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
