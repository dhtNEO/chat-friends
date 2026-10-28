// Answers /api and /ws inside the page, mimicking docs/API.md closely enough
// for the interface: same paths, status codes and payloads.
import type { Message } from "../api";
import { setAvatarResolver } from "../ui";
import {
  addMessage,
  avatars,
  profileListeners,
  chatListeners,
  identityOf,
  myIdentity,
  onWorldChange,
  setLease,
  world,
} from "./world";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const empty = () => new Response(null, { status: 204 });
const fail = (status: number, error: string) => json({ error }, status);
type DemoSong = {
  id: string;
  videoId: string;
  title: string;
  duration: number;
  url: string;
  requestedBy: string;
};
const music = {
  status: "idle",
  current: null as DemoSong | null,
  queue: [] as DemoSong[],
  error: null,
  elapsed: 0,
};

function page(query: URLSearchParams) {
  const before = Number(query.get("before")),
    after = Number(query.get("after")),
    all = world.messages;
  if (after) return all.filter((m) => m.id > after).slice(0, 100);
  const older = before ? all.filter((m) => m.id < before) : all;
  return older.slice(-50);
}

async function handle(url: URL, init: RequestInit = {}): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, ""),
    method = (init.method ?? "GET").toUpperCase();
  const body =
    typeof init.body === "string" && init.body.startsWith("{")
      ? JSON.parse(init.body)
      : init.body;
  const route = `${method} ${path}`;
  if (route === "GET /csrf")
    return json({ token: "demo", headerName: "X-CSRF-TOKEN" });
  if (route === "POST /login") {
    const name = (body as URLSearchParams).get("username") || "voce";
    world.me = {
      id: "me",
      username: name,
      displayName: name,
      admin: true,
      enabled: true,
      primaryColor: null,
      secondaryColor: null,
      avatarVersion: null,
    };
    return empty();
  }
  if (!world.me) return fail(401, "Sessão encerrada.");
  const me = world.me;
  if (path.startsWith("/music/")) {
    if (route === "GET /music/state") return json(music);
    if (!world.inCall) return fail(409, "Entre na voz primeiro");
    if (route === "GET /music/search") {
      const query = url.searchParams.get("q") || "Música";
      const videoId = /(?:v=|youtu\.be\/)([\w-]{11})/.exec(query)?.[1];
      return json(
        (videoId
          ? [videoId]
          : ["aqz-KE-bpKQ", "M7lc1UVf-VE", "jNQXAC9IVRw"]
        ).map((id, index) => ({
          videoId: id,
          title: videoId
            ? "Big Buck Bunny · demo"
            : `${query} · resultado ${index + 1}`,
          duration: 180 + index * 30,
          url: `https://www.youtube.com/watch?v=${id}`,
          requestedBy: "",
        })),
      );
    }
    if (route === "POST /music/queue") {
      const videoId = (body as { videoId: string }).videoId;
      const item = {
        id: crypto.randomUUID(),
        videoId,
        title: `Música de demonstração · ${videoId}`,
        duration: 180,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        requestedBy: me.displayName,
      };
      if (!music.current) {
        music.current = item;
        music.status = "playing";
      } else music.queue.push(item);
      return json(music);
    }
    if (route === "POST /music/control") {
      const action = (body as { action: string }).action;
      if (action === "pause") music.status = "paused";
      if (action === "resume") music.status = "playing";
      if (action === "skip") {
        music.current = music.queue.shift() || null;
        music.status = music.current ? "playing" : "idle";
      }
      if (action === "stop") {
        music.current = null;
        music.queue = [];
        music.status = "idle";
      }
      return json(music);
    }
    if (method === "DELETE" && path.startsWith("/music/queue/")) {
      music.queue = music.queue.filter(
        (item) => item.id !== path.split("/").pop(),
      );
      return json(music);
    }
  }
  switch (route) {
    case "GET /me":
      return json({
        user: me,
        spaceName: "Entre amigos",
        security: {
          mfaEnabled: false,
          mfaPending: false,
          enrollmentRequired: false,
        },
      });
    case "GET /security/sessions":
      return json([
        {
          id: "demo",
          current: true,
          lastAccessAt: Date.now(),
          expiresAt: Date.now() + 7200000,
        },
      ]);
    case "POST /security/reauth":
    case "POST /security/mfa/setup":
      return fail(
        400,
        "Segurança de conta disponível somente na aplicação conectada.",
      );
    case "DELETE /security/sessions/demo":
      world.me = null;
      return empty();
    case "POST /logout":
      world.me = null;
      return empty();
    case "POST /password":
      world.me = null;
      return empty();
    case "GET /messages":
      return json(page(url.searchParams));
    case "POST /messages": {
      const { clientId, body: text } = body as {
        clientId: string;
        body: string;
      };
      const existing = world.messages.find(
        (m) => m.authorId === me.id && m.clientId === clientId,
      );
      if (existing) return json(existing);
      const message = addMessage(me, text);
      message.clientId = clientId;
      if (/\?$/.test(text))
        setTimeout(() => {
          const friend = world.friends[0];
          const reply = addMessage(friend, "boa pergunta kkk");
          chatListeners.forEach((listener) => listener(reply));
        }, 2500);
      return json(message);
    }
    case "GET /members":
      return json(
        [me, ...world.accounts].map(
          ({ id, username, displayName, avatarVersion }) => ({
            id,
            username,
            displayName,
            avatarVersion,
          }),
        ),
      );
    case "PATCH /profile": {
      const change = body as Partial<
        Record<
          "username" | "displayName" | "primaryColor" | "secondaryColor",
          string
        >
      >;
      if (change.displayName !== undefined) me.displayName = change.displayName;
      if (change.primaryColor !== undefined)
        me.primaryColor = change.primaryColor || null;
      if (change.secondaryColor !== undefined)
        me.secondaryColor = change.secondaryColor || null;
      const signedOut =
        change.username !== undefined && change.username !== me.username;
      if (signedOut) {
        if (world.accounts.some((a) => a.username === change.username))
          return fail(409, "Esse usuário já existe");
        me.username = change.username!;
        world.me = null;
      }
      profileListeners.forEach((listener) => listener());
      return json({ user: me, signedOut });
    }
    case "POST /profile/avatar": {
      const blob = init.body as Blob;
      if (blob.size > 16000) return fail(400, "Imagem maior que 16 KB");
      avatars.set(
        me.id,
        await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        }),
      );
      me.avatarVersion = Date.now();
      profileListeners.forEach((listener) => listener());
      return json({ user: me });
    }
    case "DELETE /profile/avatar":
      avatars.delete(me.id);
      me.avatarVersion = null;
      profileListeners.forEach((listener) => listener());
      return empty();
    case "GET /admin/accounts":
      return json([me, ...world.accounts]);
    case "POST /admin/accounts": {
      const { username, displayName } = body as Record<string, string>;
      world.accounts.push({
        id: username,
        username,
        displayName,
        admin: false,
        enabled: true,
        primaryColor: null,
        secondaryColor: null,
        avatarVersion: null,
      });
      return empty();
    }
    case "POST /media/join":
      return json({
        identity: myIdentity,
        token: "demo",
        url: "wss://demo.invalid",
        screen: { bitrate: 8_000_000, height: 1080, fps: 60 },
      });
    case "POST /media/heartbeat":
    case "POST /media/screen/heartbeat":
      return empty();
    case "PUT /media/audio":
      world.myDeaf = Boolean((body as { deaf: boolean }).deaf);
      return empty();
    case "POST /media/leave":
      world.inCall = false;
      if (world.lease === myIdentity) setLease(null);
      return empty();
    case "GET /media/state":
      return json({
        lease: {
          identity: world.lease,
          leaseId: world.lease ? "demo-lease" : null,
          expiresAt: null,
        },
        participants: [
          ...world.friends
            .filter((f) => f.inCall)
            .map((f) => ({
              identity: identityOf(f.id),
              name: f.name,
              micMuted: f.micMuted,
              deaf: f.deaf,
            })),
          ...(world.inCall
            ? [
                {
                  identity: myIdentity,
                  name: me.displayName,
                  micMuted: false,
                  deaf: world.myDeaf,
                },
              ]
            : []),
        ],
      });
    case "POST /media/screen":
      if (world.lease && world.lease !== myIdentity)
        return fail(409, "Outra pessoa está transmitindo agora.");
      setLease(myIdentity);
      return json({
        identity: myIdentity,
        leaseId: "demo-lease",
        expiresAt: null,
      });
    case "DELETE /media/screen":
    case "POST /media/screen/force-stop":
      setLease(null);
      return empty();
  }
  if (method === "PATCH" && path.startsWith("/admin/accounts/")) {
    const account = world.accounts.find(
      (a) => a.username === path.split("/").pop(),
    );
    const { enabled } = body as { enabled?: boolean };
    if (account && enabled !== undefined) account.enabled = enabled;
    return empty();
  }
  console.warn("[demo] rota não simulada:", route);
  return fail(404, "Rota não simulada no modo demo.");
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
    return realFetch(input, init);
  // A short delay keeps loading states visible, as on a real network.
  await new Promise((resolve) => setTimeout(resolve, 80));
  return handle(url, init);
};

