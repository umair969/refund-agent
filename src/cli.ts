import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { runAgent } from "./agent.js";
import { AuditLog } from "./audit.js";
import { seedOrders } from "./tools.js";

const customer = process.env.CUSTOMER ?? "dana@example.com";
const message = process.argv.slice(2).join(" ") || "Hi, I want a refund for order A100, it arrived broken.";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const runId = randomUUID();

const { reply } = await runAgent({
  client: new Anthropic(),
  message,
  customer,
  orders: seedOrders(),
  audit: new AuditLog(runId, `audit/${runId}.jsonl`),
  approve: async (orderId, amount) =>
    (await rl.question(`Approve refund of $${amount} for ${orderId}? [y/N] `)).trim().toLowerCase() === "y",
});

rl.close();
console.log(`\nAgent: ${reply}\nAudit log: audit/${runId}.jsonl`);
