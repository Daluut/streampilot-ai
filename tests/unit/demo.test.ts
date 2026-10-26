import { describe, expect, it, vi } from "vitest";
import { DEMO_SCRIPT } from "@/lib/demo/script";
import { DemoSimulator } from "@/lib/demo/simulator";

describe("demo script", () => {
  it("contains a repeated question, a broadcaster reply and a topic change", () => {
    const questions = DEMO_SCRIPT.filter((l) => /weapon/i.test(l.text) && l.text.includes("?"));
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_SCRIPT.some((l) => l.broadcaster)).toBe(true);
    expect(DEMO_SCRIPT.some((l) => /pizza/i.test(l.text))).toBe(true);
  });
});

describe("DemoSimulator", () => {
  it("emits in script order, supports pause and resume, and finishes", () => {
    const emitted: string[] = [];
    const onFinished = vi.fn();
    const sim = new DemoSimulator({
      emit: (line) => emitted.push(line.text),
      onFinished,
      script: [{ username: "a", text: "one" }, { username: "b", text: "two" }, { username: "c", text: "three" }],
      setInterval: () => 0 as never,
      clearInterval: () => {},
    });
    sim.start();
    sim.tick();
    sim.pause();
    sim.tick();
    expect(emitted).toEqual(["one"]);
    sim.resume();
    sim.tick();
    sim.tick();
    sim.tick();
    expect(emitted).toEqual(["one", "two", "three"]);
    expect(sim.currentStatus).toBe("finished");
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
  it("stop resets the position", () => {
    const sim = new DemoSimulator({ emit: () => {}, script: DEMO_SCRIPT, setInterval: () => 0 as never, clearInterval: () => {} });
    sim.start();
    sim.tick();
    sim.stop();
    expect(sim.currentStatus).toBe("stopped");
    expect(sim.emittedCount).toBe(0);
  });
});
