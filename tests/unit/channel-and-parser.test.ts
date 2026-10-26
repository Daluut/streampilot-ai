import { describe, expect, it } from "vitest";
import { parseChannelName } from "@/lib/twitch/channel";
import { loginFromPrefix, parseIrcLine, splitFrame } from "@/lib/twitch/irc-parser";

describe("parseChannelName", () => {
  it("normalises case and a leading #", () => {
    expect(parseChannelName("  #SomeChannel ")).toEqual({ ok: true, channel: "somechannel" });
  });
  it("rejects empty input", () => {
    expect(parseChannelName("").ok).toBe(false);
    expect(parseChannelName(undefined).ok).toBe(false);
  });
  it("rejects URLs, spaces and names outside 4–25 characters", () => {
    expect(parseChannelName("https://twitch.tv/abc").ok).toBe(false);
    expect(parseChannelName("has space").ok).toBe(false);
    expect(parseChannelName("abc").ok).toBe(false);
    expect(parseChannelName("a".repeat(26)).ok).toBe(false);
  });
});

describe("parseIrcLine", () => {
  it("parses a tagged PRIVMSG with escaped tag values", () => {
    const line =
      "@badges=broadcaster/1;display-name=Demo\\sUser;id=abc-123;tmi-sent-ts=1700000000000 :demo!demo@demo.tmi.twitch.tv PRIVMSG #chan :hello there";
    const parsed = parseIrcLine(line);
    expect(parsed?.command).toBe("PRIVMSG");
    expect(parsed?.tags["display-name"]).toBe("Demo User");
    expect(parsed?.tags.id).toBe("abc-123");
    expect(parsed?.params).toEqual(["#chan"]);
    expect(parsed?.trailing).toBe("hello there");
    expect(loginFromPrefix(parsed?.prefix ?? null)).toBe("demo");
  });
  it("parses PING and NOTICE with msg-id tags", () => {
    expect(parseIrcLine("PING :tmi.twitch.tv")?.trailing).toBe("tmi.twitch.tv");
    const notice = parseIrcLine("@msg-id=login_unsuccessful :tmi.twitch.tv NOTICE * :Login failed");
    expect(notice?.tags["msg-id"]).toBe("login_unsuccessful");
  });
  it("returns null for empty or malformed lines", () => {
    expect(parseIrcLine("")).toBeNull();
    expect(parseIrcLine("@onlytags")).toBeNull();
  });
  it("keeps message text containing colons and unusual characters intact", () => {
    const parsed = parseIrcLine(":a!a@a.tmi.twitch.tv PRIVMSG #chan :time 12:30 → ünïcödé 🎮 ;;");
    expect(parsed?.trailing).toBe("time 12:30 → ünïcödé 🎮 ;;");
  });
  it("splits multi-line frames", () => {
    expect(splitFrame("PING :a\r\nPING :b\r\n")).toEqual(["PING :a", "PING :b"]);
  });
});
