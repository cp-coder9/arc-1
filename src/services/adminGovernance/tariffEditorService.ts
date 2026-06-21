import type { AdminActor, TariffLine, TariffVersion } from './types';
import { assertPermission, id } from './utils';

export class TariffEditorService {
  draft(actor: AdminActor, input: { profession: string; sourceName: string; sourceRef: string; effectiveFrom: string; lines: TariffLine[]; version?: number }): TariffVersion {
    assertPermission(['tariff_editor', 'super_admin'].includes(actor.role), 'Not allowed to draft tariffs');
    return { id: id('tariff'), profession: input.profession, sourceName: input.sourceName, sourceRef: input.sourceRef, effectiveFrom: input.effectiveFrom, status: 'draft', version: input.version ?? 1, lines: input.lines };
  }
  submitForReview(actor: AdminActor, t: TariffVersion): TariffVersion {
    assertPermission(['tariff_editor', 'super_admin'].includes(actor.role), 'Not allowed to submit tariff');
    if (t.status !== 'draft') throw new Error('Only draft tariffs can enter review');
    return { ...t, status: 'in_review' };
  }
  publish(actor: AdminActor, t: TariffVersion): TariffVersion {
    assertPermission(['platform_admin', 'super_admin'].includes(actor.role), 'Only platform admin can publish tariffs');
    if (t.status !== 'in_review') throw new Error('Tariff must be reviewed before publish');
    return { ...t, status: 'published', publishedBy: actor.id };
  }
  supersede(actor: AdminActor, published: TariffVersion, replacement: TariffVersion): [TariffVersion, TariffVersion] {
    assertPermission(['platform_admin', 'super_admin'].includes(actor.role), 'Only platform admin can supersede tariffs');
    if (published.status !== 'published') throw new Error('Only published tariffs can be superseded');
    if (replacement.status !== 'published') throw new Error('Replacement must be published');
    return [{ ...published, status: 'superseded', supersededBy: replacement.id }, replacement];
  }
}
