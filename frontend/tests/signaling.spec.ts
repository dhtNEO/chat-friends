import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { SignalResponse } from "@livekit/protocol";

test("proxy retira permissão de tela de JWT elevado e rejeita conexão expirada", async ({
  request,
}) => {
  const password = process.env.TEST_ADMIN_PASSWORD;
  const secret = process.env.TEST_LIVEKIT_SECRET;
  if (!password || !secret)
    throw new Error(
      "TEST_ADMIN_PASSWORD e TEST_LIVEKIT_SECRET obrigatórios para teste de admissão",
    );
  let csrf = (await (await request.get("/api/csrf")).json()).token;
  expect(
    (
      await request.post("/api/login", {
        form: {
          username: process.env.TEST_ADMIN_USERNAME || "admin",
          password,
        },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(204);
  csrf = (await (await request.get("/api/csrf")).json()).token;
  const headers = { "X-CSRF-TOKEN": csrf };
  const join = await request.post("/api/media/join", { data: {}, headers });
  expect(join.status()).toBe(200);
  const connection = await join.json();
  const [jwtHeader, jwtBody] = connection.token.split(".");
  const claims = JSON.parse(Buffer.from(jwtBody, "base64url").toString());
  claims.video.canPublishSources = [
    "microphone",
    "screen_share",
    "screen_share_audio",
  ];
  const unsigned =
    jwtHeader + "." + Buffer.from(JSON.stringify(claims)).toString("base64url");
  const elevated =
    unsigned +
    "." +
    createHmac("sha256", secret).update(unsigned).digest("base64url");
  const url = new URL(connection.url);
  url.pathname = "/rtc";
  url.search = new URLSearchParams({
    access_token: elevated,
    protocol: "15",
    sdk: "js",
    version: "2.23.0",
    auto_subscribe: "1",
  }).toString();
  const permission = await new Promise<number[]>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Sem resposta de sinalização em 10 s"));
    }, 10000);
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Sinalização recusada"));
    };
    ws.onmessage = (event) => {
      const message = SignalResponse.fromBinary(
        new Uint8Array(event.data as ArrayBuffer),
      );
      if (message.message.case === "join") {
        clearTimeout(timer);
        resolve(
          message.message.value.participant?.permission?.canPublishSources ??
            [],
        );
        ws.close();
      }
    };
  });
  expect(permission).toEqual([2]); // MICROPHONE; nunca SCREEN_SHARE (3).
  await request.post("/api/media/leave", {
    data: { identity: connection.identity },
    headers,
  });
  const denied = await request.get("/api/livekit/admit", {
    headers: { Authorization: "Bearer " + elevated },
  });
  expect(denied.status()).toBe(401);
});