// Chat and presence events, in place of the server's /ws.
class DemoSocket extends EventTarget {
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  private stops: (() => void)[] = [];
  constructor() {
    super();
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
      this.presence();
      const profile = () => this.emit({ type: "profile" });
      profileListeners.add(profile);
      this.stops.push(() => profileListeners.delete(profile));
      const chat = (message: Message) =>
        this.emit({ type: "message", message });
      chatListeners.add(chat);
      this.stops.push(
        () => chatListeners.delete(chat),
        onWorldChange(() => this.presence()),
      );
    }, 150);
  }
  private emit(event: unknown) {
    if (this.readyState === 1)
      this.onmessage?.(
        new MessageEvent("message", { data: JSON.stringify(event) }),
      );
  }
  private presence() {
    this.emit({
      type: "presence",
      users: [world.me?.username ?? "voce", ...world.friends.map((f) => f.id)],
    });
  }
  send(data: string) {
    if (data === "ping") setTimeout(() => this.emit({ type: "pong" }), 30);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.stops.forEach((stop) => stop());
    this.onclose?.(new CloseEvent("close"));
  }
}
window.WebSocket = DemoSocket as unknown as typeof WebSocket;

setAvatarResolver((m) => avatars.get(m.id) ?? "");

const badge = document.createElement("div");
badge.className = "demo-badge";
badge.textContent = "MODO DEMO · nada sai deste navegador";
document.body.append(badge);
