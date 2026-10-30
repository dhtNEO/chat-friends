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
          leases: [],
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

async function sessionPage(page: Page, onMe: (route: Route) => Promise<void>) {
  let profileChanged = () => {};
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return onMe(route);
    if (path === "/api/csrf") return route.fulfill({ json: csrf });
    if (path === "/api/messages" || path === "/api/members")
      return route.fulfill({ json: [] });
    if (path === "/api/media/state")
      return route.fulfill({
        json: { lease: {}, leases: [], participants: [] },
      });
    return route.fulfill({ status: 404 });
  });
  await page.routeWebSocket("**/ws", (socket) => {
    profileChanged = () => socket.send(JSON.stringify({ type: "profile" }));
    socket.onMessage(() => undefined);
  });
  await page.goto("/");
  return () => profileChanged();
}

for (const failure of ["503", "offline"] as const) {
  test(`GET /me ${failure} na abertura oferece recuperação sem mostrar login`, async ({
    page,
  }) => {
    let unavailable = true;
    await sessionPage(page, (route) =>
      unavailable
        ? failure === "503"
          ? route.fulfill({ status: 503 })
          : route.abort("failed")
        : route.fulfill({ json: signedIn }),
    );
    await expect(page.getByRole("alert")).toContainText(/servidor|conexão/i);
    await expect(page.getByLabel("Usuário", { exact: true })).toHaveCount(0);
    unavailable = false;
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
    await expect(page.locator(".session-notice")).toHaveCount(0);
  });
}

test("GET /me pendente mantém estado carregando", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await sessionPage(page, async (route) => {
    await pending;
    await route.fulfill({ status: 401 });
  });
  await expect(page.getByText("Preparando o seu espaço…")).toBeVisible();
  await expect(page.getByLabel("Usuário", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
});

test("falha de /me durante uso preserva espaço e rascunho até recuperar", async ({
  page,
}) => {
  let unavailable = false;
  const refresh = await sessionPage(page, (route) =>
    unavailable
      ? route.fulfill({ status: 503 })
      : route.fulfill({ json: signedIn }),
  );
  const draft = page.getByLabel("Mensagem em geral");
  await draft.fill("rascunho sintético preservado");
  unavailable = true;
  refresh();
  await expect(page.locator(".session-notice")).toBeVisible();
  await expect(draft).toHaveValue("rascunho sintético preservado");
  unavailable = false;
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(page.locator(".session-notice")).toHaveCount(0);
  await expect(draft).toHaveValue("rascunho sintético preservado");
});

test("401 durante leitura encerra espaço e recursos montados", async ({
  page,
}) => {
  let expired = false;
  const refresh = await sessionPage(page, (route) =>
    expired
      ? route.fulfill({ status: 401 })
      : route.fulfill({ json: signedIn }),
  );
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  expired = true;
  refresh();
  await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mensagem em geral")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Sala de voz", exact: true }),
  ).toHaveCount(0);
});

test("GET /me 429 respeita Retry-After antes da recuperação", async ({
  page,
}) => {
  let calls = 0;
  await sessionPage(page, (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({ status: 429, headers: { "Retry-After": "2" } })
      : route.fulfill({ json: signedIn });
  });
  await expect(page.getByRole("button", { name: /Aguarde/ })).toBeDisabled();
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(page.getByLabel("Mensagem em geral")).toBeVisible();
  expect(calls).toBe(2);
});

for (const status of [403, 428]) {
  test(`${status} mantém conta e 428 oferece confirmação sem reenviar`, async ({
    page,
  }) => {
    let calls = 0;
    await sessionPage(page, (route) => route.fulfill({ json: signedIn }));
    await page.route("**/api/messages", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: [] });
      calls++;
      return route.fulfill({ status });
    });
    const draft = page.getByLabel("Mensagem em geral");
    await draft.fill("ação sintética");
    await draft.press("Enter");
    if (status === 428) {
      const dialog = page.getByRole("dialog", {
        name: "Confirmar identidade",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await page.route("**/api/security/reauth", (route) =>
        route.fulfill({ status: 204 }),
      );
      await dialog
        .getByLabel("Senha para confirmar identidade")
        .fill("synthetic-password");
      await dialog
        .getByRole("button", { name: "Confirmar identidade", exact: true })
        .click();
      await expect(dialog.getByRole("status")).toContainText(
        "Identidade confirmada",
      );
      await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    } else {
      await expect(
        page
          .getByText("Você não tem permissão para esta operação.", {
            exact: true,
          })
          .first(),
      ).toBeVisible();
    }
    await expect(draft).toBeVisible();
    await expect(page.getByLabel("Usuário", { exact: true })).toHaveCount(0);
    expect(calls).toBe(1);
  });
}
