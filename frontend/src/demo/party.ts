import type { PartyRoom, PartyState, PartyPlayer } from "../PartyClub";
import { demoGrant } from "./games";
let room: PartyRoom | null = null;
const requests = new Map<string, unknown>();
const total = (cards: number[]) => {
  let n = cards.reduce(
      (a, c) => a + (c % 13 === 0 ? 11 : Math.min((c % 13) + 1, 10)),
      0,
    ),
    aces = cards.filter((c) => c % 13 === 0).length;
  while (n > 21 && aces-- > 0) n -= 10;
  return n;
};
const player = (id: string, name: string, ready: boolean): PartyPlayer => ({
  id,
  name,
  ready,
  departed: false,
  standing: false,
  hand: [],
  total: 0,
  score: 0,
  hits: 0,
  combo: 0,
  bestCombo: 0,
  reward: 0,
});
export function demoParty(
  path: string,
  method: string,
  body:
    | {
        clientId?: string;
        kind?: "blackjack" | "rhythm";
        videoId?: string;
        note?: number;
        lane?: number;
      }
    | undefined,
  query: URLSearchParams,
  user: { id: string; displayName: string },
  inCall: boolean,
): unknown {
  if (path === "/party/music/search") {
    if (!inCall) throw new Error("Entre na voz primeiro.");
    return [
      {
        videoId: "aqz-KE-bpKQ",
        title: `${query.get("q") || "Música"} · trecho simulado`,
        duration: 180,
      },
      {
        videoId: "M7lc1UVf-VE",
        title: "Noite neon · trecho simulado",
        duration: 200,
      },
    ];
  }
  if (method === "GET") {
    if (
      room?.status === "running" &&
      (Date.now() >= room.endsAt ||
        (room.kind === "blackjack" &&
          room.players.every((p) => p.standing || p.departed)))
    ) {
      room.status = "finished";
      room.dealerHidden = false;
      room.dealerTotal = 17;
      for (const p of room.players) {
        if (p.departed) continue;
        const desired =
          room.kind === "blackjack"
            ? p.total > 21
              ? 2
              : p.total === 21 && p.hand.length === 2
                ? 30
                : p.total > 17
                  ? 20
                  : p.total === 17
                    ? 8
                    : 3
            : p.hits >= 3
              ? Math.min(
                  40,
                  3 +
                    Math.round((27 * p.score) / (room.notes.length * 100)) +
                    10,
                )
              : 0;
        p.reward =
          p.id === user.id
            ? demoGrant(
                desired,
                room.kind === "blackjack"
                  ? "Blackjack · rodada"
                  : "Ritmo · apresentação",
              )
            : desired;
      }
    }
    return {
      serverNow: Date.now(),
      room: room
        ? {
            ...room,
            dealer: room.dealerHidden ? room.dealer.slice(0, 1) : room.dealer,
          }
        : null,
      rooms:
        room?.status === "waiting"
          ? [
              {
                id: room.id,
                kind: room.kind,
                host: user.displayName,
                players: room.players.filter((p) => !p.departed).length,
              },
            ]
          : [],
    } satisfies PartyState;
  }
  if (path === "/party") {
    const key = `create:${body?.clientId}`;
    if (requests.has(key)) return requests.get(key);
    room = {
      id: crypto.randomUUID(),
      hostId: user.id,
      kind: body?.kind ?? "blackjack",
      status: "waiting",
      startsAt: 0,
      endsAt: 0,
      players: [
        player(user.id, user.displayName, body?.kind === "blackjack"),
        player("party-bia", "Bia (simulada)", true),
      ],
      dealer: [],
      dealerHidden: false,
      dealerTotal: 0,
      title: "Música selecionada · demonstração",
      videoId: body?.videoId ?? "",
      notes: [],
      judged: [],
    };
    const r = { id: room.id };
    requests.set(key, r);
    return r;
  }
  if (!room) return {};
  const action = path.split("/").at(-1),
    key = `${action}:${body?.clientId}`;
  if (action !== "presence" && body?.clientId && requests.has(key))
    return requests.get(key);
  if (action === "ready") {
    if (room.kind === "rhythm" && !inCall)
      throw new Error("Entre na voz primeiro.");
    room.players[0].ready = !room.players[0].ready;
  }
  if (action === "start") {
    if (room.players.some((p) => !p.ready))
      throw new Error("Todos precisam estar prontos.");
    room.status = "running";
    room.startsAt = Date.now() + (room.kind === "rhythm" ? 3000 : 0);
    room.endsAt = room.startsAt + (room.kind === "rhythm" ? 16000 : 45000);
    if (room.kind === "blackjack") {
      room.dealer = [9, 32];
      room.dealerHidden = true;
      room.players[0].hand = [4, 21];
      room.players[0].total = 14;
      room.players[1].hand = [8, 20];
      room.players[1].total = 17;
      room.players[1].standing = true;
    } else
      room.notes = Array.from({ length: 24 }, (_, i) => ({
        at: 2000 + i * 500,
        lane: i % 4,
      }));
  }
  if (
    action === "hit" &&
    room.status === "running" &&
    !room.players[0].standing
  ) {
    room.players[0].hand.push(2);
    room.players[0].total = total(room.players[0].hand);
    room.players[0].standing = room.players[0].total >= 21;
  }
  if (action === "stand") room.players[0].standing = true;
  if (action === "note") {
    const index = body?.note ?? -1,
      lane = body?.lane ?? -1,
      n = room.notes[index];
    if (!n) throw new Error("Nota inválida.");
    const existing = room.judged!.find((h) => h.note === index);
    if (existing) return { points: existing.points };
    const delta = Math.abs(Date.now() - (room.startsAt + n.at + 150));
    const points =
      lane === n.lane && delta <= 240
        ? delta <= 80
          ? 100
          : delta <= 160
            ? 70
            : 40
        : 0;
    room.judged!.push({ note: index, points });
    room.players[0].score += points;
    if (points) room.players[0].hits++;
    room.players[0].combo = points ? room.players[0].combo + 1 : 0;
    return { points };
  }
  if (action === "leave") room = null;
  if (body?.clientId) requests.set(key, {});
  return {};
}
