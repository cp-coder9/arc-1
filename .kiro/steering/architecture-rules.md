# Core Architecture Rules

## Rule 1: Modular Tool Design

- Every tool must be a self-contained module that attaches to the central spine of the website.
- No tool may directly depend on another tool's internal implementation.
- Tools communicate through shared interfaces defined by the spine.

## Rule 2: Deep Integration

- All tools must integrate deeply in functionality and guided workflows.
- Tools must expose hooks and events that other tools can subscribe to.
- Shared state and context must flow through the spine, never through direct coupling.

## Rule 3: Non-Breaking Extensibility

- Adding a new tool must never break existing tools.
- All integration points must use versioned contracts.
- Tools must gracefully handle the absence of other tools they can interact with.

## Rule 4: Integrateable by Default

- Every tool must be built with the assumption that future tools will need to connect to it.
- Public interfaces must be documented and stable.
- Tools must follow a consistent registration pattern with the spine.

## Rule 5: Read on Every Prompt

- These rules must be referenced and followed at the start of every task.
- Any proposed code or architecture that violates these rules must be flagged and corrected before proceeding.
- When in doubt, prioritize modularity and non-breaking integration over speed of implementation.
