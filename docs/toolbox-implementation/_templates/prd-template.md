# Tool ID — Tool Label

## Overview

| Field | Value |
|-------|-------|
| **ID** | `{tool_id}` |
| **Category** | `{category}` |
| **StandaloneOnly** | {true/false} |
| **Roles** | {list} |
| **Current State** | {working/broken/generic/routes to page X} |
| **Priority** | P{0-6} |
| **Branch** | `toolbox/{tool-id}` |

**Description**: {2-3 sentence description of the tool's purpose}

## PRD — What It Must Do

{Detailed description of the tool's functionality from the user's perspective. What problem does it solve? How does the user interact with it?}

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| {field1} | {text/number/select/textarea/date} | {yes/no} | {default} | {notes} |
| {field2} | ... | | | |

Layout: {single column / 2-col grid / multi-step}

### FR-2: Calculation / Processing

{Description of what happens when the user clicks Run}

Algorithm:
```
{mathematical or logical process description}
```

Edge cases:
- {edge case 1}
- {edge case 2}

### FR-3: Output Display

| Field | Type | Description |
|-------|------|-------------|
| {output1} | {string/number/object} | {description} |
| {output2} | ... | |

Display format: {table / card / status badge / chart}

### FR-4: Persistence & Export

- **Save**: {what input + output fields are persisted}
- **Export**: {pdf/csv/json — what format the output supports}
- **Assign**: {what gets assigned to a project}

## Data Model

### Input Interface

```typescript
interface {ToolId}Input {
  field1: string  // description
  field2: number  // description
}
```

### Output Interface

```typescript
interface {ToolId}Output {
  result1: string  // description
  result2: number  // description
}
```

## Validation Rules

- [ ] {rule 1}
- [ ] {rule 2}

## Integration Points

- [ ] {existing service to call}
- [ ] {existing page to link to}

## Implementation Tasks

- [ ] {task 1}
- [ ] {task 2}
- [ ] Write form component
- [ ] Wire calculation logic
- [ ] Add test: calculation accuracy
- [ ] Add test: registry registration
- [ ] Add test: form rendering
- [ ] Manual smoke test

## Definition of Done

- [ ] All FRs implemented
- [ ] No mock/fake data
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Smoke-tested in browser
- [ ] Branch pushed, PR created
