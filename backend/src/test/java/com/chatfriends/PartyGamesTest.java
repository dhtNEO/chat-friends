package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {"app.reconcile-initial-delay=600000"})
@AutoConfigureMockMvc
class PartyGamesTest {
  @Autowired PartyGames party;
  @Autowired Games games;
  @Autowired Accounts accounts;
  @Autowired MockMvc mvc;
  @MockitoBean LiveKitGateway live;
  @MockitoBean MusicGateway bot;
  UUID ana, bia;

  @BeforeEach
  void setup() {
    games.locked(
        () -> {
          games.db.execute("truncate accounts cascade");
          return null;
        });
    ana = accounts.create("ana", "Ana", "test-only-password-ana", false).id();
    bia = accounts.create("bia", "Bia", "test-only-password-bia", false).id();
    when(live.musicToken()).thenReturn("private-test-token");
  }

  @AfterEach
  void cleanupRooms() {
    games.locked(
        () -> {
          games.db.execute("truncate party_rooms cascade");
          return null;
        });
  }

  UUID create(String kind) {
    return party.create(
        "ana", UUID.randomUUID(), kind, kind.equals("rhythm") ? "aqz-KE-bpKQ" : null);
  }

  void action(String user, UUID id, String action) {
    party.action(user, id, UUID.randomUUID(), action, null);
  }

  UUID blackjack() {
    UUID id = create("blackjack");
    action("bia", id, "join");
    action("bia", id, "ready");
    action("ana", id, "start");
    return id;
  }

  void expire(UUID id) {
    games.db.update(
        "update party_rooms set ends_at=? where id=?", System.currentTimeMillis() - 1, id);
    party.advance();
  }

  String voice(UUID account, String username) {
    String session = UUID.randomUUID().toString(), identity = account + ":party";
    long now = System.currentTimeMillis();
    games.db.update(
        "insert into spring_session values(?,?,?, ?,7200,?,?)",
        UUID.randomUUID().toString(),
        session,
        now,
        now,
        now + 7200000,
        username);
    games.db.update(
        "insert into media_connections(identity,account_id,session_id,expires_at)"
            + " values(?,?,?,now()+interval '1 hour')",
        identity,
        account,
        session);
    return identity;
  }

  UUID rhythm() throws Exception {
    UUID id = create("rhythm");
    action("bia", id, "join");
    party.action("ana", id, UUID.randomUUID(), "ready", voice(ana, "ana"));
    party.action("bia", id, UUID.randomUUID(), "ready", voice(bia, "bia"));
    var notes = new ArrayList<Map<String, Integer>>();
    for (int i = 0; i < 12; i++) notes.add(Map.of("at", 2000 + i * 500, "lane", i % 4));
    when(bot.prepareRhythm(eq(id.toString()), anyString(), anyString(), anyString()))
        .thenReturn(
            party.json.valueToTree(
                Map.of("title", "Batidas", "durationMs", 15000, "notes", notes)));
    when(bot.state())
        .thenReturn(
            party.json.valueToTree(
                Map.of("rhythm", Map.of("id", id.toString(), "phase", "playing"))));
    party.rhythmStart("ana", id);
    return id;
  }

  @Test
  void acesAndFacesAndNatural() {
    assertEquals(21, PartyGames.total(List.of(0, 12)));
    assertEquals(12, PartyGames.total(List.of(0, 13)));
    assertEquals(21, PartyGames.total(List.of(0, 13, 8)));
    assertTrue(PartyGames.natural(List.of(0, 9)));
    assertFalse(PartyGames.natural(List.of(0, 4, 4)));
  }

  @Test
  void multiplayerLobbyRequiresReadyAndHost() {
    UUID id = create("blackjack");
    assertThrows(ResponseStatusException.class, () -> action("ana", id, "start"));
    action("bia", id, "join");
    assertThrows(ResponseStatusException.class, () -> action("bia", id, "start"));
    assertThrows(ResponseStatusException.class, () -> action("ana", id, "start"));
    action("bia", id, "ready");
    action("ana", id, "start");
    assertEquals("running", party.row(id).get("status"));
  }

  @Test
  void holeCardAndDeckAreNeverPublishedBeforeFinish() {
    UUID id = blackjack();
    var view = party.view(id, ana);
    assertEquals(1, ((List<?>) view.get("dealer")).size());
    assertEquals(true, view.get("dealerHidden"));
    assertFalse(view.containsKey("deck"));
    assertFalse(view.containsKey("cursor"));
    expire(id);
    assertEquals(false, party.view(id, ana).get("dealerHidden"));
  }

  @Test
  void repeatedHitOnlyDrawsOneCardAndStandingBlocksChanges() {
    UUID id = blackjack(), key = UUID.randomUUID();
    games.db.update(
        "update party_players set hand='[2,3]',standing=false where room_id=? and account_id=?",
        id,
        ana);
    party.action("ana", id, key, "hit", null);
    party.action("ana", id, key, "hit", null);
    assertEquals(
        3,
        party
            .hand(
                games.db.queryForObject(
                    "select hand from party_players where room_id=? and account_id=?",
                    String.class,
                    id,
                    ana))
            .size());
    action("ana", id, "stand");
    assertThrows(ResponseStatusException.class, () -> action("ana", id, "hit"));
  }

