import type Anthropic from "@anthropic-ai/sdk";

// In-memory fake store so the demo and evals run without a database.
export type Order = { id: string; customer: string; amountUsd: number; status: "delivered" | "shipped" | "refunded"; daysSinceDelivery: number | null };

export function seedOrders(): Map<string, Order> {
  return new Map<string, Order>([
    ["A100", { id: "A100", customer: "dana@example.com", amountUsd: 42, status: "delivered", daysSinceDelivery: 5 }],
    ["A101", { id: "A101", customer: "lee@example.com", amountUsd: 480, status: "delivered", daysSinceDelivery: 3 }],
    ["A102", { id: "A102", customer: "sam@example.com", amountUsd: 30, status: "delivered", daysSinceDelivery: 60 }],
    ["A103", { id: "A103", customer: "kim@example.com", amountUsd: 25, status: "refunded", daysSinceDelivery: 10 }],
    ["A104", { id: "A104", customer: "ari@example.com", amountUsd: 60, status: "shipped", daysSinceDelivery: null }],
  ]);
}

export const POLICY = {
  refundWindowDays: 30,
  autoApproveLimitUsd: 100,
};

export const tools: Anthropic.Tool[] = [
  {
    name: "lookup_order",
    description: "Look up an order by id. Returns amount, status and days since delivery.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "issue_refund",
    description:
      `Refund an order in full. Only for delivered orders within ${POLICY.refundWindowDays} days of delivery. ` +
      `Refunds over $${POLICY.autoApproveLimitUsd} are held for human approval; tell the customer it is pending review.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["order_id", "reason"],
      additionalProperties: false,
    },
  },
];

export type Approver = (orderId: string, amountUsd: number) => Promise<boolean>;

// Every rule is enforced here in code, not only in the prompt: the model can
// ask for anything, the tool decides what actually happens.
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  orders: Map<string, Order>,
  approve: Approver,
  customer: string,
): Promise<{ ok: boolean; result: string; event?: "refunded" | "held" }> {
  const orderId = String(input.order_id ?? "");
  const found = orders.get(orderId);
  // Customers only see their own orders; someone else's order looks like a missing one.
  const order = found?.customer === customer ? found : undefined;

  if (name === "lookup_order") {
    if (!order) return { ok: false, result: `No order ${orderId}.` };
    return { ok: true, result: JSON.stringify(order) };
  }

  if (name === "issue_refund") {
    if (!order) return { ok: false, result: `No order ${orderId}.` };
    if (order.status === "refunded") return { ok: false, result: "Already refunded." };
    if (order.status !== "delivered") return { ok: false, result: "Not delivered yet; cannot refund." };
    if ((order.daysSinceDelivery ?? 0) > POLICY.refundWindowDays)
      return { ok: false, result: `Outside the ${POLICY.refundWindowDays}-day refund window.` };
    if (order.amountUsd > POLICY.autoApproveLimitUsd && !(await approve(orderId, order.amountUsd)))
      return { ok: true, result: "Held for human approval. Not refunded yet.", event: "held" };
    order.status = "refunded";
    return { ok: true, result: `Refunded $${order.amountUsd}.`, event: "refunded" };
  }

  return { ok: false, result: `Unknown tool ${name}.` };
}
