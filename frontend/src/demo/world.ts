// Simulated space for `npm run demo`: friends, chat and a transmission, all
// in this browser tab. Nothing here is bundled into the production build.
import type { Message, User } from "../api";

export type Friend = {
  id: string;
  name: string;
  inCall: boolean;
  micMuted: boolean;
  deaf: boolean;
};
type Listener = () => void;

const now = Date.now(),
  minute = 60_000;
export const world = {
  me: null as User | null,
  myDeaf: false,
  inCall: false,
  // Identities holding independent screen reservations.
  leases: [] as string[],
  friends: [
    {
      id: "galecalol",
      name: "galecalol",
      inCall: true,
      micMuted: false,
      deaf: false,
    },
    {
      id: "penumbra",
      name: "penumbra",
      inCall: true,
      micMuted: true,
      deaf: false,
    },
    {
      id: "vgeralt",
      name: "vgeralt",
      inCall: true,
      micMuted: false,
      deaf: false,
    },
    { id: "luna", name: "luna", inCall: false, micMuted: false, deaf: false },
  ] as Friend[],
  accounts: [] as User[],
  messages: [] as Message[],
};
export const identityOf = (id: string) => `${id}:demo`;
export const myIdentity = "me:demo";
world.leases = [identityOf("galecalol"), identityOf("penumbra")];
world.accounts = world.friends.map((f) => ({
  id: f.id,
  username: f.id,
  displayName: f.name,
  admin: false,
  enabled: true,
  primaryColor: null,
  secondaryColor: null,
  avatarVersion: null,
}));
// Photos stay in memory as data: URLs; the dev server has no CSP.
export const avatars = new Map<string, string>();
export const profileListeners = new Set<() => void>();

let nextId = 1;
export function addMessage(
  author: Friend | User,
  body: string,
  at = Date.now(),
) {
  const isUser = "username" in author;
  const message: Message = {
    id: nextId++,
    clientId: crypto.randomUUID(),
    authorId: author.id,
    author: isUser ? author.displayName : author.name,
    body,
    createdAt: new Date(at).toISOString(),
  };
  world.messages.push(message);
  return message;
}
const [gale, pen, vg, luna] = world.friends;
for (const [who, body, ago] of [
  [luna, "alguém online hoje à noite?", 26 * 60],
  [vg, "eu! depois das 21h", 25 * 60],
  [pen, "bora jogar um valorant amanhã", 24 * 60],
  [gale, "ta insano esse jogo", 14],
  [vg, "kkk", 13],
  [vg, "tô vendo aqui", 13],
  [luna, "galecalol joga muito", 9],
  [pen, "vamo jogar depois?", 6],
  [gale, "depois a gente vai pro valorant?", 3],
  [vg, "bora", 2],
] as [Friend, string, number][])
  addMessage(who, body, now - ago * minute);

const listeners = new Set<Listener>();
export function onWorldChange(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function changed() {
  listeners.forEach((listener) => listener());
}

// Friends chat now and then, and vgeralt keeps leaving and coming back,
// so join/leave sounds and presence can be tried without anyone else.
const lines = [
  "kkkkk",
  "olha isso",
  "gg",
  "alguém viu meu fone?",
  "manda o link ai",
  "já to entrando",
  "essa foi boa",
  "pausa pra água",
];
export const chatListeners = new Set<(m: Message) => void>();
setInterval(() => {
  const friend =
    world.friends[Math.floor(Math.random() * world.friends.length)];
  const message = addMessage(
    friend,
    lines[Math.floor(Math.random() * lines.length)],
  );
  chatListeners.forEach((listener) => listener(message));
}, 25_000);
setInterval(() => {
  vg.inCall = !vg.inCall;
  changed();
}, 40_000);

// The transmission comes back a while after an admin stops it.
let resume: ReturnType<typeof setTimeout> | undefined;
export function setLease(identity: string, active = true) {
  world.leases = world.leases.filter((id) => id !== identity);
  if (active) world.leases.push(identity);
  clearTimeout(resume);
  if (!world.leases.length)
    resume = setTimeout(() => {
      if (!world.leases.length) setLease(identityOf("galecalol"));
    }, 45_000);
  changed();
}

// A fake game feed for the friend who is transmitting.
let feed: MediaStream | undefined;
export function gameFeed() {
  if (feed) return feed;
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const g = canvas.getContext("2d")!;
  const start = performance.now();
  const draw = () => {
    const t = (performance.now() - start) / 1000;
    const sky = g.createLinearGradient(0, 0, 0, 720);
    sky.addColorStop(0, "#14301f");
    sky.addColorStop(1, "#0b1a12");
    g.fillStyle = sky;
    g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 14; i++) {
      const x = ((i * 97 + t * (20 + i * 3)) % 1380) - 50,
        y = 120 + ((i * 53) % 480) + Math.sin(t * 2 + i) * 18;
      g.fillStyle = i % 3 ? "rgba(167,139,250,0.85)" : "rgba(239,68,68,0.85)";
      g.beginPath();
      g.arc(x, y, 10 + (i % 4) * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(255,255,255,0.15)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(640, 360, 120 + Math.sin(t * 3) * 10, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(470, 16, 340, 56);
    g.fillStyle = "#fff";
    g.font = "bold 28px sans-serif";
    g.textAlign = "center";
    const s = Math.floor(t);
    g.fillText(
      `MODO DEMO  ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
      640,
      54,
    );
    requestAnimationFrame(draw);
  };
  draw();
  feed = canvas.captureStream(30);
  return feed;
}
