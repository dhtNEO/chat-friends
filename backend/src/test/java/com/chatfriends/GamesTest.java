package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {"app.reconcile-initial-delay=600000"})
@AutoConfigureMockMvc
class GamesTest {
  @Autowired Games games;
  @Autowired Roulette roulette;
  @Autowired Accounts accounts;
  @Autowired MockMvc mvc;
  @MockitoBean LiveKitGateway live;
  UUID ana, bia;

  @BeforeEach
  void setup() {
    games.locked(
        () -> {
          games.db.execute("TRUNCATE accounts CASCADE");
          return null;
        });
    ana = accounts.create("ana", "Ana", "test-only-password-ana", false).id();
    bia = accounts.create("bia", "Bia", "test-only-password-bia", false).id();
  }

  void funds(UUID u, int amount) {
    games.locked(() -> games.credit(u, UUID.randomUUID(), amount, "Teste"));
  }

  UUID create() {
    return games.create("ana", UUID.randomUUID(), false);
  }

  UUID round(UUID room) {
    return (UUID) roulette.room(room).get("roundId");
  }

  void bet(String user, UUID room, String choice, long amount) {
    roulette.bet(user, room, round(room), UUID.randomUUID(), choice, amount);
  }

  void finish(UUID room, int number) {
    roulette.locked(
        () -> {
          games.db.update("update roulette_rounds set number=? where id=?", number, round(room));
          games.db.update(
              "update game_rooms set ends_at=? where id=?", System.currentTimeMillis() - 1, room);
          return null;
        });
    roulette.advance();
  }

