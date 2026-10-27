import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

let server: ChildProcess;
const origin = "http://127.0.0.1:4175";
test.beforeAll(async ({ request }) => {
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--mode",
      "demo",
      "--host",
      "127.0.0.1",
      "--port",
      "4175",
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null)
          throw new Error("Servidor demo não iniciou");
        try {
          return (await request.get(origin)).status();
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);
});
test.afterAll(() => {
  server?.kill();
});

test("demo abre a nova interface e indica que MFA exige aplicação conectada", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel("Usuário", { exact: true }).fill("demo");
  await page.getByLabel("Senha", { exact: true }).fill("demo-only-password");
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(page.getByRole("heading", { name: /geral/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Segurança", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Esta sessão", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Ativar autenticador" }).click();
  const gate = page.locator(".security-page");
  await gate
    .getByLabel("Senha atual", { exact: true })
    .fill("demo-only-password");
  await gate.getByRole("button", { name: "Configurar autenticador" }).click();
  await expect(gate.getByRole("alert")).toContainText(
    "somente na aplicação conectada",
  );
  expect(errors).toEqual([]);
});
