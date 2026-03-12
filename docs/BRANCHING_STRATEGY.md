# Branching Strategy

This repository uses a lightweight Git Flow model.

## Branch Roles

- `main`: production-ready code only.
- `develop`: integration branch for validated work.
- `feature/*`: feature-level development branches.
- `hotfix/*`: emergency production fixes (branched from `main`).
- `chore/*`: maintenance, docs, tooling, CI tasks.

## Standard Workflow

1. Update local `develop`.

```bash
git checkout develop
git pull origin develop
```

2. Create a feature branch.

```bash
git checkout -b feature/<short-name>
```

3. Commit with conventional prefixes.

```bash
git add .
git commit -m "feat: add webhook replay endpoint"
```

4. Push branch and open PR into `develop`.

```bash
git push -u origin feature/<short-name>
```

5. After merge into `develop`, periodically release `develop` into `main`.

## Merge Rules

- Squash merge feature branches into `develop`.
- Use regular merge (or squash with release commit) from `develop` into `main`.
- Never commit directly to `main` except critical hotfixes.

## Commit Message Convention

- `feat:` new feature
- `fix:` bug fix
- `refactor:` internal code changes without behavior change
- `test:` tests only
- `docs:` documentation only
- `chore:` tooling, CI, dependency, maintenance

## Quality Gate Before PR

Run all checks locally before creating PR:

```bash
npm run typecheck
npm run test
npm run build
```

## Suggested Branch Protection (GitHub Settings)

For both `main` and `develop`, enable:

- Require pull request before merging
- Require status checks to pass (CI)
- Require branches to be up to date before merging
- Dismiss stale approvals when new commits are pushed
- Restrict direct pushes