  @Test
  void deterministicBlackjackRewardsArePaidExactlyOnce() {
    UUID id = blackjack();
    games.db.update(
        "update party_players set hand='[0,9]',standing=true where room_id=? and account_id=?",
        id,
        ana);
    games.db.update(
        "update party_players set hand='[9,8]',standing=true where room_id=? and account_id=?",
        id,
        bia);
    var s = party.state(party.row(id));
    s.put("dealer", List.of(9, 6));
    party.save(id, s);
    party.advance();
    party.advance();
    assertEquals(30, games.roulette.balance(ana));
    assertEquals(20, games.roulette.balance(bia));
    assertEquals("finished", party.row(id).get("status"));
  }

  @Test
  void roomsAreMutuallyExclusiveWithRouletteAndHostTransfers() {
    UUID id = create("blackjack");
    assertThrows(
        ResponseStatusException.class, () -> games.create("ana", UUID.randomUUID(), false));
    action("bia", id, "join");
    action("ana", id, "leave");
    assertEquals(bia, party.row(id).get("host_id"));
  }

  @Test
  void missingVoiceOrBusyBotDoesNotMintRewards() {
    UUID id = create("rhythm");
    action("bia", id, "join");
    party.action("ana", id, UUID.randomUUID(), "ready", "invalid");
    party.action("bia", id, UUID.randomUUID(), "ready", "invalid");
    assertThrows(ResponseStatusException.class, () -> party.rhythmStart("ana", id));
    assertEquals(0, games.roulette.balance(ana));
  }

  @Test
  void serverJudgesRhythmAndDuplicateNotesCannotFarmCoins() throws Exception {
    UUID id = rhythm();
    assertThrows(ResponseStatusException.class, () -> party.note("ana", id, 0, 0));
    for (int n = 0; n < 3; n++) {
      games.db.update(
          "update party_rooms set starts_at=? where id=?",
          System.currentTimeMillis() - (2000 + n * 500) - 150,
          id);
      int score = party.note("ana", id, n, n % 4);
      assertEquals(100, score);
      assertEquals(100, party.note("ana", id, n, n % 4));
    }
    assertEquals(
        300,
        games.db.queryForObject(
            "select score from party_players where room_id=? and account_id=?",
            Integer.class,
            id,
            ana));
    when(bot.state())
        .thenReturn(
            party.json.valueToTree(
                Map.of("rhythm", Map.of("id", id.toString(), "phase", "finished"))));
    expire(id);
    party.advance();
    assertTrue(games.roulette.balance(ana) > 0);
    assertEquals(0, games.roulette.balance(bia));
    assertEquals(
        1,
        games.db.queryForObject(
            "select count(*) from coin_ledger where account_id=?", Integer.class, ana));
  }

  @Test
  void botFailureCancelsInsteadOfPayingAFakeShow() throws Exception {
    UUID id = rhythm();
    when(bot.state())
        .thenReturn(
            party.json.valueToTree(
                Map.of("rhythm", Map.of("id", id.toString(), "phase", "failed"))));
    party.advance();
    assertEquals("cancelled", party.row(id).get("status"));
    assertEquals(0, games.roulette.balance(ana));
    verify(bot).releaseRhythm(id.toString());
  }

  @Test
  void concurrentHitRetriesUseSingleTransaction() throws Exception {
    UUID id = blackjack(), key = UUID.randomUUID();
    games.db.update(
        "update party_players set hand='[2,3]',standing=false where room_id=? and account_id=?",
        id,
        ana);
    try (var pool = Executors.newFixedThreadPool(5)) {
      var tasks = new ArrayList<Callable<Void>>();
      for (int n = 0; n < 5; n++)
        tasks.add(
            () -> {
              party.action("ana", id, key, "hit", null);
              return null;
            });
      for (var r : pool.invokeAll(tasks)) r.get();
    }
    assertEquals(
        3,
        party
            .hand(
                games.db.queryForObject(
                    "select hand from party_players where room_id=? and account_id=?",
                    String.class,
                    id,
                    ana))
            .size());
  }

  @Test
  void rhythmReadyCannotUseAnotherPersonsVoiceIdentity() throws Exception {
    UUID room = create("rhythm");
    String other = voice(bia, "bia");
    var json = party.json;
    var csrf = mvc.perform(get("/api/csrf")).andReturn().getResponse();
    var cookie =
        mvc.perform(
                post("/api/login")
                    .cookie(csrf.getCookie("SESSION"))
                    .header(
                        "X-CSRF-TOKEN",
                        json.readTree(csrf.getContentAsString()).get("token").asText())
                    .param("username", "ana")
                    .param("password", "test-only-password-ana"))
            .andExpect(status().isNoContent())
            .andReturn()
            .getResponse()
            .getCookie("SESSION");
    var token =
        json.readTree(
                mvc.perform(get("/api/csrf").cookie(cookie))
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("token")
            .asText();
    mvc.perform(
            post("/api/party/" + room + "/ready")
                .cookie(cookie)
                .header("X-CSRF-TOKEN", token)
                .contentType("application/json")
                .content(
                    json.writeValueAsString(
                        Map.of("clientId", UUID.randomUUID(), "identity", other))))
        .andExpect(status().isForbidden());
    assertFalse(
        games.db.queryForObject(
            "select ready from party_players where room_id=? and account_id=?",
            Boolean.class,
            room,
            ana));
  }

  @Test
  void apiRequiresAuthenticationAndCsrf() throws Exception {
    mvc.perform(get("/api/party")).andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/party")
                .contentType("application/json")
                .content("{\"clientId\":\"" + UUID.randomUUID() + "\",\"kind\":\"blackjack\"}"))
        .andExpect(status().isForbidden());
  }
}
