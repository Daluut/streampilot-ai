import { DEMO_SCRIPT, type DemoScriptLine } from "./script";
import type { DemoStatus } from "@/lib/types";

export const DEMO_INTERVAL_MS = 1100;

export interface DemoSimulatorOptions {
  emit: (line: DemoScriptLine) => void;
  onFinished?: () => void;
  script?: readonly DemoScriptLine[];
  intervalMs?: number;
  setInterval?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (handle: ReturnType<typeof setInterval>) => void;
}

/**
 * Emits the scripted demo messages at a fixed rate. The schedule is deterministic:
 * one message per tick, in script order, and the demo stops when the script ends.
 */
export class DemoSimulator {
  private readonly emit: (line: DemoScriptLine) => void;
  private readonly onFinished: () => void;
  private readonly script: readonly DemoScriptLine[];
  private readonly intervalMs: number;
  private readonly setTimer: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  private readonly clearTimer: (handle: ReturnType<typeof setInterval>) => void;
  private handle: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private status: DemoStatus = "stopped";

  constructor(options: DemoSimulatorOptions) {
    this.emit = options.emit;
    this.onFinished = options.onFinished ?? (() => {});
    this.script = options.script ?? DEMO_SCRIPT;
    this.intervalMs = options.intervalMs ?? DEMO_INTERVAL_MS;
    this.setTimer = options.setInterval ?? ((handler, ms) => setInterval(handler, ms));
    this.clearTimer = options.clearInterval ?? ((handle) => clearInterval(handle));
  }

  get currentStatus(): DemoStatus {
    return this.status;
  }

  get emittedCount(): number {
    return this.index;
  }

  get totalCount(): number {
    return this.script.length;
  }

  start(): void {
    if (this.status === "running") return;
    this.index = 0;
    this.status = "running";
    this.schedule();
  }

  pause(): void {
    if (this.status !== "running") return;
    this.status = "paused";
    this.unschedule();
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "running";
    this.schedule();
  }

  stop(): void {
    this.unschedule();
    this.index = 0;
    this.status = "stopped";
  }

  /** Emits the next scripted message. Exposed so tests and the timer share one code path. */
  tick(): void {
    if (this.status !== "running") return;
    if (this.index >= this.script.length) {
      this.unschedule();
      this.status = "finished";
      this.onFinished();
      return;
    }
    const line = this.script[this.index];
    this.index += 1;
    this.emit(line);
  }

  private schedule(): void {
    if (this.handle) return;
    this.handle = this.setTimer(() => this.tick(), this.intervalMs);
  }

  private unschedule(): void {
    if (this.handle) {
      this.clearTimer(this.handle);
      this.handle = null;
    }
  }
}
