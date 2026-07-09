# Design Workshop — Sample HTML Files

## Rule

Every feature or tool that gets built must have a corresponding **sample HTML file** at the project root. This file is used for visual workshopping — iterating on the design in a browser before or alongside React implementation.

## Purpose

- Allows rapid visual iteration without spinning up the dev server
- Serves as a design reference / specification for how the component should look and behave
- Can be opened directly in a browser for review and feedback
- Acts as a standalone design script test target

## Naming Convention

```
<FEATURE_NAME>_SAMPLE.html    — design workshop sample
<FEATURE_NAME>_PROTOTYPE.html — early-stage prototype
<FEATURE_NAME>_TOOL.html      — tool-specific UI mockup
```

Use UPPER_SNAKE_CASE matching the feature name. Examples:
- `BOM_TOOL_SAMPLE.html`
- `TOWN_PLANNING_PROTOTYPE.html`
- `XA_COMPLIANCE_TOOL.html`
- `SPECFORGE_WORKSPACE_SAMPLE.html`

## Required Structure

Each sample HTML file must:

1. Be a **self-contained single file** — no external dependencies (inline all CSS and JS)
2. Use the Architex dark theme aesthetic (dark backgrounds, glass cards, Inter font)
3. Include realistic sample data that demonstrates the feature's key states
4. Be responsive (works at 1200px+ desktop width minimum)
5. Reflect the actual component structure that will be built in React

## Template Pattern

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architex — [Feature Name] Design Sample</title>
  <style>
    /* Inline all styles — match Architex dark theme */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    /* ... feature-specific styles ... */
  </style>
</head>
<body>
  <!-- Feature UI mockup with realistic data -->
</body>
</html>
```

## Workflow

1. **Before or during** React component development, create the sample HTML
2. Iterate on layout, colour, spacing, and interaction patterns in the HTML
3. Use the HTML as the reference when implementing the React component
4. Keep the HTML file updated if the design evolves significantly
5. The HTML file stays in the repo as a design artifact / reference

## When to Create

- When building a **new tool** (toolbox tile → full definition)
- When building a **new dashboard or workspace view**
- When significantly redesigning an existing feature's UI
- When workshopping a complex layout before committing to implementation

## When NOT Needed

- Bug fixes or logic-only changes
- Minor style tweaks to existing components
- Backend-only work (API routes, services with no UI)
- Test files or documentation updates
