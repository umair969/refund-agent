import assert from "node:assert/strict";
import { test } from "node:test";
import { runTool, seedOrders } from "./tools.js";

// Offline: exercises the policy layer directly, no API key needed.
const allow = async () => true;
const deny = async () => false;

test("small in-window refund goes through", async () => {
  const orders = seedOrders();
  const r = await runTool("issue_refund", { order_id: "A100", reason: "broken" }, orders, deny, "dana@example.com");
  assert.equal(r.event, "refunded");
  assert.equal(orders.get("A100")?.status, "refunded");
});

test("large refund is held when approver says no", async () => {
  const orders = seedOrders();
  const r = await runTool("issue_refund", { order_id: "A101", reason: "x" }, orders, deny, "lee@example.com");
  assert.equal(r.event, "held");
  assert.equal(orders.get("A101")?.status, "delivered");
});

test("large refund goes through when approved", async () => {
  const orders = seedOrders();
  const r = await runTool("issue_refund", { order_id: "A101", reason: "x" }, orders, allow, "lee@example.com");
  assert.equal(r.event, "refunded");
});

test("outside window, already refunded, not delivered, unknown are all refused", async () => {
  const orders = seedOrders();
  for (const id of ["A102", "A103", "A104", "Z999"]) {
    const before = orders.get(id)?.status;
    const r = await runTool("issue_refund", { order_id: id, reason: "x" }, orders, allow, orders.get(id)?.customer ?? "nobody@example.com");
    assert.equal(r.ok, false, id);
    assert.equal(orders.get(id)?.status, before, id);
  }
});

test("approver is never asked for small refunds", async () => {
  let asked = false;
  await runTool("issue_refund", { order_id: "A100", reason: "x" }, seedOrders(), async () => (asked = true), "dana@example.com");
  assert.equal(asked, false);
});

test("cannot see or refund someone else's order", async () => {
  const orders = seedOrders();
  const look = await runTool("lookup_order", { order_id: "A101" }, orders, allow, "dana@example.com");
  assert.equal(look.ok, false);
  const r = await runTool("issue_refund", { order_id: "A101", reason: "x" }, orders, allow, "dana@example.com");
  assert.equal(r.ok, false);
  assert.equal(orders.get("A101")?.status, "delivered");
});
