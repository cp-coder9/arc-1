import React, { useEffect, useMemo, useState } from 'react';
import { Camera, CloudRain, Plus, Sun } from 'lucide-react';
import { toast } from 'sonner';
import type { SiteLog } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { createSiteLog, subscribeToSiteLogs } from '@/services/constructionService';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { paginateItems, safeFormat, totalPages } from '@/lib/utils';

const PAGE_SIZE = 5;

type Props = {
  projectId: string;
  jobId?: string;
  currentUserId: string;
  compact?: boolean;
};

export default function SiteLogManager({ projectId, jobId, currentUserId, compact = false }: Props) {
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weather, setWeather] = useState<SiteLog['weather']>('sunny');
  const [temperature, setTemperature] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [labourCount, setLabourCount] = useState('');
  const [materialsUsed, setMaterialsUsed] = useState('');
  const [issues, setIssues] = useState('');
  const [photos, setPhotos] = useState<FileList | null>(null);

  useEffect(() => subscribeToSiteLogs(projectId, setLogs, 50), [projectId]);

  const pagedLogs = useMemo(() => paginateItems(logs, page, compact ? 3 : PAGE_SIZE), [logs, page, compact]);
  const pages = totalPages(logs.length, compact ? 3 : PAGE_SIZE);

  const reset = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setWeather('sunny');
    setTemperature('');
    setWorkDescription('');
    setLabourCount('');
    setMaterialsUsed('');
    setIssues('');
    setPhotos(null);
  };

  const createLog = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const selectedPhotos = photos ? Array.from(photos) : [];
      const uploadedPhotos = await Promise.all(
        selectedPhotos.map(async (file: File) => ({
          url: await uploadAndTrackFile(file, {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            uploadedBy: currentUserId,
            context: 'site_log',
            jobId,
          }),
          caption: file.name,
        }))
      );

      await createSiteLog({
        projectId,
        date,
        weather,
        temperature: temperature ? Number(temperature) : undefined,
        workDescription,
        labourCount: labourCount ? Number(labourCount) : undefined,
        materialsUsed: materialsUsed.split('\n').map((item) => item.trim()).filter(Boolean),
        issues: issues.split('\n').map((item) => item.trim()).filter(Boolean),
        photos: uploadedPhotos,
        createdBy: currentUserId,
      });
      toast.success('Site log created');
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create site log');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading"><Camera className="text-primary" /> Site Logs</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" className="rounded-full gap-2"><Plus size={14} /> New Log</Button>} />
          <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New daily site log</DialogTitle></DialogHeader>
            <form onSubmit={createLog} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                <select value={weather} onChange={(e) => setWeather(e.target.value as SiteLog['weather'])} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
                  <option value="sunny">Sunny</option>
                  <option value="cloudy">Cloudy</option>
                  <option value="rainy">Rainy</option>
                  <option value="stormy">Stormy</option>
                </select>
                <Input type="number" placeholder="Temperature °C" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
              </div>
              <Textarea value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="Work completed today" required />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input type="number" min="0" placeholder="Labour count" value={labourCount} onChange={(e) => setLabourCount(e.target.value)} />
                <Input type="file" multiple accept="image/*" onChange={(e) => setPhotos(e.target.files)} />
              </div>
              <Textarea value={materialsUsed} onChange={(e) => setMaterialsUsed(e.target.value)} placeholder="Materials used, one per line" />
              <Textarea value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Issues or risks, one per line" />
              <Button type="submit" disabled={saving} className="w-full rounded-xl">{saving ? 'Saving...' : 'Create log'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {pagedLogs.map((log) => (
          <div key={log.id} className="rounded-2xl border border-border bg-secondary/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{safeFormat(log.date, 'PPP')}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Logged {safeFormat(log.createdAt, 'PP p')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize gap-1">{log.weather === 'sunny' ? <Sun size={12} /> : <CloudRain size={12} />}{log.weather}</Badge>
                {typeof log.temperature === 'number' && <Badge variant="secondary">{log.temperature}°C</Badge>}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground">{log.workDescription}</p>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              {typeof log.labourCount === 'number' && <span>Labour: {log.labourCount}</span>}
              {log.materialsUsed?.length ? <span>Materials: {log.materialsUsed.length}</span> : null}
              {log.issues?.length ? <span className="text-destructive">Issues: {log.issues.length}</span> : null}
            </div>
            {log.photos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {log.photos.map((photo) => <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border"><img src={photo.url} alt={photo.caption} className="h-20 w-full object-cover" /></a>)}
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && <div className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">No site logs recorded yet.</div>}
        {logs.length > (compact ? 3 : PAGE_SIZE) && (
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-xs font-bold text-muted-foreground">Page {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
