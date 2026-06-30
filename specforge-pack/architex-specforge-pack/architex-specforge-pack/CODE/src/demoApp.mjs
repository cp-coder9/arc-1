import { SAMPLE_WORKSPACE, createIssueSnapshot, can } from './specificationDomain.mjs';
import { generateInteractiveSpecDocument, renderSpecDocumentHtml } from './documentGenerator.mjs';
import { openProjectSyncPlan } from './openProjectConnector.mjs';

const state = { role: 'architect', room: 'all', pkg: 'all' };
const roles = ['client','developer','architect','bep','engineer','quantity_surveyor','contractor','subcontractor','supplier','site_manager','admin'];

function init() {
  const roleSel = document.querySelector('#role');
  roleSel.innerHTML = roles.map(r => `<option value="${r}">${r}</option>`).join('');
  roleSel.value = state.role;
  roleSel.addEventListener('change', e => { state.role = e.target.value; render(); });
  document.querySelector('#issueBtn').addEventListener('click', issueSnapshot);
  document.querySelector('#printBtn').addEventListener('click', () => window.print());
  renderFilters();
  render();
}

function renderFilters() {
  const rooms = ['all', ...new Set(SAMPLE_WORKSPACE.items.map(i => i.room))];
  const packages = ['all', ...new Set(SAMPLE_WORKSPACE.items.map(i => i.package))];
  for (const [id, values, key] of [['room', rooms, 'room'], ['package', packages, 'pkg']]) {
    const el = document.querySelector('#' + id);
    el.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join('');
    el.addEventListener('change', e => { state[key] = e.target.value; render(); });
  }
}

function render() {
  const doc = generateInteractiveSpecDocument(SAMPLE_WORKSPACE, state);
  document.querySelector('#document').innerHTML = renderSpecDocumentHtml(doc);
  document.querySelector('#capabilities').innerHTML = ['edit_spec','issue_spec','approve_client_decision','review_budget','request_substitution','quote_item','update_installed_status']
    .map(c => `<span class="cap ${can(state.role,c) ? 'yes':'no'}">${c}</span>`).join('');
  document.querySelector('#openProject').textContent = JSON.stringify(openProjectSyncPlan(SAMPLE_WORKSPACE), null, 2);
  document.querySelector('#count').textContent = `${doc.pictorialItems.length} visible items`;
}

function issueSnapshot() {
  const snapshot = createIssueSnapshot(SAMPLE_WORKSPACE, { userId: 'demo-user', role: state.role, name: `Demo ${state.role}` });
  document.querySelector('#snapshot').textContent = JSON.stringify(snapshot, null, 2);
  document.querySelector('#snapshotPanel').hidden = false;
}

init();
