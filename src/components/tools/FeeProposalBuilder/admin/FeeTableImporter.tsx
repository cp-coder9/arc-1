// FeeTableImporter — CSV/JSON upload, validation, preview before import
//
// Requirements: 5.7, 5.8

import { useState, useCallback, type ChangeEvent } from 'react';
import { Upload, FileText, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type ImportStatus = 'idle' | 'validating' | 'preview' | 'importing' | 'done' | 'error';

export default function FeeTableImporter() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus('validating');
    setErrorMessage('');

    // Simulate validation
    setTimeout(() => {
      if (file.name.endsWith('.csv') || file.name.endsWith('.json')) {
        setPreviewRows([
          ['Range Start', 'Range End', 'Fee %', 'Notes'],
          ['0', '500000', '12.5', 'Minimum fee applies'],
          ['500001', '1000000', '10.0', 'Standard scale'],
          ['1000001', '5000000', '8.5', 'Sliding reduction'],
        ]);
        setStatus('preview');
      } else {
        setErrorMessage('Only .csv and .json files are supported.');
        setStatus('error');
      }
    }, 800);
  }, []);

  const handleImport = useCallback(() => {
    setStatus('importing');
    setTimeout(() => setStatus('done'), 1000);
  }, []);

  const handleReset = useCallback(() => {
    setStatus('idle');
    setFileName('');
    setPreviewRows([]);
    setErrorMessage('');
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Upload className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Fee Table Importer</h2>
        </div>
        <p className="text-sm text-surface-400">
          Upload a CSV or JSON file containing fee table data. The file will be validated and previewed before import.
        </p>
      </div>

      {/* Upload area */}
      {(status === 'idle' || status === 'error') && (
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-8">
          <div className="border-2 border-dashed border-surface-600 rounded-lg p-8 text-center hover:border-primary-500/50 transition-colors">
            <Upload className="h-8 w-8 text-surface-500 mx-auto mb-3" />
            <p className="text-sm text-surface-300 mb-2">Drop CSV or JSON file here, or click to browse</p>
            <label className="cursor-pointer">
              <Button size="sm" variant="ghost" asChild>
                <span>Choose File</span>
              </Button>
              <input type="file" accept=".csv,.json" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
          {status === 'error' && (
            <div className="flex items-center gap-2 mt-4 text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Validating */}
      {status === 'validating' && (
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-8 text-center">
          <div className="animate-pulse">
            <FileText className="h-8 w-8 text-primary-400 mx-auto mb-3" />
            <p className="text-sm text-surface-300">Validating {fileName}...</p>
          </div>
        </div>
      )}

      {/* Preview */}
      {status === 'preview' && (
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
            Preview — {fileName}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  {previewRows[0]?.map((header, i) => (
                    <th key={i} className="text-left px-3 py-2 text-xs uppercase tracking-wider text-surface-400">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-surface-700/30">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-surface-200">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleImport}>Import Fee Table</Button>
            <Button variant="ghost" onClick={handleReset}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Importing */}
      {status === 'importing' && (
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-8 text-center">
          <div className="animate-pulse">
            <Upload className="h-8 w-8 text-primary-400 mx-auto mb-3" />
            <p className="text-sm text-surface-300">Importing fee table...</p>
          </div>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-emerald-500/30 p-8 text-center">
          <Check className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-emerald-300 font-medium">Fee table imported successfully</p>
          <p className="text-xs text-surface-400 mt-1">{fileName} — ready for verification</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-4">
            Import Another
          </Button>
        </div>
      )}
    </div>
  );
}
