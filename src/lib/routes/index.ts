export {
  API_ROUTE_DOMAINS,
  API_ROUTE_DOMAIN_LABELS,
  API_ROUTE_REGISTRY,
  getApiRouteDomainForPath,
  requireApiRouteDomainForPath,
  type ApiRouteDomain,
  type ApiRouteDomainRegistryEntry,
} from './registry';

// Domain router stubs — extracted from api-router.ts during H1 phased refactor.
export { domainRouter as submissionReadinessRouter } from './submission-readiness-routes';
export { domainRouter as aiGovernanceRouter } from './ai-governance-routes';
export { domainRouter as drawingChecklistRouter } from './drawing-checklist-routes';
export { domainRouter as municipalRouter } from './municipal-routes';
export { domainRouter as ocrRouter } from './ocr-routes';
export { domainRouter as agentWorkflowRouter } from './agent-workflow-routes';
export { domainRouter as procurementRouter } from './procurement-routes';
export { domainRouter as practiceManagementRouter } from './practice-management-routes';
export { domainRouter as generalRouter } from './general-routes';
