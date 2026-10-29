package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.security.SecureRandom;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Durable, server-authoritative games. One short database lock serializes the club (16 users). */
@Service
public class Games {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final Accounts accounts;
  final Roulette roulette;
  final SecureRandom random = new SecureRandom();

  public Games(JdbcTemplate db, TransactionTemplate tx, Accounts accounts, Roulette roulette) {
    this.roulette = roulette;
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

  long day() {
    return LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli();
  }

  UUID user(String name) {
    return accounts.active(name).id();
  }

  static void require(boolean condition, String message) {
    if (!condition) throw new ResponseStatusException(CONFLICT, message);
  }

  int credit(UUID user, UUID reference, int desired, String reason) {
    var existing =
        db.queryForList(
            "select amount from coin_ledger where account_id=? and reference=?",
            Integer.class,
            user,
            reference);
    if (!existing.isEmpty()) return existing.getFirst();
    int earned =
        db.queryForObject(
            "select coalesce(sum(amount),0)::int from coin_ledger where account_id=? and"
                + " kind='grant' and created_at>=?",
            Integer.class,
            user,
            day());
    int amount =
        Math.max(0, Math.min(Math.min(desired, 500 - earned), roulette.freeCapacity(user)));
    db.update(
        "insert into coin_ledger(account_id,reference,amount,reason,created_at) values(?,?,?,?,?)",
        user,
        reference,
        amount,
        reason,
        now());
    return amount;
  }

  public Map<String, Object> overview(String name) {
    UUID u = user(name);
    long week =
        LocalDate.now(ZoneOffset.UTC)
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            .atStartOfDay()
            .toInstant(ZoneOffset.UTC)
            .toEpochMilli();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("serverNow", now());
    out.put(
        "balance",
        db.queryForObject(
            "select coalesce(sum(amount),0) from coin_ledger where account_id=?", Long.class, u));
    out.put(
        "earnedToday",
        db.queryForObject(
            "select coalesce(sum(amount),0) from coin_ledger where account_id=? and kind='grant'"
                + " and created_at>=?",
            Long.class,
            u,
            day()));
    out.put(
        "spinsLeft",
        Math.max(
            0,
            10
                - db.queryForObject(
                    "select count(*) from game_spins where account_id=? and" + " created_at>=?",
                    Integer.class,
                    u,
                    day())));
    out.put(
        "history",
        db.queryForList(
            "select id,amount,reason,created_at as \"createdAt\" from coin_ledger where"
                + " account_id=? order by id desc limit 20",
            u));
    out.put(
        "leaderboard",
        db.queryForList(
            "select a.display_name as name, sum(l.amount) as coins from coin_ledger l join accounts"
                + " a on a.id=l.account_id where l.created_at>=? and a.enabled group by a.id order"
                + " by coins desc,a.display_name limit 5",
            week));
    roulette.overview(u, out);
    return out;
  }

  public Map<String, Object> spin(String name, UUID clientId) {
    UUID u = user(name);
    Objects.requireNonNull(clientId);
    return locked(
        () -> {
          var old =
              db.queryForList(
                  "select symbols,reward from game_spins where account_id=? and client_id=?",
                  u,
                  clientId);
          if (!old.isEmpty()) return old.getFirst();
          require(
              db.queryForObject(
                      "select count(*) from game_spins where account_id=? and" + " created_at>=?",
                      Integer.class,
                      u,
                      day())
                  < 10,
              "Os 10 giros de hoje acabaram. Volte amanhã (UTC)!");
          String symbols = "" + random.nextInt(4) + random.nextInt(4) + random.nextInt(4);
          int desired =
              symbols.charAt(0) == symbols.charAt(1) && symbols.charAt(1) == symbols.charAt(2)
                  ? 30
                  : symbols.charAt(0) == symbols.charAt(1)
                          || symbols.charAt(1) == symbols.charAt(2)
                          || symbols.charAt(0) == symbols.charAt(2)
                      ? 8
                      : 2;
          int reward = credit(u, Roulette.ref("grant", clientId), desired, "Giro da Sorte");
          db.update(
              "insert into game_spins values(?,?,?,?,?)", u, clientId, symbols, reward, now());
          return Map.of("symbols", symbols, "reward", reward);
        });
  }

  public UUID create(String name, UUID clientId, boolean solo) {
    return roulette.create(name, clientId, solo);
  }

  public void action(String name, UUID id, String action) {
    roulette.action(name, id, action);
  }
}
