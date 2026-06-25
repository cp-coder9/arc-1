/**
 * Coverage sweep test — Task 13
 *
 * Verifies that every tool in the STANDALONE_TOOL_REGISTRY has a corresponding
 * CalculatorDefinition registered (either `status: 'full'` or `status: 'preview'`).
 * No tool may exist as a silent placeholder.
 *
 * Requirements: 8.1, 8.2, 8.3
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { STANDALONE_TOOL_REGISTRY } from '@/services/tools/standaloneToolRegistry'
import { listCalculatorDefinitions } from './definitionRegistry'

// Force import of the index module which triggers all registrations (full + preview stubs).
import './index'

describe('Coverage sweep — eliminate thin tools (Task 13)', () => {
  let definitions: ReturnType<typeof listCalculatorDefinitions>

  beforeAll(() => {
    definitions = listCalculatorDefinitions()
  })

  it('should register at least 54 definitions (one per registry tool, plus the XA exemplar)', () => {
    // 54 registry tools + 1 extra XA exemplar definition (xa_fenestration_v1) that shares
    // the xa_compliance_calc tool with xa_energy_compliance_v1
    expect(definitions.length).toBeGreaterThanOrEqual(54)
  })

  it('should have no definition with an empty id', () => {
    const emptyIds = definitions.filter(d => !d.id || d.id.trim() === '')
    expect(emptyIds).toHaveLength(0)
  })

  it('should have no definition with an empty toolId', () => {
    const emptyToolIds = definitions.filter(d => !d.toolId || d.toolId.trim() === '')
    expect(emptyToolIds).toHaveLength(0)
  })

  it('every definition must have status "full" or "preview" — no silent placeholders', () => {
    const invalidStatus = definitions.filter(d => d.status !== 'full' && d.status !== 'preview')
    expect(invalidStatus).toHaveLength(0)
  })

  it('should have at least 37 full-status definitions (tasks 6-12 conversions)', () => {
    const full = definitions.filter(d => d.status === 'full')
    expect(full.length).toBeGreaterThanOrEqual(37)
  })

  it('preview definitions should cover the remaining misc tools', () => {
    const preview = definitions.filter(d => d.status === 'preview')
    // 17 general/misc/briefing tools remain as preview stubs
    expect(preview.length).toBeGreaterThanOrEqual(16)
  })

  it('full + preview count should equal total definitions', () => {
    const full = definitions.filter(d => d.status === 'full')
    const preview = definitions.filter(d => d.status === 'preview')
    expect(full.length + preview.length).toBe(definitions.length)
  })

  describe('cross-reference with STANDALONE_TOOL_REGISTRY', () => {
    it('the registry should contain exactly 54 tools', () => {
      expect(STANDALONE_TOOL_REGISTRY).toHaveLength(54)
    })

    it('every registry tool should have a corresponding definition (by toolId)', () => {
      const definedToolIds = new Set(definitions.map(d => d.toolId))
      const missingTools = STANDALONE_TOOL_REGISTRY.filter(
        tool => !definedToolIds.has(tool.id)
      )
      if (missingTools.length > 0) {
        const missingIds = missingTools.map(t => t.id)
        expect(missingIds, `These registry tools have no definition: ${missingIds.join(', ')}`).toHaveLength(0)
      }
      expect(missingTools).toHaveLength(0)
    })
  })

  describe('group coverage — key definitions present', () => {
    it('XA fenestration exemplar (task 6) is full', () => {
      const def = definitions.find(d => d.id === 'xa_fenestration_v1')
      expect(def).toBeDefined()
      expect(def!.status).toBe('full')
    })

    it('energy group (task 7) — 4 full definitions', () => {
      const ids = ['rvalue_calc_v1', 'fenestration_n_v1', 'xa_energy_compliance_v1', 'energy_certificate_v1']
      for (const id of ids) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be full`).toBe('full')
      }
    })

    it('fee group (task 8) — 3 full definitions', () => {
      const ids = ['fee_calculator_v1', 'soft_cost_estimator_v1', 'feasibility_estimator_v1']
      for (const id of ids) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be full`).toBe('full')
      }
    })

    it('compliance group (task 9) — 6 full definitions', () => {
      const ids = [
        'fire_compliance_check_v1', 'fire_rational_design_v1', 'zoning_check_v1',
        'sans_forms_v1', 'ai_drawing_checker_v1', 'cad_upload_check_v1',
      ]
      for (const id of ids) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be full`).toBe('full')
      }
    })

    it('construction group (task 10) — 8 full definitions', () => {
      const ids = [
        'boq_takeoff_v1', 'material_procurement_v1', 'valuation_cert_v1',
        'payment_claim_builder_v1', 'workforce_timesheet_v1', 'plant_register_v1',
        'site_diary_entry_v1', 'hs_compliance_v1',
      ]
      for (const id of ids) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be full`).toBe('full')
      }
    })

    it('document-control & governance group (task 11) — 8 full definitions', () => {
      const ids = [
        'drawing_register_v1', 'doc_control_issue_v1', 'shop_drawing_submission_v1',
        'firm_document_register_v1', 'proposal_comparison_v1', 'stage_gate_review_v1',
        'cpd_standalone_v1', 'staff_cpd_tracker_v1',
      ]
      for (const id of ids) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be full`).toBe('full')
      }
    })

    it('admin group (task 12) — 8 full definitions', () => {
      const ids = [
        'fee_tariff_editor_v1', 'payment_rate_config_v1', 'admin_governance_v1',
        'audit_trail_viewer_v1', 'user_verification_console_v1', 'platform_settings_v1',
        'system_health_monitor_v1', 'ai_review_queue_v1',
      ]
      for (const id of ids) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be full`).toBe('full')
      }
    })

    it('remaining misc tools are explicitly preview — not silent', () => {
      const previewIds = [
        'technical_brief_v1', 'brief_wizard_v1', 'progress_viewer_v1',
        'payment_dashboard_v1', 'rfi_generator_v1', 'snag_creator_v1',
        'tender_bid_bench_v1', 'snag_evidence_upload_v1', 'rfi_response_v1',
        'package_scope_viewer_v1', 'catalogue_manager_v1', 'quote_response_v1',
        'delivery_note_v1', 'warranty_upload_v1', 'freelancer_timesheet_v1',
        'deliverable_submission_v1', 'freelancer_resource_centre_v1',
      ]
      for (const id of previewIds) {
        const def = definitions.find(d => d.id === id)
        expect(def, `${id} should be registered`).toBeDefined()
        expect(def!.status, `${id} should be preview`).toBe('preview')
      }
    })
  })
})
