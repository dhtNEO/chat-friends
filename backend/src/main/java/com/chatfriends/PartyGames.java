package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PartyGames {
  final Games games;
  final Roulette wallet;
  final JdbcTemplate db;
  final ObjectMapper json;
  final MusicGateway bot;
  final Media media;
  final SecureRandom random = new SecureRandom();

  public PartyGames(Games games, ObjectMapper json, MusicGateway bot, Media media) {
    this.games = games;
    wallet = games.roulette;
    db = games.db;
    this.json = json;
    this.bot = bot;
    this.media = media;
  }

  long now() {
    return System.currentTimeMillis();
  }

  void require(boolean ok, String message) {
    Roulette.require(ok, message);
  }

  String encode(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  <T> T decode(String value, TypeReference<T> type) {
    try {
      return json.readValue(value, type);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  Map<String, Object> row(UUID id) {
    var rows = db.queryForList("select * from party_rooms where id=?", id);
    if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Sala não encontrada.");
    return rows.getFirst();
  }

  Map<String, Object> state(Map<String, Object> row) {
    return decode((String) row.get("state"), new TypeReference<Map<String, Object>>() {});
  }

  List<Integer> hand(String raw) {
    return decode(raw, new TypeReference<List<Integer>>() {});
  }

  void save(UUID id, Map<String, Object> state) {
    db.update("update party_rooms set state=? where id=?", encode(state), id);
  }

  UUID user(String name) {
    return games.accounts.active(name).id();
  }

  void member(UUID id, UUID u) {
    require(
        db.queryForObject(
                "select count(*) from party_players where room_id=? and account_id=? and not"
                    + " departed",
                Integer.class,
                id,
                u)
            == 1,
        "Você não participa desta sala.");
  }

  public UUID create(String name, UUID clientId, String kind, String videoId) {
    UUID u = user(name);
    require(Set.of("blackjack", "rhythm").contains(kind), "Jogo inválido.");
    if (kind.equals("rhythm"))
      require(
          videoId != null && videoId.matches("[A-Za-z0-9_-]{11}"), "Escolha uma música no bot.");
    return games.locked(
        () -> {
          var old =
              db.queryForList(
                  "select id from party_rooms where creator_id=? and client_id=?",
                  UUID.class,
                  u,
                  clientId);
          if (!old.isEmpty()) return old.getFirst();
          wallet.available(u);
          require(
              db.queryForObject(
                      "select count(*) from party_rooms where creator_id=? and created_at>?",
                      Integer.class,
                      u,
                      now() - 60000)
                  < 6,
              "Aguarde um minuto antes de criar outra sala.");
          UUID id = UUID.randomUUID();
          db.update(
              "insert into"
                  + " party_rooms(id,creator_id,host_id,client_id,kind,status,created_at,state)"
                  + " values(?,?,?,?,?,'waiting',?,?)",
              id,
              u,
              u,
              clientId,
              kind,
              now(),
              encode(kind.equals("rhythm") ? Map.of("videoId", videoId) : Map.of()));
          db.update(
              "insert into party_players(room_id,account_id,joined_at,seen_at,ready)"
                  + " values(?,?,?,?,?)",
              id,
              u,
              now(),
              now(),
              false);
          return id;
        });
  }

  public Map<String, Object> overview(String name) {
    UUID u = user(name);
    var out = new LinkedHashMap<String, Object>();
    out.put("serverNow", now());
    out.put(
        "rooms",
        db.queryForList(
            "select r.id,r.kind,a.display_name as host,(select count(*) from party_players p where"
                + " p.room_id=r.id and not p.departed) as players from party_rooms r join accounts"
                + " a on a.id=r.host_id where r.status='waiting' order by r.created_at desc limit"
                + " 16"));
    var current =
        db.queryForList(
            "select r.id from party_rooms r join party_players p on p.room_id=r.id where"
                + " p.account_id=? and not p.departed order by"
                + " r.created_at desc limit 1",
            UUID.class,
            u);
    out.put("room", current.isEmpty() ? null : view(current.getFirst(), u));
    return out;
  }

  Map<String, Object> view(UUID id, UUID u) {
    // Read phase and cards together: reopening a finished room must never reveal new hands.
    return games.locked(() -> roomView(id, u));
  }

  private Map<String, Object> roomView(UUID id, UUID u) {
    var r = row(id);
    var state = state(r);
    var out = new LinkedHashMap<String, Object>();
    out.put("id", id);
    out.put("hostId", r.get("host_id"));
    out.put("roundId", r.get("round_id"));
    out.put("kind", r.get("kind"));
    out.put("status", r.get("status"));
    out.put("startsAt", r.get("starts_at"));
    out.put("endsAt", r.get("ends_at"));
    var players =
        db.queryForList(
            "select p.account_id as id,a.display_name as"
                + " name,p.ready,p.departed,p.standing,p.hand,p.score,p.hits,p.combo,p.best_combo"
                + " as \"bestCombo\",p.reward from party_players p join accounts a on"
                + " a.id=p.account_id where p.room_id=? order by p.joined_at,p.account_id",
            id);
    for (var p : players) {
      var cards = hand((String) p.get("hand"));
      boolean hidden =
          r.get("kind").equals("blackjack")
              && !r.get("status").equals("finished")
              && !u.equals(p.get("id"));
      p.put("cardCount", cards.size());
      p.put("handHidden", hidden);
      p.put("hand", hidden ? List.of() : cards);
      if (hidden) {
        p.put("score", 0);
        p.put("reward", 0);
      }
      p.put("total", hidden ? null : total(cards));
      p.put(
          "outcome",
          r.get("kind").equals("blackjack") && r.get("status").equals("finished")
              ? Boolean.TRUE.equals(p.get("departed"))
                  ? "left"
                  : blackjackOutcome(cards, (List<?>) state.getOrDefault("dealer", List.of()))
              : null);
    }
    out.put("players", players);
    var dealer = (List<?>) state.getOrDefault("dealer", List.of());
    out.put(
        "dealer",
        !r.get("status").equals("finished") && dealer.size() > 1 ? dealer.subList(0, 1) : dealer);
    out.put("dealerHidden", !r.get("status").equals("finished") && dealer.size() > 1);
    out.put("dealerTotal", r.get("status").equals("finished") ? total(dealer) : 0);
    out.put("notes", state.getOrDefault("notes", List.of()));
    out.put("title", state.getOrDefault("title", "Música escolhida"));
    out.put("videoId", state.getOrDefault("videoId", ""));
    if (r.get("kind").equals("rhythm"))
      out.put(
          "judged",
          db.queryForList(
              "select note,points from rhythm_hits where room_id=? and account_id=? order by note",
              id,
              u));
    return out;
  }

  static int total(List<?> cards) {
    int score = 0, aces = 0;
    for (Object card : cards) {
      int rank = ((Number) card).intValue() % 13;
      if (rank == 0) {
        score += 11;
        aces++;
      } else score += Math.min(rank + 1, 10);
    }
    while (score > 21 && aces-- > 0) score -= 10;
    return score;
  }

  static boolean natural(List<?> cards) {
    return cards.size() == 2 && total(cards) == 21;
  }

  static String blackjackOutcome(List<?> cards, List<?> dealer) {
    int score = total(cards), bank = total(dealer);
    if (score > 21) return "bust";
    if (natural(cards) && !natural(dealer)) return "blackjack";
    if (natural(dealer) && !natural(cards)) return "loss";
    if (score == bank) return "tie";
    return bank > 21 || score > bank ? "win" : "loss";
  }

  int draw(Map<String, Object> state) {
    var deck = (List<?>) state.get("deck");
    int cursor = ((Number) state.getOrDefault("cursor", 0)).intValue();
    require(cursor < deck.size(), "Baralho esgotado.");
    state.put("cursor", cursor + 1);
    return ((Number) deck.get(cursor)).intValue();
  }

  void checkStart(Map<String, Object> r, UUID u) {
    UUID id = (UUID) r.get("id");
    member(id, u);
    require(
        u.equals(r.get("host_id")) && r.get("status").equals("waiting"),
        "O anfitrião inicia uma sala em espera.");
    require(
        db.queryForObject(
                "select count(*) from party_players where room_id=? and not departed",
                Integer.class,
                id)
            >= 2,
        "São necessárias pelo menos duas pessoas.");
    require(
        db.queryForObject(
                "select count(*) from party_players p join accounts a on a.id=p.account_id where"
                    + " p.room_id=? and not p.departed and (not p.ready or p.seen_at<? or not"
                    + " a.enabled)",
                Integer.class,
                id,
                now() - 30000)
            == 0,
        "Todos precisam estar presentes e prontos.");
  }

  void refundEntry(UUID id, UUID u) {
    UUID entry =
        db.queryForObject(
            "select entry_id from party_players where room_id=? and account_id=?",
            UUID.class,
            id,
            u);
    if (entry != null) {
      wallet.entry(
          u,
          Roulette.ref("blackjack-refund", entry),
          10,
          "refund",
          "Blackjack · entrada devolvida");
      db.update(
          "update party_players set entry_id=null,ready=false where room_id=? and account_id=?",
          id,
          u);
    }
  }

  public void action(String name, UUID id, UUID clientId, String action, String voice) {
    action(name, id, clientId, action, voice, (UUID) row(id).get("round_id"));
  }

  public void action(
      String name, UUID id, UUID clientId, String action, String voice, UUID roundId) {
    UUID u = user(name);
    games.locked(
        () -> {
          var old =
              db.queryForList(
                  "select action from party_actions where room_id=? and account_id=? and"
                      + " client_id=?",
                  String.class,
                  id,
                  u,
                  clientId);
          if (!old.isEmpty()) {
            require(old.getFirst().equals(action), "Identificador reutilizado.");
            return null;
          }
          var r = row(id);
          String status = (String) r.get("status");
          boolean blackjack = r.get("kind").equals("blackjack");
          if (blackjack && Set.of("ready", "start", "hit", "stand", "next").contains(action))
            require(Objects.equals(roundId, r.get("round_id")), "A rodada mudou. Atualize a sala.");
          if (action.equals("join")) {
            require(status.equals("waiting"), "A partida já começou.");
            if (db.queryForObject(
                    "select count(*) from party_players where room_id=? and account_id=? and not"
                        + " departed",
                    Integer.class,
                    id,
                    u)
                > 0) return null;
            wallet.available(u);
            require(
                db.queryForObject(
                        "select count(*) from party_players where room_id=? and not departed",
                        Integer.class,
                        id)
                    < 8,
                "Sala cheia.");
            db.update(
                "insert into party_players(room_id,account_id,joined_at,seen_at) values(?,?,?,?) on"
                    + " conflict(room_id,account_id) do update set"
                    + " departed=false,ready=false,seen_at=excluded.seen_at",
                id,
                u,
                now(),
                now());
          } else {
            member(id, u);
            db.update(
                "update party_players set seen_at=? where room_id=? and account_id=?",
                now(),
                id,
                u);
            switch (action) {
              case "presence" -> {
                return null;
              }
              case "ready" -> {
                require(status.equals("waiting"), "A partida já começou.");
                if (blackjack) {
                  UUID entry =
                      db.queryForObject(
                          "select entry_id from party_players where room_id=? and account_id=?",
                          UUID.class,
                          id,
                          u);
                  if (entry == null) {
                    require(
                        wallet.balance(u) >= 10,
                        "Você precisa de 10 Coins para entrar nesta rodada.");
                    entry = UUID.randomUUID();
                    wallet.entry(u, entry, -10, "stake", "Blackjack · entrada da rodada");
                    db.update(
                        "update party_players set entry_id=?,ready=true where room_id=? and"
                            + " account_id=?",
                        entry,
                        id,
                        u);
                  }
                  break;
                }
                db.update(
                    "update party_players set ready=not ready,voice_identity=? where room_id=? and"
                        + " account_id=?",
                    voice,
                    id,
                    u);
              }
              case "next" -> {
                require(
                    blackjack && status.equals("finished") && u.equals(r.get("host_id")),
                    "O anfitrião abre a próxima rodada após o resultado.");
                // A finished room does not reserve a seat: omit players who joined another table.
                for (UUID player :
                    db.queryForList(
                        "select account_id from party_players where room_id=? and not departed",
                        UUID.class,
                        id)) {
                  try {
                    wallet.available(player);
                  } catch (ResponseStatusException e) {
                    require(
                        !player.equals(u), "Saia da sua mesa atual antes de abrir outra rodada.");
                    db.update(
                        "update party_players set departed=true where room_id=? and account_id=?",
                        id,
                        player);
                  }
                }
                db.update(
                    "update party_players set"
                        + " ready=false,entry_id=null,standing=false,hand='[]',score=0,reward=0"
                        + " where room_id=?",
                    id);
                db.update(
                    "update party_rooms set"
                        + " status='waiting',round_id=?,state='{}',starts_at=0,ends_at=0,created_at=?"
                        + " where id=?",
                    UUID.randomUUID(),
                    now(),
                    id);
              }
              case "leave" -> {
                if (blackjack && status.equals("waiting")) refundEntry(id, u);
                db.update(
                    "update party_players set departed=true,standing=true where room_id=? and"
                        + " account_id=?",
                    id,
                    u);
                transfer(id);
              }
              case "start" -> {
                require(
                    r.get("kind").equals("blackjack"),
                    "Use a preparação de música para iniciar o ritmo.");
                checkStart(r, u);
                require(
                    db.queryForObject(
                            "select count(*) from party_players where room_id=? and not departed"
                                + " and entry_id is null",
                            Integer.class,
                            id)
                        == 0,
                    "Todos precisam confirmar a entrada de 10 Coins.");
                var s = state(r);
                var deck = new ArrayList<Integer>();
                for (int n = 0; n < 312; n++) deck.add(n % 52);
                Collections.shuffle(deck, random);
                s.put("deck", deck);
                s.put("cursor", 0);
                s.put("dealer", new ArrayList<>(List.of(draw(s), draw(s))));
                for (UUID p :
                    db.queryForList(
                        "select account_id from party_players where room_id=? and not departed"
                            + " order by joined_at,account_id",
                        UUID.class,
                        id)) {
                  var cards = List.of(draw(s), draw(s));
                  db.update(
                      "update party_players set hand=?,standing=? where room_id=? and account_id=?",
                      encode(cards),
                      total(cards) == 21,
                      id,
                      p);
                }
                save(id, s);
                db.update(
                    "update party_rooms set status='running',starts_at=?,ends_at=? where id=?",
                    now(),
                    now() + 45000,
                    id);
              }
              case "hit", "stand" -> {
                require(
                    r.get("kind").equals("blackjack")
                        && status.equals("running")
                        && now() < (Long) r.get("ends_at"),
                    "A rodada está encerrada.");
                var p =
                    db.queryForMap(
                        "select hand,standing from party_players where room_id=? and account_id=?",
                        id,
                        u);
                require(!Boolean.TRUE.equals(p.get("standing")), "Sua mão já está encerrada.");
                var cards = hand((String) p.get("hand"));
                if (action.equals("hit")) {
                  var s = state(r);
                  cards.add(draw(s));
                  save(id, s);
                }
                db.update(
                    "update party_players set hand=?,standing=? where room_id=? and account_id=?",
                    encode(cards),
                    action.equals("stand") || total(cards) >= 21,
                    id,
                    u);
              }
              default -> throw new ResponseStatusException(BAD_REQUEST, "Ação inválida.");
            }
          }
          db.update("insert into party_actions values(?,?,?,?)", id, u, clientId, action);
          return null;
        });
  }

  void transfer(UUID id) {
    var alive =
        db.queryForList(
            "select account_id from party_players where room_id=? and not departed order by"
                + " joined_at,account_id",
            UUID.class,
            id);
    if (alive.isEmpty())
      db.update("update party_rooms set status='cancelled' where id=? and status='waiting'", id);
    else if (db.queryForObject(
            "select count(*) from party_rooms r join party_players p on p.room_id=r.id and"
                + " p.account_id=r.host_id where r.id=? and not p.departed",
            Integer.class,
            id)
        == 0) db.update("update party_rooms set host_id=? where id=?", alive.getFirst(), id);
  }

  public void rhythmStart(String name, UUID id) {
    UUID u = user(name);
    String video =
        games.locked(
            () -> {
              var r = row(id);
              require(r.get("kind").equals("rhythm"), "Esta sala não é de ritmo.");
              checkStart(r, u);
              for (String identity :
                  db.queryForList(
                      "select voice_identity from party_players where room_id=? and not departed",
                      String.class,
                      id))
                require(
                    identity != null && media.validConnection(identity),
                    "Todos precisam continuar na voz.");
              db.update(
                  "update party_rooms set status='preparing',starts_at=? where id=?", now(), id);
              return (String) state(r).get("videoId");
            });
    try {
      var prepared =
          bot.prepareRhythm(
              id.toString(),
              video,
              games.accounts.get(name).displayName(),
              media.live.musicToken());
      var notes = prepared.path("notes");
      long duration = prepared.path("durationMs").asLong();
      require(
          notes.isArray()
              && notes.size() >= 8
              && notes.size() <= 1200
              && duration >= 15000
              && duration <= 300000,
          "A música não gerou um desafio válido.");
      long start = now() + 6000;
      bot.startRhythm(id.toString(), start);
      games.locked(
          () -> {
            var r = row(id);
            require(r.get("status").equals("preparing"), "Preparação cancelada.");
            require(
                db.queryForObject(
                        "select count(*) from party_players where room_id=? and not departed and"
                            + " seen_at>=?",
                        Integer.class,
                        id,
                        now() - 30000)
                    >= 2,
                "A sala precisa de duas pessoas presentes.");
            for (String identity :
                db.queryForList(
                    "select voice_identity from party_players where room_id=? and not departed",
                    String.class,
                    id))
              require(
                  identity != null && media.validConnection(identity),
                  "Todos precisam continuar na voz.");
            var s = state(r);
            s.put(
                "notes",
                json.convertValue(notes, new TypeReference<List<Map<String, Integer>>>() {}));
            s.put("title", prepared.path("title").asString("Música"));
            save(id, s);
            db.update(
                "update party_rooms set status='running',starts_at=?,ends_at=? where id=?",
                start,
                start + duration + 600,
                id);
            return null;
          });
    } catch (RuntimeException e) {
      games.locked(
          () -> {
            db.update(
                "update party_rooms set status='cancelled' where id=? and status in"
                    + " ('preparing','running')",
                id);
            return null;
          });
      try {
        bot.releaseRhythm(id.toString());
        db.update("update party_rooms set bot_released=true where id=?", id);
      } catch (Exception ignored) {
      }
      throw e;
    }
  }

  public int note(String name, UUID id, int index, int lane) {
    UUID u = user(name);
    return games.locked(
        () -> {
          var r = row(id);
          member(id, u);
          require(
              r.get("kind").equals("rhythm")
                  && r.get("status").equals("running")
                  && now() >= (Long) r.get("starts_at")
                  && now() < (Long) r.get("ends_at"),
              "A música ainda não começou ou já terminou.");
          var notes = (List<?>) state(r).get("notes");
          require(index >= 0 && index < notes.size() && lane >= 0 && lane < 4, "Nota inválida.");
          var old =
              db.queryForList(
                  "select points from rhythm_hits where room_id=? and account_id=? and note=?",
                  Integer.class,
                  id,
                  u,
                  index);
          if (!old.isEmpty()) return old.getFirst();
          var n = (Map<?, ?>) notes.get(index);
          long delta =
              Math.abs(
                  now() - ((Long) r.get("starts_at") + ((Number) n.get("at")).longValue() + 150));
          require(delta <= 400, "Essa nota está fora da janela de acerto.");
          int points =
              lane == ((Number) n.get("lane")).intValue()
                  ? (delta <= 80 ? 100 : delta <= 160 ? 70 : delta <= 240 ? 40 : 0)
                  : 0;
          int previous =
              db.queryForObject(
                  "select coalesce(max(note),-1) from rhythm_hits where room_id=? and account_id=?",
                  Integer.class,
                  id,
                  u);
          if (index > previous + 1)
            db.update("update party_players set combo=0 where room_id=? and account_id=?", id, u);
          db.update("insert into rhythm_hits values(?,?,?,?)", id, u, index, points);
          db.update(
              "update party_players set score=score+?,hits=hits+?,combo=case when ?>0 then combo+1"
                  + " else 0 end,best_combo=greatest(best_combo,case when ?>0 then combo+1 else 0"
                  + " end),seen_at=? where room_id=? and account_id=?",
              points,
              points > 0 ? 1 : 0,
              points,
              points,
              now(),
              id,
              u);
          return points;
        });
  }

  void settleBlackjack(UUID id, Map<String, Object> r) {
    var s = state(r);
    var dealer = new ArrayList<Integer>();
    for (Object c : (List<?>) s.get("dealer")) dealer.add(((Number) c).intValue());
    while (total(dealer) < 17) dealer.add(draw(s));
    s.put("dealer", dealer);
    save(id, s);
    for (var p :
        db.queryForList(
            "select p.account_id,p.hand from party_players p join accounts a on a.id=p.account_id"
                + " where p.room_id=? and not p.departed and a.enabled",
            id)) {
      var cards = hand((String) p.get("hand"));
      int score = total(cards);
      int desired =
          switch (blackjackOutcome(cards, dealer)) {
            case "bust" -> 2;
            case "blackjack" -> 30;
            case "tie" -> 8;
            case "win" -> 20;
            default -> 3;
          };
      int reward =
          games.credit(
              (UUID) p.get("account_id"),
              Roulette.ref("blackjack", (UUID) r.get("round_id")),
              desired,
              "Blackjack · rodada");
      db.update(
          "update party_players set standing=true,score=?,reward=? where room_id=? and"
              + " account_id=?",
          score,
          reward,
          id,
          p.get("account_id"));
    }
    db.update("update party_rooms set status='finished' where id=?", id);
  }

  void settleRhythm(UUID id, Map<String, Object> r) {
    var notes = (List<?>) state(r).getOrDefault("notes", List.of());
    int best =
        db.queryForObject(
            "select coalesce(max(p.score),0) from party_players p join accounts a on"
                + " a.id=p.account_id where p.room_id=? and not p.departed and a.enabled",
            Integer.class,
            id);
    for (var p :
        db.queryForList(
            "select p.account_id,p.score,p.hits from party_players p join accounts a on"
                + " a.id=p.account_id where p.room_id=? and not p.departed and a.enabled",
            id)) {
      int score = ((Number) p.get("score")).intValue(), hits = ((Number) p.get("hits")).intValue();
      int desired =
          hits < 3
              ? 0
              : 3
                  + (int) Math.round(27.0 * score / Math.max(1, notes.size() * 100))
                  + (score == best ? 10 : 0);
      int reward =
          games.credit(
              (UUID) p.get("account_id"),
              Roulette.ref("rhythm", id),
              desired,
              "Ritmo · apresentação");
      db.update(
          "update party_players set reward=? where room_id=? and account_id=?",
          reward,
          id,
          p.get("account_id"));
    }
    db.update("update party_rooms set status='finished' where id=?", id);
  }

  @Scheduled(fixedDelay = 1000, scheduler = "partyScheduler")
  public void advance() {
    games.locked(
        () -> {
          long sweepTime = now();
          for (var stale :
              db.queryForList(
                  "select p.room_id,p.account_id from party_players p join party_rooms r on"
                      + " r.id=p.room_id where r.kind='blackjack' and r.status='waiting' and"
                      + " p.entry_id is not null and (p.seen_at<? or r.created_at<?)",
                  sweepTime - 30000,
                  sweepTime - 600000))
            refundEntry((UUID) stale.get("room_id"), (UUID) stale.get("account_id"));
          db.update(
              "update party_players p set departed=true,standing=true from party_rooms r where"
                  + " r.id=p.room_id and r.status='waiting' and (p.seen_at<? or r.created_at<?)",
              sweepTime - 30000,
              sweepTime - 600000);
          for (UUID id :
              db.queryForList("select id from party_rooms where status='waiting'", UUID.class))
            transfer(id);
          for (UUID id :
              db.queryForList(
                  "select id from party_rooms where kind='blackjack' and status='running' and"
                      + " (ends_at<=? or not exists(select 1 from party_players p where"
                      + " p.room_id=party_rooms.id and not p.departed and not p.standing))",
                  UUID.class,
                  now())) settleBlackjack(id, row(id));
          db.update(
              "update party_rooms set status='cancelled' where status='preparing' and starts_at<?",
              now() - 150000);
          return null;
        });
    for (UUID id :
        db.queryForList(
            "select id from party_rooms where kind='rhythm' and status='running'", UUID.class)) {
      try {
        var status = bot.state().path("rhythm");
        boolean matches = id.toString().equals(status.path("id").asString());
        games.locked(
            () -> {
              var r = row(id);
              if (!r.get("status").equals("running")) return null;
              if (!matches || status.path("phase").asString().equals("failed")) {
                db.update("update party_rooms set status='cancelled' where id=?", id);
              } else if (now() > (Long) r.get("ends_at")
                  && status.path("phase").asString().equals("finished")) settleRhythm(id, r);
              else if (now() > (Long) r.get("ends_at") + 10000)
                db.update("update party_rooms set status='cancelled' where id=?", id);
              return null;
            });
      } catch (Exception e) {
        var deadlines =
            db.queryForList("select ends_at from party_rooms where id=?", Long.class, id);
        if (!deadlines.isEmpty() && now() > deadlines.getFirst() + 10000)
          games.locked(
              () -> {
                db.update("update party_rooms set status='cancelled' where id=?", id);
                return null;
              });
      }
    }
    for (UUID id :
        db.queryForList(
            "select id from party_rooms where kind='rhythm' and status in ('finished','cancelled')"
                + " and not bot_released",
            UUID.class)) {
      try {
        bot.releaseRhythm(id.toString());
        db.update("update party_rooms set bot_released=true where id=?", id);
      } catch (Exception ignored) {
        break;
      }
    }
  }
}
