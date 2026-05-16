import React from 'react';
import { Files, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '@/types';
import FileManager from './FileManager';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export default function ProjectToolboxPage({ user }: { user: UserProfile }) {
  return (
    <div className="space-y-6" data-testid="project-toolbox-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Project Toolbox</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><Files className="h-7 w-7 text-primary" /> Files, evidence, and drawing tools</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Production file workspace for project-linked documents, brief evidence, submissions, invoices, certificates, and drawing quick scans. Upload/delete/AI scan actions use the existing authenticated storage and Firestore paths.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p>Unsafe approvals, signatures, payment releases, and statutory submissions are not performed from the toolbox. This page provides traceable files and evidence for the dedicated human-confirmed workflows.</p>
          </div>
        </CardContent>
      </Card>
      <FileManager user={user} />
    </div>
  );
}
