# Pack 15: Analytics & Reporting — Implementation Plan

## Branch: `feature/pack-15-analytics-reporting`

### Phase 1: Core Types & Data Model
1. **Create `src/types/analyticsReporting.ts`** — All analytics types:
   - `KPIMetric` — name, value, unit, version, calculationSource, projectId, recordedAt
   - `DashboardWidget` — type, title, data source, refresh interval, role visibility
   - `AlertRule` — trigger condition, severity, recipient role, acknowledgement flag
   - `ExportJob` — format (CSV/JSON), scope, filter params, generated URI
   - `ObservabilityMetric` — latency, error count, memory boundary violations
   - `KPIResult` — Schedule variance, cost-to-complete, defect-liability, retention-release, compliance-gap

### Phase 2: Backend Services (complete/rewrite from stubs)
2. **`kpiCalculatorService.ts`** — 5 KPI calculations:
   - Schedule variance (planned vs actual milestone dates)
   - Cost-to-complete (budget vs committed vs actual spend)
   - Defect-liability remaining days
   - Retention-release readiness (conditions met, amounts due)
   - Compliance-gap count (expired registrations, lapsed insurance, missing docs)

3. **`dashboardService.ts`** — Widget payload builder:
   - Role-specific dashboards (admin, professional, client, contractor)
   - Configurable widget layout
   - Real-time refresh capability
   - Widget types: KPI cards, charts, tables, alerts

4. **`alertSchedulerService.ts`** — Alert management:
   - Register alert rules with conditions
   - Evaluate rules against live ProjectRecords
   - Create Inbox events when rules fire
   - Alert frequency throttling (per rule, per recipient)

5. **`exportApiService.ts`** — Export functionality:
   - Stream filtered ProjectRecords to CSV
   - Stream inbox events to CSV/JSON
   - Stream audit trails to CSV/JSON
   - Date range filtering, project/tenant scoping

6. **`observabilityService.ts`** — Platform health:
   - Record latency metrics per service call
   - Error count tracking per module
   - Memory-boundary violation alerts
   - Dashboard for platform health

7. **`auditTrailService.ts`** — Enhanced audit trail
8. **`projectRecordAdapter.ts`** — Enhanced ProjectRecord adapter with KPI storage
9. **`inboxEventAdapter.ts`** — Enhanced inbox event adapter
10. **`agentRecommendationService.ts`** — Analytics agent recommendations

### Phase 3: API Routes
11. Add routes to `api-router.ts`:
    - `GET /api/analytics/dashboard/:role` — Role-specific dashboard
    - `GET /api/analytics/kpis/:projectId` — KPI metrics for a project
    - `POST /api/analytics/alerts` — Register alert rules
    - `GET /api/analytics/alerts/:projectId` — Get alerts for project
    - `GET /api/analytics/export/:type` — Export data (csv/json)
    - `GET /api/analytics/observability` — Platform health metrics
    - `POST /api/analytics/kpis/compute/:projectId` — Compute KPIs for project

### Phase 4: Frontend Enhancements
12. Enhance **`FinancialDashboard.tsx`** — Add all 5 KPI widgets
13. Enhance **`AdminDashboard.tsx`** — Add observability/health metrics section
14. Enhance **`ClientProgressReports.tsx`** — Add CSV/JSON export buttons
15. Create **`AlertConfigurationPanel.tsx`** — Alert rule configuration UI

### Phase 5: Testing
16. **Unit tests** for all new services
17. **API route tests** for analytics endpoints
18. **Component tests** for frontend widgets
19. **E2E tests** with synthetic data

### Dependencies
- Uses existing: ProjectRecords, Firestore, Inbox events, Firebase Auth
- No new npm packages required
