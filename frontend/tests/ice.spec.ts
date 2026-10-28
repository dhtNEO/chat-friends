import { test, expect } from "@playwright/test";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createSocket } from "node:dgram";
import { Socket } from "node:net";

declare global {
  interface Window {
    iceTestPeers: RTCPeerConnection[];
  }
}

function attribute(type: number, value: Buffer) {
  const result = Buffer.alloc(4 + Math.ceil(value.length / 4) * 4);
  result.writeUInt16BE(type);
  result.writeUInt16BE(value.length, 2);
  value.copy(result, 4);
  return result;
}

// RFC 5389 short-term authentication; never log SDP, ICE passwords or packets.
function bindingRequest(
  username: string,
  password: string,
  controlling: boolean,
) {
  const priority = Buffer.alloc(4);
  priority.writeUInt32BE(1845501695);
  const body = Buffer.concat([
    attribute(6, Buffer.from(username)),
    attribute(0x24, priority),
    attribute(controlling ? 0x802a : 0x8029, randomBytes(8)),
  ]);
  const header = Buffer.alloc(20);
  header.writeUInt16BE(1);
  header.writeUInt16BE(body.length + 24, 2);
  header.writeUInt32BE(0x2112a442, 4);
  randomBytes(12).copy(header, 8);
  const unsigned = Buffer.concat([header, body]);
  const digest = createHmac("sha1", password).update(unsigned).digest();
  return Buffer.concat([unsigned, attribute(8, digest)]);
}

function validResponse(response: Buffer, request: Buffer, password: string) {
  if (
    response.length < 20 ||
    response.readUInt16BE(0) !== 0x101 ||
    response.readUInt32BE(4) !== 0x2112a442 ||
    !response.subarray(8, 20).equals(request.subarray(8, 20))
  )
    return false;
  const end = 20 + response.readUInt16BE(2);
  if (response.length !== end) return false;
  for (let offset = 20; offset + 4 <= end; ) {
    const type = response.readUInt16BE(offset);
    const length = response.readUInt16BE(offset + 2);
    if (offset + 4 + length > end) return false;
    if (type === 8) {
      if (length !== 20) return false;
      const signed = Buffer.from(response.subarray(0, offset));
      signed.writeUInt16BE(offset + 4, 2);
      const digest = createHmac("sha1", password).update(signed).digest();
      return timingSafeEqual(
        digest,
        response.subarray(offset + 4, offset + 24),
      );
    }
    offset += 4 + Math.ceil(length / 4) * 4;
  }
  return false;
}

async function probe(
  protocol: "udp" | "tcp",
  packet: Buffer,
  password: string,
  host: string,
) {
  return new Promise<string>((resolve) => {
    const udp = protocol === "udp" ? createSocket("udp4") : undefined;
    const tcp = protocol === "tcp" ? new Socket() : undefined;
    let finished = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(retry);
      udp?.close();
      tcp?.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish("timeout ICE"), 6000);
    const receive = (response: Buffer) => {
      // Ignore server checks and unrelated transactions on this same socket.
      if (validResponse(response, packet, password)) finish("STUN autenticado");
    };
    if (udp) {
      udp.on("error", () => finish("erro de socket UDP"));
      udp.on("message", receive);
      // STUN over UDP retransmits the same transaction from the same socket
      // (RFC 5389 §7.2.1). A lost datagram must not invalidate a working port.
      let delay = 500;
      const send = () => {
        if (finished) return;
        udp.send(packet, 7882, host);
        retry = setTimeout(send, delay);
        delay = Math.min(delay * 2, 2000);
      };
      send();
    }
    if (tcp) {
      let pending = Buffer.alloc(0);
      tcp.on("error", () => finish("erro de socket TCP"));
      tcp.on("end", () => finish("TCP encerrado sem resposta ICE"));
      tcp.on("data", (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        while (!finished && pending.length >= 2) {
          const size = pending.readUInt16BE(0);
          if (pending.length < size + 2) break;
          receive(pending.subarray(2, size + 2));
          pending = pending.subarray(size + 2);
        }
      });
      tcp.connect(7881, host, () => {
        const size = Buffer.alloc(2);
        size.writeUInt16BE(packet.length);
        tcp.write(Buffer.concat([size, packet]));
      });
    }
  });
}

test("portas Docker de mídia respondem ao ICE autenticado por UDP e TCP", async ({
  page,
  baseURL,
}) => {
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!password) throw new Error("TEST_ADMIN_PASSWORD obrigatório");
  const csrf = (await (await page.request.get("/api/csrf")).json()).token;
  expect(
    (
      await page.request.post("/api/login", {
        form: {
          username: process.env.TEST_ADMIN_USERNAME || "admin",
          password,
        },
        headers: { "X-CSRF-TOKEN": csrf },
      })
    ).status(),
  ).toBe(204);
  await page.addInitScript(() => {
    window.iceTestPeers = [];
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        window.iceTestPeers.push(this);
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar na voz" }).click();
  try {
    await expect(page.getByText("Voz conectada", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.waitForFunction(
      () =>
        window.iceTestPeers.some(
          (peer) =>
            peer.connectionState === "connected" &&
            peer.localDescription?.sdp &&
            peer.remoteDescription?.sdp,
        ),
      undefined,
      { timeout: 10000 },
    );
    const credentials = await page.evaluate(() => {
      const peer = window.iceTestPeers.find(
        (p) =>
          p.connectionState === "connected" &&
          p.localDescription?.sdp &&
          p.remoteDescription?.sdp,
      )!;
      const local = peer.localDescription!;
      const remote = peer.remoteDescription!.sdp;
      const field = (sdp: string, name: string) => {
        const match = sdp.match(new RegExp(`a=${name}:([^\\r\\n]+)`));
        if (!match) throw new Error("Credencial ICE ausente na negociação");
        return match[1];
      };
      return {
        username: `${field(remote, "ice-ufrag")}:${field(local.sdp, "ice-ufrag")}`,
        password: field(remote, "ice-pwd"),
        controlling: local.type === "offer" || remote.includes("a=ice-lite"),
      };
    });
    const packet = bindingRequest(
      credentials.username,
      credentials.password,
      credentials.controlling,
    );
    const host = process.env.TEST_MEDIA_HOST || new URL(baseURL!).hostname;
    const results = await Promise.all(
      (["udp", "tcp"] as const).map(async (protocol) => ({
        protocol,
        result: await probe(protocol, packet, credentials.password, host),
      })),
    );
    for (const { protocol, result } of results)
      expect(result, `ICE ${protocol}: ${result}`).toBe("STUN autenticado");
  } finally {
    // Safe CI diagnostics: states only, without addresses, tokens or SDP.
    console.log(
      "ICE transport states",
      await page.evaluate(() =>
        window.iceTestPeers.map((p) => ({
          connection: p.connectionState,
          ice: p.iceConnectionState,
          gathering: p.iceGatheringState,
          signaling: p.signalingState,
        })),
      ),
    );
  }
});
