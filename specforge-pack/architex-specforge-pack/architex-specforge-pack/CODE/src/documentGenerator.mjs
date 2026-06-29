import { budgetSummary, validateIssueReadiness, visibleItemsForRole } from './specificationDomain.mjs';

export function generateInteractiveSpecDocument(workspace, { role = 'architect', room = 'all', pkg = 'all' } = {}) {
  let items = visibleItemsForRole(workspace, role);
  if (room !== 'all') items = items.filter(i => i.room === room);
  if (pkg !== 'all') items = items.filter(i => i.package === pkg);
  const summary = budgetSummary(items);
  const findings = validateIssueReadiness({ ...workspace, items });
  const rooms = [...new Set(workspace.items.map(i => i.room))];
  const packages = [...new Set(workspace.items.map(i => i.package))];
  return {
    meta: {
      title: `${workspace.projectName} — ${workspace.profile}`,
      revision: workspace.revision,
      status: workspace.issueStatus,
      roleView: role,
      generatedAt: new Date().toISOString()
    },
    navigation: { rooms, packages },
    summary,
    findings,
    sections: workspace.sections,
    pictorialItems: items.map(item => ({
      id: item.id,
      code: item.code,
      title: item.title,
      room: item.room,
      package: item.package,
      image: item.image,
      status: item.status,
      supplier: item.supplier,
      finish: item.finish,
      dimensions: item.dimensions,
      budgetDelta: (item.estimatedCost || 0) - (item.budgetAllowance || 0),
      leadTimeDays: item.leadTimeDays,
      roleChain: {
        owner: item.ownerRole,
        reviewer: item.reviewerRole,
        approver: item.approverRole
      },
      references: {
        drawings: item.drawingRefs,
        clauses: item.clauseRefs
      },
      riskFlags: [
        item.supersededBy ? 'superseded-source' : null,
        item.leadTimeDays >= 56 ? 'long-lead' : null,
        item.estimatedCost > item.budgetAllowance ? 'over-allowance' : null,
        item.clientDecision && item.status === 'needs_decision' ? 'client-decision-open' : null
      ].filter(Boolean)
    }))
  };
}

export function renderSpecDocumentHtml(doc) {
  const money = v => `R${Math.round(v).toLocaleString('en-ZA')}`;
  const cards = doc.pictorialItems.map(item => `
    <article class="spec-card" data-status="${item.status}">
      <img alt="${escapeHtml(item.title)}" src="${item.image}" />
      <div class="spec-card-body">
        <div class="code-row"><strong>${item.code}</strong><span>${item.status.replaceAll('_',' ')}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.room)} · ${escapeHtml(item.package)}</p>
        <dl>
          <div><dt>Finish</dt><dd>${escapeHtml(item.finish)}</dd></div>
          <div><dt>Supplier</dt><dd>${escapeHtml(item.supplier)}</dd></div>
          <div><dt>Budget delta</dt><dd class="${item.budgetDelta > 0 ? 'warn' : 'ok'}">${money(item.budgetDelta)}</dd></div>
          <div><dt>Lead time</dt><dd>${item.leadTimeDays} days</dd></div>
        </dl>
        <div class="role-chain">${Object.entries(item.roleChain).map(([k,v]) => `<span>${k}: ${v}</span>`).join('')}</div>
        <div class="risk-flags">${item.riskFlags.map(f => `<mark>${f}</mark>`).join('')}</div>
      </div>
    </article>`).join('');
  const findings = doc.findings.map(f => `<li class="${f.severity}">${f.severity.toUpperCase()}: ${escapeHtml(f.message)}</li>`).join('') || '<li class="ok">No readiness findings for current view.</li>';
  return `
  <section class="spec-document">
    <header class="doc-header">
      <p class="eyebrow">SpecForge interactive specification</p>
      <h1>${escapeHtml(doc.meta.title)}</h1>
      <p>Revision ${doc.meta.revision} · ${doc.meta.status} · role view: ${doc.meta.roleView}</p>
    </header>
    <section class="summary-grid">
      <div><strong>${money(doc.summary.allowance)}</strong><span>Allowance</span></div>
      <div><strong>${money(doc.summary.estimate)}</strong><span>Estimate</span></div>
      <div><strong>${money(doc.summary.delta)}</strong><span>Delta (${doc.summary.deltaPct}%)</span></div>
      <div><strong>${doc.summary.longLeadItems.length}</strong><span>Long-lead items</span></div>
    </section>
    <section class="findings"><h2>Readiness / risk</h2><ul>${findings}</ul></section>
    <section class="pictorial-grid">${cards}</section>
  </section>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
