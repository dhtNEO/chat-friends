import type { CalendarEvent, EventDetails } from "../Outlook";
let events: CalendarEvent[] | null = null;
const requests = new Map<string, string>();
type Body = {
  clientId?: string;
  details?: EventDetails;
  version?: number;
  response?: string;
};
export function demoOutlook(
  path: string,
  method: string,
  body: Body | undefined,
  query: URLSearchParams,
  user: { id: string; displayName: string; admin: boolean },
) {
  if (!events) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(20, 0, 0, 0);
    events = [
      {
        id: "outlook-bia",
        creatorId: "bia",
        creator: "Bia",
        title: "Noite do co-op",
        game: "Overcooked! 2",
        location: "Sala de estar",
        description: "Vale rir do caos na cozinha. Quem vem?",
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 7200000).toISOString(),
        version: 1,
        cancelled: false,
        attendees: [{ id: "bia", name: "Bia", response: "going" }],
      },
    ];
  }
  if (method === "GET")
    return structuredClone(
      events.filter(
        (e) =>
          e.startsAt < (query.get("to") ?? "") &&
          e.endsAt > (query.get("from") ?? ""),
      ),
    ).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (path === "/outlook") {
    if (requests.has(body!.clientId!))
      return { id: requests.get(body!.clientId!) };
    const id = crypto.randomUUID();
    events.push({
      ...body!.details!,
      id,
      creatorId: user.id,
      creator: user.displayName,
      version: 1,
      cancelled: false,
      attendees: [{ id: user.id, name: user.displayName, response: "going" }],
    });
    requests.set(body!.clientId!, id);
    return { id };
  }
  const id = path.split("/")[2],
    event = events.find((e) => e.id === id);
  if (!event) throw new Error("Evento não encontrado.");
  if (path.endsWith("/response")) {
    if (event.cancelled || new Date(event.endsAt) <= new Date())
      throw new Error("Este evento foi cancelado ou já terminou.");
    if (!["going", "maybe", "declined"].includes(body!.response!))
      throw new Error("Resposta inválida.");
    event.attendees = event.attendees.filter((p) => p.id !== user.id);
    event.attendees.push({
      id: user.id,
      name: user.displayName,
      response: body!.response!,
    });
    return {};
  }
  if (event.creatorId !== user.id && !user.admin)
    throw new Error(
      "Somente quem criou o evento ou um administrador pode alterá-lo.",
    );
  if (event.version !== body?.version || event.cancelled)
    throw new Error("O evento mudou. Atualize a agenda antes de editar.");
  if (path.endsWith("/cancel")) event.cancelled = true;
  else Object.assign(event, body.details);
  event.version++;
  return {};
}
