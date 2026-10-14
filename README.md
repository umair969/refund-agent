# refund-agent

A customer-support agent that can issue refunds, built the way production
agents should be:

- **Rules enforced in code, not just the prompt.** The refund window, the
  "already refunded" check and the approval limit live in `src/tools.ts`.
  A prompt injection can make the model *ask*; it can't make the tool *do*.
- **Human approval for risky actions.** Refunds over $100 pause for a person; every decision is logged.
- **Customers only touch their own orders.** Another customer's order looks like a missing one.
- **Append-only audit log.** Every tool call and result is a JSONL line in `audit/`.
- **Evals graded on outcomes.** `npm run eval` runs 9 scenarios (including a
  prompt injection) and checks real state and the audit log, not what the
  model says it did.

## Run

```bash
npm install
export ANTHROPIC_API_KEY=...        # or: ant auth login
npm start -- "Refund order A101 please, wrong size"
npm test          # offline policy tests, no key needed
npm run eval
```

Model: Claude Opus 5.5 via `@anthropic-ai/sdk`, manual tool-use loop (`src/agent.ts`).
A full eval run is 9 short conversations; expect cents, not dollars.

## Files
| File | What |
|---|---|
| `src/agent.ts` | tool-use loop, turn limit, refusal handling |
| `src/tools.ts` | tool schemas + policy enforcement |
| `src/audit.ts` | append-only JSONL audit log |
| `src/eval.ts`, `evals/cases.json` | outcome-graded eval suite |
