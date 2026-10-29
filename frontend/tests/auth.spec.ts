import { test, expect, type Page, type Route } from "@playwright/test";

// Requests are intercepted before any credentials can reach a real server.
const username = "auth-ui-test";
const password = "test-password-only";
const csrf = { token: "ui-test-token", headerName: "X-CSRF-TOKEN" };

async function loginForm(
  page: Page,
  onLogin: (route: Route) => Promise<void>,
  onCsrf: (route: Route) => Promise<void> = (route) =>
    route.fulfill({ json: csrf }),
  onMe: (route: Route) => Promise<void> = (route) =>
    route.fulfill({ status: 401 }),
) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return onMe(route);
    if (path === "/api/csrf") return onCsrf(route);
    if (path === "/api/login") return onLogin(route);
    if (path === "/api/messages" || path === "/api/members")
      return route.fulfill({ json: [] });
    if (path === "/api/media/state")
      return route.fulfill({
        json: {
          lease: { identity: null, leaseId: null, expiresAt: null },
          participants: [],
        },
      });
    if (path === "/api/music/state")
      return route.fulfill({
        json: {
          status: "idle",
          current: null,
          queue: [],
          error: null,
          elapsed: 0,
        },
      });
    return route.fulfill({ status: 404 });
  });
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage(() => undefined);
  });
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
}

async function canRetry(page: Page) {
  await expect(
    page.getByRole("button", { name: /Entrar no espaço/ }),
  ).toBeEnabled();
  await expect(page.getByLabel("Usuário", { exact: true })).toHaveValue(
    username,
  );
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue(password);
}

test("login 401 informa credenciais inválidas e permite corrigir a tentativa", async ({
  page,
}) => {
  await loginForm(page, (route) => route.fulfill({ status: 401 }));
  await expect(page.getByRole("alert")).toHaveText(
    "Usuário ou senha inválidos.",
  );
  await canRetry(page);
});

const signedIn = {
  user: {
    id: "auth-ui-user",
    username,
    displayName: "Amigo de teste",
    admin: false,
    enabled: true,
    primaryColor: null,
    secondaryColor: null,
    avatarVersion: null,
  },
  spaceName: "Espaço de teste",
  security: {
    mfaEnabled: false,
    mfaPending: false,
    enrollmentRequired: false,
  },
};

test("login aceito com sessão persistida abre a conversa", async ({ page }) => {
  let loginAccepted = false;
  await loginForm(
    page,
    async (route) => {
      loginAccepted = true;
      await route.fulfill({ status: 204 });
    },
    undefined,
    (route) =>
      loginAccepted
        ? route.fulfill({ json: signedIn })
        : route.fulfill({ status: 401 }),
  );
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Entre e fique à vontade." }),
  ).toHaveCount(0);
});

for (const scenario of [
  {
    name: "MFA pendente",
    mfaPending: true,
    enrollmentRequired: false,
    heading: "Verificar acesso",
  },
  {
    name: "cadastro MFA obrigatório",
    mfaPending: false,
    enrollmentRequired: true,
    heading: "Proteger sua conta",
  },
]) {
  test(`login aceito com ${scenario.name} exige proteção antes de abrir o espaço`, async ({
    page,
  }) => {
    let loginAccepted = false;
    await loginForm(
      page,
      async (route) => {
        loginAccepted = true;
        await route.fulfill({ status: 204 });
      },
      undefined,
      (route) =>
        loginAccepted
          ? route.fulfill({
              json: {
                ...signedIn,
                security: {
                  mfaEnabled: scenario.mfaPending,
                  mfaPending: scenario.mfaPending,
                  enrollmentRequired: scenario.enrollmentRequired,
                },
              },
            })
          : route.fulfill({ status: 401 }),
    );
    await expect(
      page.getByRole("heading", { name: scenario.heading }),
    ).toBeVisible();
    await expect(page.getByLabel("Mensagem em geral")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Sala de voz", exact: true }),
    ).toHaveCount(0);
  });
}

