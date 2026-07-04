'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Link2 } from 'lucide-react';

interface DocumentViewProps {
  projectId: string;
}

interface DocumentItem {
  id: string;
  reference: string;
  title: string;
  revision: string;
  author: string;
  date: string;
  status: 'draft' | 'for_review' | 'approved' | 'superseded';
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
  for_review: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  approved: 'bg-green-500/20 text-green-400 border-green-500/50',
  superseded: 'bg-red-500/20 text-red-400 border-red-500/50',
};

export default function DocumentView({ projectId }: DocumentViewProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Document Register</h2>
        <Badge variant="outline" className="gap-1 text-xs">
          <Link2 className="h-3 w-3" />
          SpecForge Sync Active
        </Badge>
      </div>

      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Reference</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Title</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Revision</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Author</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <FolderOpen className="h-8 w-8 opacity-40" />
                        <p>No documents registered</p>
                        <p className="text-xs">Documents from Drawing Register and Document Intelligence will appear here</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-mono text-xs">{doc.reference}</td>
                      <td className="py-2 px-2 font-medium">{doc.title}</td>
                      <td className="py-2 px-2 text-muted-foreground">{doc.revision}</td>
                      <td className="py-2 px-2 text-muted-foreground">{doc.author}</td>
                      <td className="py-2 px-2 text-muted-foreground">{doc.date}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[doc.status] ?? ''}`}>
                          {doc.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
