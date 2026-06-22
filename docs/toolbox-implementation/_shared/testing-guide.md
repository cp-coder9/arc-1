# Testing Guide for Standalone Tools

## For Every Tool

### Unit Tests (`src/__tests__/tools/{tool-id}.test.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { getToolById, getToolsForRole } from '@/services/tools/standaloneToolRegistry'

describe('{tool-id}', () => {
  it('is registered in the standalone tool registry', () => {
    const tool = getToolById('{tool-id}')
    expect(tool).toBeDefined()
    expect(tool.id).toBe('{tool-id}')
  })

  it('is visible to all assigned roles', () => {
    for (const role of ['role1', 'role2', ...]) {
      const tools = getToolsForRole(role)
      expect(tools.find(t => t.id === '{tool-id}')).toBeDefined()
    }
  })

  it('has all required fields', () => {
    const tool = getToolById('{tool-id}')
    expect(tool.label).toBeTruthy()
    expect(tool.description).toBeTruthy()
    expect(tool.category).toBeTruthy()
    expect(tool.roles.length).toBeGreaterThan(0)
    expect(tool.icon).toBeTruthy()
    expect(tool.route).toBeTruthy()
  })
})
```

### Calculation Tests

When the tool has calculation logic, test it independently:

```typescript
import { calculateFee, calculateVAT } from '@/services/tools/calculationHelperService'

describe('{tool-id} calculations', () => {
  it('computes correct output for valid inputs', () => {
    const result = calculateFee(1000000, 'architect', 1.0)
    expect(result.fee).toBe(85000)
  })

  it('handles zero edge case', () => {
    const result = calculateFee(0, 'architect', 1.0)
    expect(result.fee).toBe(0)
  })

  it('handles negative inputs gracefully', () => {
    const result = calculateFee(-100000, 'architect', 1.0)
    expect(result.fee).toBe(0) // clamped to 0
  })
})
```

### Form Tests

Test form rendering using the extracted form component:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import ToolFormRfi from '@/components/tools/forms/ToolFormRfi'

describe('ToolFormRfi', () => {
  it('renders all required fields', () => {
    render(<ToolFormRfi input={{}} onInputChange={() => {}} />)
    expect(screen.getByLabelText(/subject/i)).toBeDefined()
    expect(screen.getByLabelText(/question/i)).toBeDefined()
    expect(screen.getByLabelText(/priority/i)).toBeDefined()
  })

  it('calls onInputChange when field value changes', () => {
    const onChange = vi.fn()
    render(<ToolFormRfi input={{}} onInputChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Test RFI' } })
    expect(onChange).toHaveBeenCalledWith('subject', 'Test RFI')
  })
})
```

## Smoke Test Checklist (Manual)

- [ ] Open Toolboxes → All Tools tab
- [ ] Search for tool by name
- [ ] Click tile → runner opens
- [ ] Form fields match spec
- [ ] Fill all fields, click Run
- [ ] Output displays correctly
- [ ] Save button saves to localStorage
- [ ] Export button works (or shows placeholder)
- [ ] Assign button opens dialog
- [ ] Back button returns to tiles
- [ ] Tool appears in Run History
- [ ] For each assigned role: verify tool is visible
