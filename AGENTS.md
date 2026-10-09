# Project instructions

- Canonical checkout: `/Users/zjz/code/noir-poker`. Edit `src/` and `index.html`; never hand-edit generated `dist/`.
- Make each new change on a dedicated branch and open a GitHub pull request. Do not push changes directly to GitHub `main` or merge a pull request without the user's instruction. Keep any earlier unpublished changes in the same proposed branch when requested.
- Preserve no-login local practice, virtual chips and Chinese UI. Keep the existing Sites project ID in `.openai/hosting.json`.
- Rules live in `src/engine/poker.js`. Do not duplicate settlement or legal-action logic in UI. Any rule change needs a boundary regression test and chip-conservation verification.
- BTN's next clockwise seat is SB, then BB. Short all-ins, raise reopening, eligibility and uncalled refunds must retain existing semantics.
- Review uses before-action public snapshots. Never use hidden opponent cards, future deck or final winners to grade a decision. Distinguish estimates, heuristics and proven rule errors.
- Timer/Worker changes must preserve cancellation on next hand, retry and reset. Retry restores original deal and retracts payouts/statistics exactly once.
- Validate material changes with `npm run check`; UI changes with `npm run test:e2e`. Use `npm run format:check` before delivering. E2E fixtures run only in Vite test mode and must never enter production.
- If changing paths or commands, update README and docs in the same change. Do not store publishing credentials in this repository.
