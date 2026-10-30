import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { historyPage } from "./chat-history-fixture";

test("mede 10000 mensagens antes/depois da decisão de janela", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.T05_MEASURE,
    "Medição explícita, fora do gate funcional",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const chat = await historyPage(page, 50);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await cdp.send("Performance.getMetrics");
  const start = performance.now();
  chat.arrive(10_000);
  await expect(page.locator(".connection")).toContainText("Sincronizando");
  await expect(page.locator(".connection")).toContainText("Atualizado", {
    timeout: 150_000,
  });
  const elapsed = performance.now() - start;
  const metrics = await cdp.send("Performance.getMetrics");
  const dom = await cdp.send("Memory.getDOMCounters");
  const rendered = await page.locator(".message").count();
  if (process.env.T05_MEASURE === "bounded") {
    expect(rendered).toBe(200);
    await expect(page.locator(".chat-window-label")).toContainText(
      "de 10000 mensagens carregadas",
    );
    await expect(page.locator('[data-message-id="10000"]')).toBeAttached();
  }
  const scroll = await page
    .locator(".messages")
    .evaluate((el) => ({ height: el.scrollHeight, viewport: el.clientHeight }));
  const baseline = Object.fromEntries(
    before.metrics.map((m: { name: string; value: number }) => [
      m.name,
      m.value,
    ]),
  );
  const current = Object.fromEntries(
    metrics.metrics.map((m: { name: string; value: number }) => [
      m.name,
      m.value,
    ]),
  );
  const result = {
    scenario: process.env.T05_MEASURE,
    messagesAvailable: 10_000,
    viewport: { width: 1440, height: 1000 },
    browser: context.browser()?.version(),
    mode: "Vite dev, sem throttling; HTTP/WS sintéticos; 5% textos de 4000 UTF-16",
    catchUpMs: Math.round(elapsed),
    renderedMessages: rendered,
    domNodes: dom.nodes,
    jsHeapUsedMiB: Math.round((current.JSHeapUsedSize / 1024 / 1024) * 10) / 10,
    scriptMs: Math.round(
      (current.ScriptDuration - baseline.ScriptDuration) * 1000,
    ),
    layoutMs: Math.round(
      (current.LayoutDuration - baseline.LayoutDuration) * 1000,
    ),
    scroll,
  };
  const output = resolve(
    process.env.T05_MEASURE_OUTPUT ??
      `../work/t05-${process.env.T05_MEASURE}.json`,
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  expect(chat.errors).toEqual([]);
});
