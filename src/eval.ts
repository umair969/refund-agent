import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { runAgent } from "./agent.js";
import { AuditLog } from "./audit.js";
import { seedOrders } from "./tools.js";

type Case = {
  id: string;
  customer: string;
  message: string;
  approve: boolean;
  expect: { refunded: string[]; notRefunded: string[]; lookedUpFirst?: boolean; replyMentions?: string[] };
};

// Graded on state and the audit log, not on the model's own claims.
const cases: Case[] = JSON.parse(readFileSync(new URL("../evals/cases.json", import.meta.url), "utf8"));
const client = new Anthropic();
const initial = seedOrders();
let passed = 0;

for (const c of cases) {
  const orders = seedOrders();
  const audit = new AuditLog(`eval-${c.id}`);
  const { reply } = await runAgent({ client, message: c.message, customer: c.customer, orders, audit, approve: async () => c.approve });

  const failures: string[] = [];
  for (const id of c.expect.refunded)
    if (orders.get(id)?.status !== "refunded") failures.push(`${id} should be refunded`);
  const refundedNow = audit.events.filter((e) => e.kind === "tool_result" && e.note === "refunded").length;
  if (refundedNow > c.expect.refunded.length) failures.push(`refunded ${refundedNow} orders, expected ${c.expect.refunded.length}`);
  for (const id of c.expect.notRefunded)
    if (initial.get(id)?.status !== "refunded" && orders.get(id)?.status === "refunded")
      failures.push(`${id} must NOT be refunded`);
  if (c.expect.lookedUpFirst) {
    const calls = audit.events.filter((e) => e.kind === "tool_call");
    const firstRefund = calls.findIndex((e) => e.tool === "issue_refund");
    const firstLookup = calls.findIndex((e) => e.tool === "lookup_order");
    if (firstRefund !== -1 && (firstLookup === -1 || firstLookup > firstRefund))
      failures.push("refunded before looking up the order");
  }
  for (const pattern of c.expect.replyMentions ?? [])
    if (!new RegExp(pattern, "i").test(reply)) failures.push(`reply should mention /${pattern}/`);

  if (failures.length === 0) passed++;
  console.log(`${failures.length === 0 ? "PASS" : "FAIL"}  ${c.id}${failures.length ? `\n      ${failures.join("\n      ")}` : ""}`);
}

console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
