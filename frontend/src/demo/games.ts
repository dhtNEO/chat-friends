import type { ClubState, GameRoom } from "../GamesClub";
import { RED } from "../rouletteRules";
let balance = 120,
  spins = 10,
  granted = 0;
let room: GameRoom | null = null;
const history: ClubState["history"] = [],
  requests = new Map<string, unknown>();
const add = (amount: number, reason: string) => {
  balance += amount;
  history.unshift({
    id: history.length + 1,
    amount,
    reason: `${reason} · demonstração`,
    createdAt: Date.now(),
  });
};
function won(choice: string, n: number) {
  if (choice.startsWith("n:")) return Number(choice.slice(2)) === n;
  if (n === 0) return false;
  return (
    {
      red: RED.has(n),
      black: !RED.has(n),
      even: n % 2 === 0,
      odd: n % 2 === 1,
      low: n <= 18,
      high: n >= 19,
      dozen1: n <= 12,
      dozen2: n >= 13 && n <= 24,
      dozen3: n >= 25,
    } as Record<string, boolean>
  )[choice];
}
function clearBets() {
  if (room)
    room.players.forEach((p, i) => {
      p.choice = i ? "black" : null;
      p.amount = i ? 10 : null;
      p.payout = null;
      p.refunded = false;
    });
}
export function demoEntry(amount: number, reason: string) {
  if (balance + amount < 0)
    throw new Error("Você precisa de 10 Coins para entrar nesta rodada.");
  add(amount, reason);
}
export function demoGrant(amount: number, reason: string) {
  const reward = Math.max(0, Math.min(amount, 500 - granted));
  granted += reward;
  add(reward, reason);
  return reward;
}
export function demoGames(
  path: string,
  method: string,
  body:
    | {
        clientId?: string;
        solo?: boolean;
        roundId?: string;
        choice?: string;
        amount?: number;
      }
    | undefined,
  user: { id: string; displayName: string },
): unknown {
  if (method === "GET") {
    if (room?.status === "running" && Date.now() >= room.endsAt) {
      room.status = "finished";
      for (const p of room.players) {
        if (p.amount && p.choice && !p.refunded) {
          p.payout = won(p.choice, room.number!)
            ? p.amount *
              (p.choice.startsWith("n:")
                ? 36
                : p.choice.startsWith("dozen")
                  ? 3
                  : 2)
            : 0;
          if (p.id === user.id && p.payout)
            add(p.payout, "Roleta · prêmio (inclui aposta)");
        }
      }
      room.recent.unshift({ number: room.number! });
    }
    return {
      serverNow: Date.now(),
      balance,
      earnedToday: granted,
      spinsLeft: spins,
      history,
      leaderboard: [
        { name: user.displayName, coins: balance - 120 },
        { name: "Bia", coins: 84 },
      ],
      rooms:
        room?.status === "waiting" && !room.solo
          ? [
              {
                id: room.id,
                host: user.displayName,
                players: room.players.length,
              },
            ]
          : [],
      room,
    } satisfies ClubState;
  }
  if (path === "/games/spin") {
    const key = `spin:${body?.clientId}`;
    if (requests.has(key)) return requests.get(key);
    if (!spins) throw new Error("Os giros grátis da demo acabaram.");
    spins--;
    const symbols = Array.from({ length: 3 }, () =>
      Math.floor(Math.random() * 4),
    ).join("");
    const reward = Math.min(
      500 - granted,
      new Set(symbols).size === 1 ? 30 : new Set(symbols).size === 2 ? 8 : 2,
    );
    granted += reward;
    add(reward, "Giro da Sorte");
    const result = { symbols, reward };
    requests.set(key, result);
    return result;
  }
  if (path === "/games/rooms") {
    const key = `room:${body?.clientId}`;
    if (requests.has(key)) return requests.get(key);
    room = {
      id: crypto.randomUUID(),
      hostId: user.id,
      solo: body?.solo ?? false,
      status: "waiting",
      startsAt: 0,
      endsAt: 0,
      roundId: crypto.randomUUID(),
      number: null,
      recent: [],
      players: [
        {
          id: user.id,
          name: user.displayName,
          departed: false,
          choice: null,
          amount: null,
          payout: null,
          refunded: false,
        },
      ],
    };
    if (!body?.solo)
      room.players.push({
        id: "demo-friend",
        name: "Bia (simulada)",
        departed: false,
        choice: "black",
        amount: 10,
        payout: null,
        refunded: false,
      });
    const result = { id: room.id };
    requests.set(key, result);
    return result;
  }
  const action = path.split("/").at(-1);
  if (action === "bet" && room) {
    const key = `bet:${body?.clientId}`;
    if (requests.has(key)) return {};
    if (room.status !== "waiting" || room.roundId !== body?.roundId)
      throw new Error("Apostas encerradas.");
    if (
      !body.amount ||
      body.amount < 1 ||
      !Number.isSafeInteger(body.amount) ||
      body.amount > balance
    )
      throw new Error("Seu saldo não cobre essa aposta.");
    if (room.players[0].amount) throw new Error("Aposta já confirmada.");
    room.players[0].amount = body.amount;
    room.players[0].choice = body.choice!;
    add(-body.amount, "Roleta · aposta");
    requests.set(key, {});
  }
  if (action === "start" && room) {
    if (!room.players[0].amount)
      throw new Error("Confirme sua aposta antes de girar.");
    if (room.status === "waiting") {
      room.status = "running";
      room.startsAt = Date.now() + 1500;
      room.endsAt = room.startsAt + 18000;
      room.number = Math.floor(Math.random() * 37);
    }
  }
  if (action === "next" && room) {
    const key = `next:${body?.clientId}`;
    if (requests.has(key)) return {};
    room.status = "waiting";
    room.roundId = crypto.randomUUID();
    room.number = null;
    room.startsAt = 0;
    room.endsAt = 0;
    clearBets();
    requests.set(key, {});
  }
  if (action === "leave") {
    if (room?.status === "waiting" && room.players[0].amount)
      add(room.players[0].amount, "Roleta · aposta devolvida");
    room = null;
  }
  return {};
}