  @Test
  void authenticationAndCsrfRequired() throws Exception {
    mvc.perform(get("/api/games")).andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/games/spin")
                .contentType("application/json")
                .content("{\"clientId\":\"" + UUID.randomUUID() + "\"}"))
        .andExpect(status().isForbidden());
    assertEquals(0, roulette.balance(ana));
  }

  @Test
  void concurrentSpinRetriesOnlyPayOnce() throws Exception {
    UUID id = UUID.randomUUID();
    try (var pool = Executors.newFixedThreadPool(6)) {
      var tasks = new ArrayList<Callable<Map<String, Object>>>();
      for (int i = 0; i < 6; i++) tasks.add(() -> games.spin("ana", id));
      var results = pool.invokeAll(tasks);
      for (var result : results) assertEquals(results.getFirst().get(), result.get());
    }
    assertEquals(1, games.db.queryForObject("select count(*) from game_spins", Integer.class));
    assertEquals(1, games.db.queryForObject("select count(*) from coin_ledger", Integer.class));
  }

  @Test
  void freeQuotaAndCapStillApply() {
    funds(ana, 499);
    for (int i = 0; i < 10; i++) games.spin("ana", UUID.randomUUID());
    assertEquals(500, roulette.balance(ana));
    assertThrows(ResponseStatusException.class, () -> games.spin("ana", UUID.randomUUID()));
  }

  @Test
  void allThirtySevenPocketsAndPayoutMultipliersAreCorrect() {
    for (String c :
        List.of(
            "red", "black", "even", "odd", "low", "high", "dozen1", "dozen2", "dozen3", "n:0",
            "n:36")) {
      int count = 0;
      for (int n = 0; n <= 36; n++) if (Roulette.wins(c, n)) count++;
      assertEquals(c.startsWith("n:") ? 1 : c.startsWith("dozen") ? 12 : 18, count);
      assertEquals(c.startsWith("n:") ? 36 : c.startsWith("dozen") ? 3 : 2, Roulette.multiplier(c));
    }
    for (String c :
        List.of("red", "black", "even", "odd", "low", "high", "dozen1", "dozen2", "dozen3"))
      assertFalse(Roulette.wins(c, 0));
    assertThrows(ResponseStatusException.class, () -> Roulette.multiplier("n:37"));
  }

  @Test
  void allInNumberPrizeIsUncappedAndPaidOnce() {
    funds(ana, 500);
    UUID room = create();
    bet("ana", room, "n:0", 500);
    assertEquals(0, roulette.balance(ana));
    games.action("ana", room, "start");
    finish(room, 0);
    roulette.advance();
    assertEquals(18000, roulette.balance(ana));
    assertEquals(18000L, games.db.queryForObject("select payout from roulette_bets", Long.class));
    assertEquals(
        1,
        games.db.queryForObject(
            "select count(*) from coin_ledger where kind='payout'", Integer.class));
  }

  @Test
  void refundsBeforeSpinAndSettlementAfterLeavingRunningRound() {
    funds(ana, 100);
    UUID room = create();
    bet("ana", room, "red", 100);
    games.action("ana", room, "leave");
    assertEquals(100, roulette.balance(ana));
    assertEquals("cancelled", roulette.room(room).get("status"));
    room = create();
    bet("ana", room, "black", 100);
    games.action("ana", room, "start");
    games.action("ana", room, "leave");
    assertEquals("running", roulette.room(room).get("status"));
    finish(room, 2);
    assertEquals(200, roulette.balance(ana));
  }

  @Test
  void losingBetPaysNothingAndZeroBeatsExternalBets() {
    funds(ana, 100);
    UUID room = create();
    bet("ana", room, "even", 100);
    games.action("ana", room, "start");
    finish(room, 0);
    assertEquals(0, roulette.balance(ana));
    assertEquals(0L, games.db.queryForObject("select payout from roulette_bets", Long.class));
  }

  @Test
  void concurrentBetsNeverDoubleSpendOrDoubleDebit() throws Exception {
    funds(ana, 100);
    UUID room = create(), round = round(room);
    AtomicInteger accepted = new AtomicInteger();
    try (var pool = Executors.newFixedThreadPool(8)) {
      var tasks = new ArrayList<Callable<Void>>();
      for (int i = 0; i < 8; i++)
        tasks.add(
            () -> {
              try {
                roulette.bet("ana", room, round, UUID.randomUUID(), "red", 100);
                accepted.incrementAndGet();
              } catch (ResponseStatusException expected) {
              }
              return null;
            });
      for (var result : pool.invokeAll(tasks)) result.get();
    }
    assertEquals(1, accepted.get());
    assertEquals(0, roulette.balance(ana));
    assertEquals(
        1,
        games.db.queryForObject(
            "select count(*) from coin_ledger where kind='stake'", Integer.class));
  }

  @Test
  void retriesAreIdempotentButChangedPayloadAndClosedRoundsAreRejected() {
    funds(ana, 100);
    funds(bia, 100);
    UUID room = create(), round = round(room), key = UUID.randomUUID();
    games.action("bia", room, "join");
    roulette.bet("ana", room, round, key, "red", 20);
    roulette.bet("ana", room, round, key, "red", 20);
    assertEquals(80, roulette.balance(ana));
    assertThrows(
        ResponseStatusException.class, () -> roulette.bet("ana", room, round, key, "black", 20));
    assertThrows(ResponseStatusException.class, () -> games.action("ana", room, "start"));
    bet("bia", room, "black", 10);
    games.action("ana", room, "start");
    assertThrows(
        ResponseStatusException.class,
        () -> roulette.bet("bia", room, round, UUID.randomUUID(), "n:1", 10));
    assertThrows(ResponseStatusException.class, () -> games.action("bia", room, "start"));
  }

  @Test
  void invalidStakesAndNonMembersCannotBet() {
    funds(ana, 100);
    funds(bia, 100);
    UUID room = create();
    assertThrows(ResponseStatusException.class, () -> bet("ana", room, "red", 101));
    assertThrows(ResponseStatusException.class, () -> bet("ana", room, "red", 0));
    assertThrows(ResponseStatusException.class, () -> bet("ana", room, "red", -1));
    assertThrows(ResponseStatusException.class, () -> bet("bia", room, "red", 10));
    assertThrows(ResponseStatusException.class, () -> bet("ana", room, "n:37", 10));
    assertThrows(ResponseStatusException.class, () -> bet("ana", room, "n:1", Long.MAX_VALUE));
    assertEquals(100, roulette.balance(ana));
  }

  @Test
  void staleLobbyRefundsAndTransfersHost() {
    funds(ana, 100);
    funds(bia, 100);
    UUID room = create();
    games.action("bia", room, "join");
    bet("ana", room, "red", 40);
    games.db.update(
        "update game_players set seen_at=? where room_id=? and account_id=?",
        System.currentTimeMillis() - 31000,
        room,
        ana);
    roulette.advance();
    assertEquals(100, roulette.balance(ana));
    assertEquals(bia, roulette.room(room).get("hostId"));
  }

  @Test
  void nextRoundPreservesRoomAndIgnoresDuplicateNextRequest() {
    funds(ana, 100);
    UUID room = create(), old = round(room);
    bet("ana", room, "black", 10);
    games.action("ana", room, "start");
    finish(room, 2);
    UUID key = UUID.randomUUID();
    roulette.next("ana", room, key);
    UUID next = round(room);
    roulette.next("ana", room, key);
    assertNotEquals(old, next);
    assertEquals(next, round(room));
    assertEquals("waiting", roulette.room(room).get("status"));
    bet("ana", room, "n:0", 20);
    assertEquals(90, roulette.balance(ana));
  }

  @Test
  void prizesDoNotConsumeFreeGrantLimit() {
    funds(ana, 100);
    UUID room = create();
    bet("ana", room, "red", 50);
    games.action("ana", room, "start");
    finish(room, 1);
    games.locked(() -> games.credit(ana, UUID.randomUUID(), 400, "Teste"));
    assertEquals(550, roulette.balance(ana));
    assertEquals(500L, games.overview("ana").get("earnedToday"));
  }

  @Test
  void retiredStopActionIsUnavailable() {
    UUID room = create();
    assertThrows(ResponseStatusException.class, () -> games.action("ana", room, "stop"));
  }

  @Test
  void oldFinishedMesaCannotReopenWhenHostHasAnotherActiveRoom() {
    funds(ana, 100);
    UUID previous = create();
    bet("ana", previous, "red", 10);
    games.action("ana", previous, "start");
    finish(previous, 1);
    create();
    assertThrows(
        ResponseStatusException.class, () -> roulette.next("ana", previous, UUID.randomUUID()));
  }

  @Test
  void cancelledBetDoesNotChangeWeeklyNetAndHistoryIsChronological() {
    funds(ana, 100);
    UUID room = create();
    bet("ana", room, "red", 20);
    games.action("ana", room, "leave");
    @SuppressWarnings("unchecked")
    var board =
        (java.util.List<java.util.Map<String, Object>>) games.overview("ana").get("leaderboard");
    assertEquals(100L, ((Number) board.getFirst().get("coins")).longValue());
    room = create();
    bet("ana", room, "red", 10);
    games.action("ana", room, "start");
    finish(room, 1);
    UUID key = UUID.randomUUID();
    roulette.next("ana", room, key);
    bet("ana", room, "black", 10);
    games.action("ana", room, "start");
    finish(room, 2);
    @SuppressWarnings("unchecked")
    var recent = (java.util.List<java.util.Map<String, Object>>) roulette.room(room).get("recent");
    assertEquals(2, recent.getFirst().get("number"));
    assertEquals(1, recent.get(1).get("number"));
  }

  jakarta.servlet.http.Cookie login() throws Exception {
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    var csrf = mvc.perform(get("/api/csrf")).andReturn().getResponse();
    return mvc.perform(
            post("/api/login")
                .cookie(csrf.getCookie("SESSION"))
                .header(
                    "X-CSRF-TOKEN", json.readTree(csrf.getContentAsString()).get("token").asText())
                .param("username", "ana")
                .param("password", "test-only-password-ana"))
        .andExpect(status().isNoContent())
        .andReturn()
        .getResponse()
        .getCookie("SESSION");
  }

  @Test
  void authenticatedApiDebitsAndRejectsMissingCsrf() throws Exception {
    funds(ana, 100);
    var cookie = login();
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    var csrf = mvc.perform(get("/api/csrf").cookie(cookie)).andReturn().getResponse();
    String token = json.readTree(csrf.getContentAsString()).get("token").asText();
    var created =
        mvc.perform(
                post("/api/games/rooms")
                    .cookie(cookie)
                    .header("X-CSRF-TOKEN", token)
                    .contentType("application/json")
                    .content("{\"clientId\":\"" + UUID.randomUUID() + "\",\"solo\":true}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    UUID room = UUID.fromString(json.readTree(created.getContentAsString()).get("id").asText());
    String payload =
        "{\"clientId\":\""
            + UUID.randomUUID()
            + "\",\"roundId\":\""
            + round(room)
            + "\",\"choice\":\"red\",\"amount\":100}";
    mvc.perform(
            post("/api/games/rooms/" + room + "/bet")
                .cookie(cookie)
                .header("X-CSRF-TOKEN", token)
                .contentType("application/json")
                .content(payload.replace("100}", "1.5}")))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/games/rooms/" + room + "/bet")
                .cookie(cookie)
                .contentType("application/json")
                .content(payload))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/games/rooms/" + room + "/bet")
                .cookie(cookie)
                .header("X-CSRF-TOKEN", token)
                .contentType("application/json")
                .content(payload))
        .andExpect(status().isOk());
    mvc.perform(get("/api/games").cookie(cookie)).andExpect(status().isOk());
    assertEquals(0, roulette.balance(ana));
  }
}
