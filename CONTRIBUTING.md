# Contributing to ContextFlow

Thanks for contributing.

## Quick Start

1. Fork or clone the repository.
2. Copy environment config:

```bash
cp .env.example .env
```

3. Install dependencies:

```bash
npm install
```

4. Run checks:

```bash
npm run typecheck
npm run test
npm run build
```

## Development Flow

- Create your branch from `develop`.
- Use small, focused commits.
- Open PR into `develop` using the PR template.
- Ensure CI is green before requesting review.

See `docs/BRANCHING_STRATEGY.md` for full branching rules.

## Coding Standards

- Keep modules small and cohesive.
- Add tests for behavior changes.
- Avoid breaking public API contracts unless intentional.
- Update docs for any config or endpoint changes.

## Pull Request Expectations

- Clear problem statement
- Implementation summary and trade-offs
- Evidence of validation
- Rollback notes for risky changes
