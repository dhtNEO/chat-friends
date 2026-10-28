package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Roulette {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final Accounts accounts;
  final SecureRandom random = new SecureRandom();
  static final Set<Integer> RED =
      Set.of(1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36);

  public Roulette(JdbcTemplate db, TransactionTemplate tx, Accounts accounts) {
    this.db = db;
    this.tx = tx;
    this.accounts = accounts;
  }

  <T> T locked(Supplier<T> action) {
    return tx.execute(
        s -> {
          db.execute("select pg_advisory_xact_lock(918273)");
          return action.get();
        });
  }

  long now() {
    return System.currentTimeMillis();
  }

  UUID user(String name) {
    return accounts.active(name).id();
  }

  static void require(boolean condition, String message) {
    if (!condition) throw new ResponseStatusException(CONFLICT, message);
  }

  static UUID ref(String type, UUID id) {
    return UUID.nameUUIDFromBytes((type + ":" + id).getBytes(StandardCharsets.UTF_8));
  }

  long balance(UUID u) {
    return db.queryForObject(
        "select coalesce(sum(amount),0) from coin_ledger where account_id=?", Long.class, u);
  }

  BigInteger exposure(UUID user) {
    return db.queryForObject(
            "select coalesce(sum(b.amount::numeric * case when b.choice like 'n:%' then 36 when"
                + " b.choice like 'dozen%' then 3 else 2 end),0) from roulette_bets b join"
                + " roulette_rounds q on q.id=b.round_id where b.account_id=? and not b.refunded"
                + " and not q.settled",
            BigDecimal.class, user)
        .toBigIntegerExact();
  }

  int freeCapacity(UUID user) {
    BigInteger capacity =
        BigInteger.valueOf(Long.MAX_VALUE)
            .subtract(BigInteger.valueOf(balance(user)))
            .subtract(exposure(user));
    return capacity.max(BigInteger.ZERO).min(BigInteger.valueOf(500)).intValue();
  }

  void entry(UUID u, UUID reference, long amount, String kind, String reason) {
    db.update(
        "insert into coin_ledger(account_id,reference,amount,kind,reason,created_at)"
            + " values(?,?,?,?,?,?) on conflict(account_id,reference) do nothing",
        u,
        reference,
        amount,
        kind,
        reason,
        now());
  }

  static int multiplier(String choice) {
    if (Set.of("red", "black", "even", "odd", "low", "high").contains(choice)) return 2;
    if (Set.of("dozen1", "dozen2", "dozen3").contains(choice)) return 3;
    if (choice != null && choice.matches("n:(?:[0-9]|[12][0-9]|3[0-6])")) return 36;
    throw new ResponseStatusException(BAD_REQUEST, "Escolha uma aposta válida.");
  }

  static boolean wins(String choice, int n) {
    multiplier(choice);
    if (choice.startsWith("n:")) return Integer.parseInt(choice.substring(2)) == n;
    if (n == 0) return false;
    return switch (choice) {
      case "red" -> RED.contains(n);
      case "black" -> !RED.contains(n);
      case "even" -> n % 2 == 0;
      case "odd" -> n % 2 == 1;
      case "low" -> n <= 18;
      case "high" -> n >= 19;
      case "dozen1" -> n <= 12;
      case "dozen2" -> n >= 13 && n <= 24;
      case "dozen3" -> n >= 25;
      default -> false;
    };
  }

  void available(UUID u) {
    require(
        db.queryForObject(
                "select count(*) from game_players p join game_rooms r on r.id=p.room_id where"
                    + " p.account_id=? and not p.departed and r.round_id is not null and r.status"
                    + " in ('waiting','running')",
                Integer.class,
                u)
            == 0,
        "Saia da sua mesa atual antes de entrar em outra.");
  }

  public UUID create(String name, UUID clientId, boolean solo) {
    UUID u = user(name);
    return locked(
        () -> {
          var old =
              db.queryForList(
                  "select id from game_rooms where creator_id=? and client_id=?",
                  UUID.class,
                  u,
                  clientId);
          if (!old.isEmpty()) return old.getFirst();
          available(u);
          require(
              db.queryForObject(
                      "select count(*) from game_rooms where creator_id=? and created_at>?",
                      Integer.class,
                      u,
                      now() - 60000)
                  < 6,
              "Aguarde um minuto antes de criar outra sala.");
          UUID id = UUID.randomUUID(), round = UUID.randomUUID();
          db.update(
              "insert into game_rooms(id,host_id,creator_id,client_id,solo,status,created_at)"
                  + " values(?,?,?,?,?,'waiting',?)",
              id,
              u,
              u,
              clientId,
              solo,
              now());
          db.update(
              "insert into roulette_rounds(id,room_id,client_id) values(?,?,?)",
              round,
              id,
              clientId);
          db.update("update game_rooms set round_id=? where id=?", round, id);
          db.update(
              "insert into game_players(room_id,account_id,joined_at,seen_at) values(?,?,?,?)",
              id,
              u,
              now(),
              now());
          return id;
        });
  }

  Map<String, Object> room(UUID id) {
    var rows =
        db.queryForList(
            "select r.id,r.host_id as \"hostId\",r.solo,r.status,r.starts_at as"
                + " \"startsAt\",r.ends_at as \"endsAt\",r.round_id as \"roundId\",q.number from"
                + " game_rooms r join roulette_rounds q on q.id=r.round_id where r.id=?",
            id);
    if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "Mesa não encontrada.");
    var r = rows.getFirst();
    r.put(
        "players",
        db.queryForList(
            "select p.account_id as id,a.display_name as"
                + " name,p.departed,b.choice,b.amount,b.payout,b.refunded from game_players p join"
                + " accounts a on a.id=p.account_id left join roulette_bets b on b.round_id=? and"
                + " b.account_id=p.account_id where p.room_id=? order by p.joined_at,p.account_id",
            r.get("roundId"),
            id));
    r.put(
        "recent",
        db.queryForList(
            "select q.number from roulette_rounds q join game_rooms r on r.id=q.room_id where"
                + " q.room_id=? and q.settled order by q.created_at desc,q.id desc limit 12",
            id));
    return r;
  }

  void overview(UUID u, Map<String, Object> out) {
    out.put(
        "rooms",
        db.queryForList(
            "select r.id,a.display_name as host,(select count(*) from game_players p where"
                + " p.room_id=r.id and not p.departed) as players from game_rooms r join accounts a"
                + " on a.id=r.host_id where r.status='waiting' and r.round_id is not null and not"
                + " r.solo order by r.created_at desc limit 16"));
    var active =
        db.queryForList(
            "select r.id from game_rooms r join game_players p on p.room_id=r.id where"
                + " p.account_id=? and not p.departed and r.round_id is not null and r.status in"
                + " ('waiting','running','finished') order by r.created_at desc limit 1",
            UUID.class,
            u);
    out.put("room", active.isEmpty() ? null : room(active.getFirst()));
  }

  public void bet(
      String name, UUID roomId, UUID roundId, UUID clientId, String choice, long amount) {
    UUID u = user(name);
    int mult = multiplier(choice);
    require(amount > 0, "A aposta deve ser um número inteiro de Coins maior que zero.");
    long potential;
    try {
      potential = Math.multiplyExact(amount, mult);
    } catch (ArithmeticException e) {
      throw new ResponseStatusException(BAD_REQUEST, "Valor fora da capacidade da carteira.");
    }
    locked(
        () -> {
          var old =
              db.queryForList(
                  "select round_id,choice,amount from roulette_bets where account_id=? and"
                      + " client_id=?",
                  u,
                  clientId);
          if (!old.isEmpty()) {
            var b = old.getFirst();
            require(
                roundId.equals(b.get("round_id"))
                    && choice.equals(b.get("choice"))
                    && amount == ((Number) b.get("amount")).longValue(),
                "Identificador de aposta reutilizado com outros dados.");
            return null;
          }
          var r = room(roomId);
          require(
              roundId.equals(r.get("roundId")) && r.get("status").equals("waiting"),
              "As apostas desta rodada estão encerradas.");
          require(
              db.queryForObject(
                      "select count(*) from game_players where room_id=? and account_id=? and not"
                          + " departed",
                      Integer.class,
                      roomId,
                      u)
                  == 1,
              "Entre na mesa antes de apostar.");
          require(
              db.queryForObject(
                      "select count(*) from roulette_bets where round_id=? and account_id=?",
                      Integer.class,
                      roundId,
                      u)
                  == 0,
              "Você já confirmou sua aposta nesta rodada.");
          long available = balance(u);
          require(amount <= available, "Seu saldo não cobre essa aposta.");
          try {
            Math.addExact(available - amount, potential);
          } catch (ArithmeticException e) {
            throw new ResponseStatusException(
                BAD_REQUEST, "Pagamento fora da capacidade da carteira.");
          }
          require(
              BigInteger.valueOf(available - amount)
                      .add(BigInteger.valueOf(potential))
                      .add(exposure(u))
                      .compareTo(BigInteger.valueOf(Long.MAX_VALUE))
                  <= 0,
              "A carteira não comporta todos os retornos pendentes desta aposta.");
          UUID id = UUID.randomUUID();
          db.update(
              "insert into roulette_bets(id,round_id,account_id,client_id,choice,amount)"
                  + " values(?,?,?,?,?,?)",
              id,
              roundId,
              u,
              clientId,
              choice,
              amount);
          entry(u, ref("stake", id), -amount, "stake", "Roleta · aposta");
          db.update(
              "update game_players set seen_at=? where room_id=? and account_id=?",
              now(),
              roomId,
              u);
          return null;
        });
  }

  void refund(UUID room, UUID u) {
    var bets =
        db.queryForList(
            "select b.id,b.amount from roulette_bets b join game_rooms r on r.round_id=b.round_id"
                + " where r.id=? and b.account_id=? and not b.refunded and r.status='waiting'",
            room,
            u);
    for (var b : bets) {
      entry(
          u,
          ref("refund", (UUID) b.get("id")),
          ((Number) b.get("amount")).longValue(),
          "refund",
          "Roleta · aposta devolvida");
      db.update("update roulette_bets set refunded=true where id=?", b.get("id"));
    }
  }

  void leave(UUID room, UUID u) {
    refund(room, u);
    db.update("update game_players set departed=true where room_id=? and account_id=?", room, u);
    transfer(room);
  }

  void transfer(UUID room) {
    if (db.queryForObject(
            "select count(*) from game_rooms r join game_players p on p.room_id=r.id and"
                + " p.account_id=r.host_id where r.id=? and not p.departed",
            Integer.class,
            room)
        > 0) return;
    var alive =
        db.queryForList(
            "select account_id from game_players where room_id=? and not departed order by"
                + " joined_at,account_id",
            UUID.class,
            room);
    if (alive.isEmpty())
      db.update("update game_rooms set status='cancelled' where id=? and status='waiting'", room);
    else db.update("update game_rooms set host_id=? where id=?", alive.getFirst(), room);
  }

  public void action(String name, UUID id, String action) {
    UUID u = user(name);
    locked(
        () -> {
          var r = room(id);
          String status = (String) r.get("status");
          if (action.equals("join")) {
            require(
                status.equals("waiting") && !Boolean.TRUE.equals(r.get("solo")),
                "Aguarde a próxima rodada para entrar.");
            if (db.queryForObject(
                    "select count(*) from game_players where room_id=? and account_id=? and not"
                        + " departed",
                    Integer.class,
                    id,
                    u)
                > 0) return null;
            available(u);
            require(
                db.queryForObject(
                        "select count(*) from game_players where room_id=? and not departed",
                        Integer.class,
                        id)
                    < 8,
                "Mesa cheia (8 pessoas).");
            // A refunded ticket stays final; rejoining starts with the next round.
            require(
                db.queryForObject(
                        "select count(*) from roulette_bets where round_id=? and account_id=? and"
                            + " refunded",
                        Integer.class,
                        r.get("roundId"),
                        u)
                    == 0,
                "Sua aposta foi devolvida. Entre novamente na próxima rodada.");
            db.update(
                "insert into game_players(room_id,account_id,joined_at,seen_at) values(?,?,?,?) on"
                    + " conflict(room_id,account_id) do update set"
                    + " departed=false,seen_at=excluded.seen_at",
                id,
                u,
                now(),
                now());
            return null;
          }
          require(
              db.queryForObject(
                      "select count(*) from game_players where room_id=? and account_id=? and not"
                          + " departed",
                      Integer.class,
                      id,
                      u)
                  == 1,
              "Você não participa desta mesa.");
          db.update(
              "update game_players set seen_at=? where room_id=? and account_id=?", now(), id, u);
          switch (action) {
            case "presence" -> {}
            case "leave" -> leave(id, u);
            case "start" -> {
              require(u.equals(r.get("hostId")), "Só o anfitrião pode girar a roleta.");
              if (status.equals("running")) return null;
              require(status.equals("waiting"), "Esta rodada já terminou.");
              require(
                  db.queryForObject(
                          "select count(*) from roulette_bets where round_id=? and not refunded",
                          Integer.class,
                          r.get("roundId"))
                      > 0,
                  "Confirme pelo menos uma aposta antes de girar.");
              require(
                  db.queryForObject(
                          "select count(*) from game_players p where p.room_id=? and not p.departed"
                              + " and (p.seen_at<? or not exists(select 1 from roulette_bets b"
                              + " where b.round_id=? and b.account_id=p.account_id and not"
                              + " b.refunded))",
                          Integer.class,
                          id,
                          now() - 30000,
                          r.get("roundId"))
                      == 0,
                  "Todos os jogadores presentes precisam confirmar suas apostas.");
              db.update(
                  "update roulette_rounds set number=? where id=?",
                  random.nextInt(37),
                  r.get("roundId"));
              long start = now() + 1500;
              db.update(
                  "update game_rooms set status='running',starts_at=?,ends_at=? where id=?",
                  start,
                  start + 18000,
                  id);
            }
            default -> throw new ResponseStatusException(BAD_REQUEST, "Ação inválida.");
          }
          return null;
        });
  }

  public void next(String name, UUID id, UUID clientId) {
    UUID u = user(name);
    locked(
        () -> {
          if (db.queryForObject(
                  "select count(*) from roulette_rounds where room_id=? and client_id=?",
                  Integer.class,
                  id,
                  clientId)
              > 0) return null;
          var r = room(id);
          require(
              u.equals(r.get("hostId")) && r.get("status").equals("finished"),
              "O anfitrião pode abrir outra rodada após o resultado.");
          require(
              db.queryForObject(
                      "select count(*) from game_players where room_id=? and account_id=? and not"
                          + " departed",
                      Integer.class,
                      id,
                      u)
                  == 1,
              "Você saiu desta mesa.");
          available(u);
          db.update(
              "update game_players p set departed=true where p.room_id=? and p.account_id<>? and"
                  + " not p.departed and (p.seen_at<? or exists(select 1 from game_players p2 join"
                  + " game_rooms r2 on r2.id=p2.room_id where p2.account_id=p.account_id and"
                  + " p2.room_id<>p.room_id and not p2.departed and r2.status in"
                  + " ('waiting','running')) or not exists(select 1 from accounts a where"
                  + " a.id=p.account_id and a.enabled))",
              id,
              u,
              now() - 30000);
          UUID round = UUID.randomUUID();
          db.update(
              "insert into roulette_rounds(id,room_id,client_id) values(?,?,?)",
              round,
              id,
              clientId);
          db.update(
              "update game_rooms set status='waiting',round_id=?,starts_at=0,ends_at=0,created_at=?"
                  + " where id=?",
              round,
              now(),
              id);
          return null;
        });
  }

  @Scheduled(fixedDelay = 1000)
  public void advance() {
    locked(
        () -> {
          var stale =
              db.queryForList(
                  "select p.room_id,p.account_id from game_players p join game_rooms r on"
                      + " r.id=p.room_id join accounts a on a.id=p.account_id where r.round_id is"
                      + " not null and r.status='waiting' and not p.departed and (p.seen_at<? or"
                      + " not a.enabled or r.created_at<?)",
                  now() - 30000,
                  now() - 600000);
          for (var p : stale) leave((UUID) p.get("room_id"), (UUID) p.get("account_id"));
          for (UUID id :
              db.queryForList(
                  "select id from game_rooms where round_id is not null and status='running' and"
                      + " ends_at<=?",
                  UUID.class,
                  now())) {
            var r = room(id);
            UUID round = (UUID) r.get("roundId");
            int n = (Integer) r.get("number");
            for (var b :
                db.queryForList(
                    "select * from roulette_bets where round_id=? and not refunded", round)) {
              long amount = ((Number) b.get("amount")).longValue();
              String choice = (String) b.get("choice");
              long payout = wins(choice, n) ? Math.multiplyExact(amount, multiplier(choice)) : 0;
              if (payout > 0)
                entry(
                    (UUID) b.get("account_id"),
                    ref("payout", (UUID) b.get("id")),
                    payout,
                    "payout",
                    "Roleta · prêmio (inclui aposta)");
              db.update("update roulette_bets set payout=? where id=?", payout, b.get("id"));
            }
            db.update("update roulette_rounds set settled=true where id=?", round);
            db.update("update game_rooms set status='finished' where id=?", id);
          }
          return null;
        });
  }
}
