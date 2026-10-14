import Anthropic from "@anthropic-ai/sdk";
import { AuditLog } from "./audit.js";
import { type Approver, type Order, runTool, tools } from "./tools.js";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 8;

const SYSTEM = `You are a customer support agent for an online shop.
Always look up an order before acting on it. Follow the refund rules in the tool descriptions.
If a refund is not allowed, explain why politely and offer to escalate to a human.
Never promise a refund the tools did not confirm. Keep replies under 80 words.`;

export type RunResult = { reply: string; audit: AuditLog; stopReason: string | null };

export async function runAgent(opts: {
  client: Anthropic;
  message: string;
  customer: string;
  orders: Map<string, Order>;
  approve: Approver;
  audit: AuditLog;
}): Promise<RunResult> {
  const { client, orders, audit, customer } = opts;
  const approve: Approver = async (orderId, amountUsd) => {
    const approved = await opts.approve(orderId, amountUsd);
    audit.write({ kind: "approval", input: { orderId, amountUsd }, output: approved ? "approved" : "denied" });
    return approved;
  };
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.message }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      output_config: { effort: "medium" },
      messages,
    });

    if (response.stop_reason === "refusal") {
      audit.write({ kind: "error", note: "model refused" });
      return { reply: "Sorry, I can't help with that. A human will follow up.", audit, stopReason: "refusal" };
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      audit.write({ kind: "final", output: reply });
      return { reply, audit, stopReason: response.stop_reason };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      audit.write({ kind: "tool_call", tool: block.name, input });
      const r = await runTool(block.name, input, orders, approve, customer);
      audit.write({ kind: "tool_result", tool: block.name, output: r.result, note: r.event });
      results.push({ type: "tool_result", tool_use_id: block.id, content: r.result, is_error: !r.ok });
    }
    // All results for one assistant turn go back in a single user message.
    messages.push({ role: "user", content: results });
  }

  audit.write({ kind: "error", note: `hit ${MAX_TURNS}-turn limit` });
  return { reply: "Sorry, something went wrong. A human will follow up.", audit, stopReason: "turn_limit" };
}
