// ExportDialog — Format selection for run export
//
// Requirements: 8.3

import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

export interface ExportDialogProps {
  runId: string;
  onClose: () => void;
}

interface ExportFormat {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'pdf', label: 'PDF', description: 'Formatted document for client delivery', icon: FileText },
  { id: 'csv', label: 'CSV', description: 'Spreadsheet-compatible data export', icon: FileSpreadsheet },
  { id: 'json', label: 'JSON', description: 'Structured data for API integration', icon: Code },
];

export function ExportDialog({ runId, onClose }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState('pdf');

  const handleExport = () => {
    // In production, triggers actual export via API
    console.log(`Exporting run ${runId} as ${selectedFormat}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="max-w-sm w-full mx-4 rounded-xl bg-surface-900 border border-surface-700/50 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Download className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Export Run</h2>
        </div>

        <div className="space-y-2 mb-6">
          {EXPORT_FORMATS.map((format) => {
            const Icon = format.icon;
            return (
              <button
                key={format.id}
                onClick={() => setSelectedFormat(format.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors border
                  ${selectedFormat === format.id
                    ? 'bg-primary/15 text-primary-300 border-primary/30'
                    : 'bg-surface-800/50 text-surface-300 border-surface-700/40 hover:bg-surface-700/40'
                  }
                `}
                aria-pressed={selectedFormat === format.id}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{format.label}</p>
                  <p className="text-xs text-surface-400">{format.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleExport} className="flex-1">
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>
    </div>
  );
}
