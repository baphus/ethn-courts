# Domain Docs

Single-context layout: `CONTEXT.md` at repo root and ADRs under `docs/adr/`.

## Before exploring, read these

- Root `CONTEXT.md`.
- ADRs in `docs/adr/` that touch the area being explored.

If these files do not exist, proceed silently. `/domain-modeling` (also reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions get resolved. Existing project-required reading still applies.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term defined in `CONTEXT.md`. Avoid synonyms the glossary explicitly rejects.

If a concept is missing, reconsider whether the project uses that language; note genuine gaps for `/domain-modeling`.

## Flag ADR conflicts

Surface any contradiction with an existing ADR explicitly, naming the ADR and why reopening it is warranted.
