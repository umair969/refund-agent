import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AuditEvent = {
  ts: string;
  runId: string;
  kind: "tool_call" | "tool_result" | "approval" | "final" | "error";
  tool?: string;
  input?: unknown;
  output?: unknown;
  note?: string;
};

// Append-only JSONL: one line per event, never rewritten.
export class AuditLog {
  readonly events: AuditEvent[] = [];
  constructor(
    private readonly runId: string,
    private readonly path?: string,
  ) {
    if (path) mkdirSync(dirname(path), { recursive: true });
  }

  write(event: Omit<AuditEvent, "ts" | "runId">): void {
    const full: AuditEvent = { ts: new Date().toISOString(), runId: this.runId, ...event };
    this.events.push(full);
    if (this.path) appendFileSync(this.path, `${JSON.stringify(full)}\n`);
  }
}
