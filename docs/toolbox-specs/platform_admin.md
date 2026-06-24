# Platform Admin Toolbox Spec

**Role key:** `platform_admin` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav modules:** Toolboxes only ⚠ (orphaned — no Command Centre, Admin/Governance, etc.)

## 1. Identity
- **Title:** Platform Admin Toolbox
- **Subtitle:** System configuration, governance, audit oversight, and platform-wide settings.
- **Scope:** Platform governance and configuration tools across the entire Architex ecosystem.
- **Primary responsibilities:** Configure platform-wide settings · Monitor audit trails and system health · Review AI and governance queues.
- **Handoff boundaries:** Cannot override professional sign-off · Configuration changes require audit trail.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Platform governance | Admin Console → `admin-console` · Audit Trail Viewer → `disputes` · AI Review Queue → `ai` |
| System configuration | Payment Rate Settings → `payments` · Resource Centre → `resource-centre` · CPD Assessment → `cpd-assessment` |

## 3. Standalone tools (`getToolsForRole('platform_admin')` → 4)
cpd_standalone, freelancer_resource_centre, platform_settings, system_health_monitor

Categories spanned: cpd, resource_centre, settings, monitoring.

## 4. Lifecycle participation (cross-cutting, all phases)
- **continuous (platform governance):** platform_settings, system_health_monitor → platform-wide configuration and health monitoring spanning every phase.
- **governance oversight:** Admin Console, Audit Trail Viewer, AI Review Queue → audit and AI queue review (guided routes only).
- **support:** cpd_standalone, freelancer_resource_centre → CPD and resource support.

## 5. Governance gates
- Cannot override professional sign-off (handoff boundary).
- All configuration changes require an audit trail.

## 6. Workflow verification & gaps
- ⚠ **Workflow finding #1 — orphaned role.** `platform_admin` appears ONLY in the `toolboxes` navigation module. No Command Centre or Admin/Governance modules route to this role despite its platform-wide scope; governance tools are reachable solely through the Toolboxes shell.
- ⚠ AI-guided mode surfaces 6 tools across 2 groups, but tiles mode surfaces only 4 standalone tools — an **inverted gap**: guided governance tools (`admin-console`, `disputes`, `ai`, `payments`, `cpd-assessment`) lack matching standalone registry entries for this role. The 4 standalone tools (`cpd_standalone`, `freelancer_resource_centre`, `platform_settings`, `system_health_monitor`) are a narrower set than the guided flow implies. Recommend reconciling the guided group routes with the standalone registry.
- ✅ Scope and gates align: platform-wide configuration with mandatory audit trail and no professional sign-off override.
