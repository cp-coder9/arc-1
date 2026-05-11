import { Job, Project, UserProfile } from '@/types';

export interface ArchitectMatch { architect: UserProfile; score: number; reasoning: string[]; }

function tokens(value?: string | string[]): string[] {
  const text = Array.isArray(value) ? value.join(' ') : value || '';
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 2);
}

export function rankArchitectsForProject(project: Project & { job?: Job; category?: Job['category']; location?: string; description?: string }, architects: UserProfile[]): ArchitectMatch[] {
  const projectTerms = new Set(tokens([project.job?.category, project.category, project.job?.description, project.description].filter(Boolean).join(' ')));
  const location = (project.job?.location || project.location || '').toLowerCase();
  return architects
    .filter((architect) => architect.role === 'architect')
    .map((architect) => {
      const reasoning: string[] = [];
      let score = 0;
      const labels = tokens([...(architect.professionalLabels || []), architect.professionalLabel, architect.bio].filter(Boolean).join(' '));
      const specializationHits = labels.filter((term) => projectTerms.has(term)).length;
      score += Math.min(30, specializationHits * 10);
      if (specializationHits) reasoning.push('Specialisation/profile terms match the project brief.');
      if (location && architect.region?.toLowerCase().includes(location)) { score += 20; reasoning.push('Region aligns with project location.'); }
      const rating = Math.min(5, Math.max(0, Number(architect.averageRating || 0)));
      score += rating * 6;
      if (rating >= 4) reasoning.push(`Strong client rating (${rating.toFixed(1)}/5).`);
      const completed = Math.max(0, Number(architect.completedJobs || 0));
      score += Math.min(15, completed * 1.5);
      if (completed) reasoning.push(`${completed} completed job${completed === 1 ? '' : 's'} recorded.`);
      if ((architect as any).availability !== 'unavailable') { score += 5; reasoning.push('No unavailable flag present.'); }
      return { architect, score: Math.round(score), reasoning: reasoning.length ? reasoning : ['Limited data available; ranked using rating and profile completeness.'] };
    })
    .sort((a, b) => b.score - a.score);
}
