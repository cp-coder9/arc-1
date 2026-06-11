import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { FileText, Search, History, Download, Tag, Filter } from 'lucide-react';
import type { UserProfile, PracticeTemplate } from '../types';
import { templateLibraryService } from '../services/templateLibraryService';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Props {
  user: UserProfile;
  firmId?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  appointment: 'Appointment',
  certificate: 'Certificate',
  report: 'Report',
  submission: 'Submission',
  contract: 'Contract',
  invoice: 'Invoice',
  general: 'General',
};

const CATEGORY_COLORS: Record<string, string> = {
  appointment: 'bg-purple-100 text-purple-800',
  certificate: 'bg-green-100 text-green-800',
  report: 'bg-blue-100 text-blue-800',
  submission: 'bg-orange-100 text-orange-800',
  contract: 'bg-red-100 text-red-800',
  invoice: 'bg-teal-100 text-teal-800',
  general: 'bg-gray-100 text-gray-800',
};

export default function TemplateLibrary({ user, firmId }: Props) {
  const [templates, setTemplates] = useState<PracticeTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const activeFirmId = firmId || user.primaryFirmId || '';

  useEffect(() => {
    if (!activeFirmId) return;
    const unsub = templateLibraryService.subscribeToFirmTemplates(activeFirmId, setTemplates);
    return () => unsub();
  }, [activeFirmId]);

  const filteredTemplates = templates.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !(t.tags || []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()))) {
      return false;
    }
    if (categoryFilter && t.category !== categoryFilter) return false;
    return true;
  });

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="space-y-6">
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden">
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-sans text-2xl font-black flex items-center gap-3">
                <FileText size={22} className="text-primary" />
                Template Library
              </CardTitle>
              <CardDescription>Practice document templates with version control</CardDescription>
            </div>
            <Badge variant="secondary" className="rounded-full">
              {templates.length} templates
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Search and filters */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates by name or tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-12 rounded-xl border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              <option value="">All Categories</option>
              {categories.map((cat: string) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
              ))}
            </select>
          </div>

          {/* Template grid */}
          <ScrollArea className="h-[500px]">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <FileText size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No templates found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeFirmId ? 'Create your first template to get started.' : 'Select a firm to view templates.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-xl border border-border/50 bg-background p-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{template.name}</p>
                        {template.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
                        )}
                      </div>
                      <Badge className={`rounded-full text-[10px] shrink-0 ml-2 ${CATEGORY_COLORS[template.category] || 'bg-gray-100'}`}>
                        {CATEGORY_LABELS[template.category] || template.category}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <History size={12} /> v{template.version}
                      </span>
                      {template.roles.length > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tag size={12} /> {template.roles.join(', ')}
                        </span>
                      )}
                    </div>

                    {(template.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.tags!.map((tag) => (
                          <Badge key={tag} variant="secondary" className="rounded-full text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {template.fileUrl && (
                        <Button variant="outline" size="sm" className="rounded-full text-xs" asChild>
                          <a href={template.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Download size={12} className="mr-1" /> Download
                          </a>
                        </Button>
                      )}
                      {!template.isActive && (
                        <Badge variant="outline" className="rounded-full text-[10px] text-yellow-600">Archived</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
