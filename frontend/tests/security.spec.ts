import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
const username = "security-" + Date.now(),
  password = "test-only-security-" + Date.now();
function totp(secret: string) {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const c of secret) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hash[19] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
test("autenticador, recuperação e revogação da própria sessão pela interface", async ({
  page,
  request,
}) => {
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!adminPassword)
    throw new Error("Credencial de administrador descartável obrigatória");
  let csrf = (await (await request.get("/api/csrf")).json()).token;
  expect(
    (
      await request.post("/api/login", {
        form: { username: "admin", password: adminPassword },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(204);
  csrf = (await (await request.get("/api/csrf")).json()).token;
  expect(
    (
      await request.post("/api/admin/accounts", {
        data: { username, displayName: "Segurança de teste", password },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(page.getByRole("heading", { name: /geral/ })).toBeVisible();
  await page.getByRole("button", { name: "Minha conta" }).click();
  await page.getByRole("button", { name: "Ativar autenticador" }).click();
  const gate = page.locator(".security-page");
  await gate.getByLabel("Senha atual", { exact: true }).fill(password);
  await gate.getByRole("button", { name: "Configurar autenticador" }).click();
  const secret = await gate.locator(".mfa-secret code").textContent();
  if (!secret) throw new Error("Chave de inscrição ausente");
  await gate
    .getByLabel("Código do autenticador ou de recuperação")
    .fill(totp(secret));
  await gate.getByRole("button", { name: "Confirmar código" }).click();
  await expect(gate.locator("li code")).toHaveCount(8);
  const recovery = await gate.locator("li code").first().textContent();
  if (!recovery) throw new Error("Recuperação ausente");
  await gate
    .getByRole("button", { name: "Guardei os códigos. Continuar" })
    .click();
  await expect(page.getByText("Autenticador: ativado")).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no espaço" }).click();
  await expect(
    page.getByRole("heading", { name: "Verificar acesso" }),
  ).toBeVisible();
  expect((await page.request.get("/api/messages")).status()).toBe(403);
  await page
    .getByLabel("Código do autenticador ou de recuperação")
    .fill(recovery);
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByRole("heading", { name: /geral/ })).toBeVisible();
  await page.getByRole("button", { name: "Minha conta" }).click();
  await expect(page.getByText("Esta sessão", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Encerrar sessão" }).click();
  await expect(
    page.getByRole("heading", { name: "Entre e fique à vontade." }),
  ).toBeVisible();
});
