# Changesets

## Auto-generation
When you open a Pull Request (not in draft mode), a GitHub Action automatically generates a changeset file for you. The workflow:
- Detects which packages/apps were modified
- Uses the PR title and description to create a changeset
- Commits the changeset file to your PR branch
- Posts a comment on your PR

**You should review and edit the auto-generated changeset** to ensure it accurately describes your changes.

## Manual creation
You can also create changesets manually:
```bash
pnpm changeset
```

## Quick rules
- One change = one changeset.
- Use short, descriptive summaries (1-3 lines).
- If the Docker release should move, include `apps/server` in the changeset.

## Suggested template
```
---
"apps/server": patch
---
What changed and why (user-facing). Mention impact or migration if needed.
```

## Tips
- Prefer: "Adds tenant login UI and improves auth errors."
- Avoid: "Updates stuff", "fixes", "wip".
- Review auto-generated changesets and update if needed.
