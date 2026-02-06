# Changesets

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
