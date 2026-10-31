import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Run the real web image with the production CSP, independently of the dev stack.
// Only the remote media response is mocked; Chromium still enforces the header.
test("CSP prd permite validação HTTPS da mídia e bloqueia outro destino", async ({
  page,
  request,
}) => {
  const name = "friends-csp-" + randomUUID();
  const project = process.env.TEST_COMPOSE_PROJECT || "chat-friends";
  const image = process.env.TEST_WEB_IMAGE || "chat-friends-web";
  const media = "https://media.example.test:18443";
  const docker = (...args: string[]) =>
    execFileSync("docker", args, { encoding: "utf8", stdio: "pipe" }).trim();
  try {
    docker(
      "run",
      "-d",
      "--name",
      name,
      "--network",
      `${project}_ingress_net`,
      "--network",
      `${project}_api_net`,
      "--network",
      `${project}_signal_net`,
      "--user",
      "10001:10001",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--tmpfs",
      "/data:size=8m,uid=10001,gid=10001",
      "--tmpfs",
      "/config:size=8m,uid=10001,gid=10001",
      "-p",
      "127.0.0.1::8080",
      "-e",
      `MEDIA_CONNECT_SRC=${media} wss://media.example.test:18443`,
      image,
    );
    const address = docker("port", name, "8080/tcp");
    const origin = "http://" + address;
    await expect
      .poll(async () => {
        try {
          return (await request.get(origin)).status();
        } catch {
          return 0;
        }
      })
      .toBe(200);
    // Keep the real Caddy headers, with a minimal document to isolate CSP behavior.
    await page.route(origin + "/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: "<!doctype html><title>CSP</title>",
      });
    });
    await page.route(media + "/rtc/v1/validate", async (route) => {
      await route.fulfill({
        status: 404,
        headers: { "Access-Control-Allow-Origin": origin },
        body: "Not Found",
      });
    });
    let unwantedRequest = false;
    await page.route("https://unconfigured.example.test/**", async (route) => {
      unwantedRequest = true;
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": origin },
      });
    });
    await page.goto(origin + "/?shell=advanced");
    const result = await page.evaluate(async (url) => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push(event.blockedURI);
      });
      const status = (await fetch(url + "/rtc/v1/validate")).status;
      let blocked = false;
      try {
        await fetch("https://unconfigured.example.test/probe");
      } catch {
        blocked = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { status, blocked, violations };
    }, media);
    expect(result.status).toBe(404); // SDK can inspect this and fall back to /rtc.
    expect(result.blocked).toBe(true);
    expect(result.violations).toEqual([
      "https://unconfigured.example.test/probe",
    ]);
    expect(unwantedRequest).toBe(false);
  } finally {
    docker("rm", "-f", name);
  }
});
