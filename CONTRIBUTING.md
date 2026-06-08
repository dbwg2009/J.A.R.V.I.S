# Contributing to J.A.R.V.I.S.

Thank you for your interest in contributing. This is a personal portfolio project, but improvements and bug fixes are welcome.

## How to contribute

1. **Fork** the repository and create a new branch from `main`:
   ```bash
   git checkout -b fix/your-fix-name
   ```

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Test locally** with:
   ```bash
   wrangler pages dev . --d1=DB=jarvis-db
   ```

4. **Open a pull request** with a clear description of what you changed and why.

## Guidelines

- Keep the Stark Industries / JARVIS aesthetic — UI changes should match the existing dark cyan design language.
- Do not commit secrets, API keys, or personal data.
- Worker functions should validate session auth before any DB operation.
- All new API routes must be added under `functions/api/` following the existing pattern.
- New D1 tables or columns should include a migration in `schema.sql` with `IF NOT EXISTS` / `IF NOT EXISTS column` guards.

## Reporting bugs

Open a GitHub Issue with:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behaviour
- Browser / OS if it's a frontend issue

## Feature requests

Open a GitHub Issue tagged `enhancement`. Describe the use case, not just the feature.