import { GanttTask, RFI, SiteLog } from '@/types';

export interface ConstructionAlert { type: 'schedule' | 'rfi' | 'site_log'; severity: 'low' | 'medium' | 'high'; message: string; sourceId?: string; }
export interface ConstructionMonitoringSummary { progressPercent: number; alerts: ConstructionAlert[]; rfiSuggestions: Record<string, string>; }

const dayMs = 24 * 60 * 60 * 1000;

export function monitorConstructionDelivery(tasks: GanttTask[], rfis: RFI[], siteLogs: SiteLog[], now = new Date()): ConstructionMonitoringSummary {
  const alerts: ConstructionAlert[] = [];
  tasks.forEach((task) => {
    const end = new Date(task.endDate);
    if (task.status !== 'completed' && end.getTime() < now.getTime()) alerts.push({ type: 'schedule', severity: 'high', message: `${task.title} is past planned finish and not complete.`, sourceId: task.id });
    else if (task.status === 'delayed') alerts.push({ type: 'schedule', severity: 'medium', message: `${task.title} is marked delayed.`, sourceId: task.id });
  });
  rfis.forEach((rfi) => {
    if (['responded', 'closed'].includes(rfi.status)) return;
    const daysToDue = Math.ceil((new Date(rfi.dueDate).getTime() - now.getTime()) / dayMs);
    if (daysToDue < 0) alerts.push({ type: 'rfi', severity: 'high', message: `RFI ${rfi.number} is overdue.`, sourceId: rfi.id });
    else if (daysToDue <= 2) alerts.push({ type: 'rfi', severity: 'medium', message: `RFI ${rfi.number} is due within ${daysToDue} day(s).`, sourceId: rfi.id });
  });
  const recentLogDates = new Set(siteLogs.map((log) => log.date.slice(0, 10)));
  for (let offset = 1; offset <= 5; offset += 1) {
    const date = new Date(now.getTime() - offset * dayMs).toISOString().slice(0, 10);
    if (!recentLogDates.has(date)) alerts.push({ type: 'site_log', severity: 'low', message: `No site log recorded for ${date}.` });
  }
  siteLogs.forEach((log) => {
    if (!log.workDescription?.trim() || !log.photos?.length) alerts.push({ type: 'site_log', severity: 'medium', message: `Site log ${log.date} is missing work narrative or photos.`, sourceId: log.id });
  });
  const progressPercent = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress)), 0) / tasks.length) : 0;
  const rfiSuggestions = Object.fromEntries(rfis.filter((rfi) => rfi.status === 'open').map((rfi) => [rfi.id, `Review RFI ${rfi.number} (${rfi.subject}) against contract drawings, issue a factual clarification, and route any design change or cost/time impact for professional approval before instruction.`]));
  return { progressPercent, alerts, rfiSuggestions };
}
