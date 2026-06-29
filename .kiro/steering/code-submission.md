# Code Submission & Git Workflow

## Mandatory Rules

When submitting code to the GitHub repository, the agent **must** follow this process:

1. **Production-ready code only** — All code must be complete, clean, and production-ready before any push. No placeholder implementations, TODO stubs, or incomplete features.

2. **Thorough testing required** — Before pushing:
   - Run `npm run lint` (zero TypeScript errors)
   - Run `npm test` (all unit tests pass)
   - Run `npm run build` (clean production build)
   - Add or update tests for any new or changed functionality
   - Verify no regressions in existing tests

3. **Push to a feature branch** — Never push directly to `main` or `master`. Always create and push to a descriptive feature branch (e.g., `feature/description`, `fix/description`).

4. **Create a Pull Request** — After pushing the branch, create a PR for review using `gh pr create`. Include a clear title and description summarizing changes and what was tested.

5. **Do not merge** — The PR must be left open for human review. The agent must not merge the PR under any circumstances.

## Summary

```
Code ready → Tests pass → Push to branch → Open PR → Stop (do not merge)
```
