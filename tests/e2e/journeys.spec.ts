import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function resetSession(request: APIRequestContext) {
  await request.post("/api/demo", { data: { action: "reset" } });
  await request.post("/api/data/clear", { data: { confirm: true } });
}

async function waitForDemoMessages(page: Page, count: number, timeout = 90_000) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/session?after=0");
      const body = (await response.json()) as { metrics: { messagesInBuffer: number } };
      return body.metrics.messagesInBuffer;
    }, { timeout, intervals: [1000] })
    .toBeGreaterThanOrEqual(count);
}

test.beforeEach(async ({ request }) => {
  await resetSession(request);
});

test("loads the overview with an honest empty state and no fake data", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByText("Twitch chat connection")).toBeVisible();
  await expect(page.getByText("No data source")).toBeVisible();
  await expect(page.getByText("No messages yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
});

test("rejects an invalid channel name before any connection attempt", async ({ page }) => {
  await page.goto("/overview");
  await page.getByLabel("Channel name").fill("bad name!");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Channel names use 4–25 letters")).toBeVisible();
  await expect(page.locator(":visible").filter({ hasText: /^Disconnected$/ }).first()).toBeVisible();
});

test("demo journey: messages arrive, analysis runs, questions are queued and handled", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/overview");
  await page.getByRole("button", { name: "Try demo" }).click();
  await expect(page.getByText("Demo · synthetic").first()).toBeVisible();
  await waitForDemoMessages(page, 40);
  await expect(page.getByText("what weapon are you using rn?").first()).toBeVisible({ timeout: 20_000 });

  // Pause the demo: the server keeps running, but the visible count stops changing.
  await page.getByRole("button", { name: "Pause demo" }).click();
  await expect(page.getByText("Demo paused").first()).toBeVisible();
  await page.getByRole("button", { name: "Resume demo" }).click();

  // Insights: run analysis and check grounded output.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Insights" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Insights" })).toBeVisible();
  await page.getByRole("button", { name: "Run analysis now" }).click();
  await expect(page.getByText("Local rules (not AI)").first()).toBeVisible();
  await expect(page.getByText(/The most repeated terms in this window are/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Analysis history")).toBeVisible();

  // Question queue: repeated question appears, can be marked handled and reopened.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Question Queue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Question queue" })).toBeVisible();
  const firstCard = page.getByRole("article").first();
  await expect(firstCard).toBeVisible();
  await firstCard.getByRole("button", { name: "Mark handled" }).click();
  await expect(page.getByText("Marked as handled").first()).toBeVisible();
  await page.getByRole("tab", { name: /Handled \(1\)/ }).click();
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByRole("article").first().getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("Question reopened").first()).toBeVisible();

  // Live chat: search and filter.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Live Chat" }).click();
  // The "pizza" line is late in the script; wait until it has been emitted before searching.
  await waitForDemoMessages(page, 52, 120_000);
  await page.getByLabel("Search messages or usernames").fill("pizza");
  await expect(page.getByText(/Showing \d+ of \d+ buffered messages/)).toBeVisible();
  await expect(page.locator("ol[aria-label='Chat messages'] li").first()).toContainText("pizza");
  await page.getByLabel("Search messages or usernames").fill("");
  await page.getByLabel("Filter messages").selectOption("broadcaster");
  await expect(page.locator("ol[aria-label='Chat messages'] li").first()).toContainText("Broadcaster");

  // Clear the session with confirmation.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear session data" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear session data" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear data" }).click();
  await expect(page.getByText("Session data cleared").first()).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/session")).json()).metrics.messagesInBuffer).toBe(0);
});

test("settings save and validate numeric limits", async ({ page }) => {
  await page.goto("/settings");
  // Form fields render after the first snapshot, so waiting for them also waits for hydration.
  await expect(page.getByLabel("Message buffer size")).toBeVisible();
  await page.getByLabel("Message buffer size").fill("50");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Buffer size must be a whole number/)).toBeVisible();
  await page.getByLabel("Message buffer size").fill("750");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved").first()).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/session")).json()).settings.bufferSize).toBe(750);
  await page.request.patch("/api/settings", { data: { bufferSize: 500 } });
});

test("navigation changes the displayed page and keyboard focus is visible", async ({ page }) => {
  await page.goto("/overview");
  for (const [link, heading] of [
    ["Live Chat", "Live chat"],
    ["Insights", "Insights"],
    ["Question Queue", "Question queue"],
    ["Settings", "Settings"],
  ] as const) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCount(1);
});

const pages = ["/overview", "/chat", "/insights", "/questions", "/settings"];
for (const path of pages) {
  test(`layout has no horizontal overflow on a phone width: ${path}`, async ({ page, request }) => {
    await resetSession(request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("tablet layout keeps the sidebar and content usable", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto("/overview");
  await expect(page.getByText("Understand your chat").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