test("nova tentativa após falha temporária entra sem manter o erro anterior", async ({
  page,
}) => {
  let attempts = 0;
  await loginForm(
    page,
    async (route) => {
      attempts++;
      await route.fulfill({ status: attempts === 1 ? 503 : 204 });
    },
    undefined,
    (route) =>
      attempts > 1
        ? route.fulfill({ json: signedIn })
        : route.fulfill({ status: 401 }),
  );
  await expect(page.getByRole("alert")).toContainText(/indisponível|servidor/i);
  await page.getByRole("button", { name: /Entrar no espaço/ }).click();
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: /servidor.*indisponível/i }),
  ).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("login 403 orienta recarregar a sessão e conferir cookies", async ({
  page,
}) => {
  await loginForm(page, (route) => route.fulfill({ status: 403 }));
  await expect(page.getByRole("alert")).toContainText(/recarregue|cookies/i);
  await expect(page.getByRole("alert")).not.toContainText(
    /senha inválida|senha inválidos/i,
  );
  await canRetry(page);
});

test("login 429 informa limite de tentativas", async ({ page }) => {
  await loginForm(page, (route) => route.fulfill({ status: 429 }));
  await expect(page.getByRole("alert")).toContainText(/muitas tentativas/i);
  await expect(page.getByRole("alert")).toContainText(/5 minutos/i);
  await canRetry(page);
});

for (const status of [500, 502, 503]) {
  test(`login ${status} informa falha do servidor sem culpar a senha`, async ({
    page,
  }) => {
    await loginForm(page, (route) =>
      route.fulfill({
        status,
        contentType: "text/html",
        body: "<html><body>Erro do proxy de teste</body></html>",
      }),
    );
    await expect(page.getByRole("alert")).toContainText(
      /indisponível|servidor|serviço/i,
    );
    await expect(page.getByRole("alert")).not.toContainText(
      /usuário ou senha inválidos/i,
    );
    await expect(page.getByRole("alert")).not.toContainText(
      /erro do proxy de teste/i,
    );
    await canRetry(page);
  });
}

test("falha de rede no login informa conexão indisponível", async ({
  page,
}) => {
  await loginForm(page, (route) => route.abort("failed"));
  await expect(page.getByRole("alert")).toContainText(
    /conexão|conectar|rede|servidor/i,
  );
  await expect(page.getByRole("alert")).not.toContainText(
    /usuário ou senha inválidos/i,
  );
  await canRetry(page);
});

for (const status of [403, 503]) {
  test(`falha ${status} ao iniciar sessão impede envio das credenciais`, async ({
    page,
  }) => {
    let loginRequests = 0;
    await loginForm(
      page,
      async (route) => {
        loginRequests++;
        await route.fulfill({ status: 401 });
      },
      (route) => route.fulfill({ status }),
    );
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText(
      /usuário ou senha inválidos/i,
    );
    expect(loginRequests).toBe(0);
    await canRetry(page);
  });
}

test("falha de rede ao iniciar sessão impede envio das credenciais", async ({
  page,
}) => {
  let loginRequests = 0;
  await loginForm(
    page,
    async (route) => {
      loginRequests++;
      await route.fulfill({ status: 401 });
    },
    (route) => route.abort("failed"),
  );
  await expect(page.getByRole("alert")).toContainText(
    /conexão|conectar|rede|servidor/i,
  );
  expect(loginRequests).toBe(0);
  await canRetry(page);
});

test("login aceito sem sessão persistida orienta conferir cookies", async ({
  page,
}) => {
  await loginForm(page, (route) => route.fulfill({ status: 204 }));
  await expect(page.getByRole("alert")).toContainText(/sessão|cookies/i);
  await expect(page.getByRole("alert")).toContainText(/recarregue|cookies/i);
  await expect(page.getByRole("alert")).not.toContainText(
    /usuário ou senha inválidos/i,
  );
  await canRetry(page);
});

test("servidor indisponível após aceitar login continua visível no formulário", async ({
  page,
}) => {
  let loginAccepted = false;
  await loginForm(
    page,
    async (route) => {
      loginAccepted = true;
      await route.fulfill({ status: 204 });
    },
    undefined,
    (route) => route.fulfill({ status: loginAccepted ? 503 : 401 }),
  );
  await expect(page.getByRole("alert")).toContainText(/indisponível|servidor/i);
  await expect(page.getByRole("alert")).not.toContainText(
    /usuário ou senha inválidos/i,
  );
  await canRetry(page);
});
