package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.time.temporal.ChronoUnit;
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
class OutlookTest {
  @Autowired Outlook outlook;
  @Autowired Accounts accounts;
  @Autowired Games games;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @MockitoBean LiveKitGateway live;
  @MockitoBean MusicGateway bot;
  UUID ana, bia;
  Instant start;

  @BeforeEach
  void setup() {
    games.locked(
        () -> {
          games.db.execute("truncate accounts cascade");
          return null;
        });
    ana = accounts.create("ana", "Ana", "test-only-password-ana", false).id();
    bia = accounts.create("bia", "Bia", "test-only-password-bia", false).id();
    accounts.create("admin", "Admin", "test-only-password-admin", true);
    start = Instant.now().truncatedTo(ChronoUnit.MILLIS).plus(Duration.ofDays(2));
  }

  Outlook.Details details(String title) {
    return new Outlook.Details(
        title, "Minecraft", "Sala de estar", "Todo mundo junto", start, start.plusSeconds(7200));
  }

  List<Outlook.CalendarEvent> list(String user) {
    return outlook.list(user, start.minusSeconds(3600), start.plusSeconds(86400));
  }

  UUID create() {
    return outlook.create("ana", UUID.randomUUID(), details("Jogatina"));
  }

  @Test
  void everyoneCanCreateAndSeeSharedEventsAndCreatorStartsConfirmed() {
    UUID id = create();
    outlook.create("bia", UUID.randomUUID(), details("Co-op"));
    var events = list("bia");
    assertEquals(2, events.size());
    var event = events.stream().filter(e -> e.id().equals(id)).findFirst().orElseThrow();
    assertEquals(start, event.startsAt());
    assertEquals("Ana", event.creator());
    assertEquals(List.of(new Outlook.Attendee(ana, "Ana", "going")), event.attendees());
  }

  @Test
  void retryingCreationConcurrentlyDoesNotDuplicateTheEventOrPresence() throws Exception {
    UUID key = UUID.randomUUID();
    var ids = new HashSet<UUID>();
    try (var pool = Executors.newFixedThreadPool(4)) {
      var tasks = new ArrayList<Callable<UUID>>();
      for (int i = 0; i < 4; i++) tasks.add(() -> outlook.create("ana", key, details("Jogatina")));
      for (var result : pool.invokeAll(tasks)) ids.add(result.get());
    }
    assertThrows(
        ResponseStatusException.class, () -> outlook.create("ana", key, details("Outro evento")));
    assertEquals(1, ids.size());
    assertEquals(1, list("bia").size());
    assertEquals(1, list("bia").getFirst().attendees().size());
  }

  @Test
  void onlyCreatorOrAdminCanEditOrCancel() {
    UUID id = create();
    var denied =
        assertThrows(
            ResponseStatusException.class, () -> outlook.update("bia", id, 1, details("Alterado")));
    assertEquals(403, denied.getStatusCode().value());
    assertThrows(ResponseStatusException.class, () -> outlook.cancel("bia", id, 1));
    outlook.update("ana", id, 1, details("Atualizado"));
    assertEquals("Atualizado", list("bia").getFirst().title());
    outlook.cancel("admin", id, 2);
    assertTrue(list("ana").getFirst().cancelled());
  }

  @Test
  void staleEditsCannotOverwriteAnotherPersonsChanges() {
    UUID id = create();
    outlook.update("ana", id, 1, details("Versão nova"));
    var stale =
        assertThrows(
            ResponseStatusException.class,
            () -> outlook.update("admin", id, 1, details("Versão velha")));
    assertEquals(409, stale.getStatusCode().value());
    assertEquals("Versão nova", list("bia").getFirst().title());
  }

  @Test
  void responsesArePerPersonExplicitAndIdempotent() {
    UUID id = create();
    outlook.respond("bia", id, "going");
    outlook.respond("bia", id, "going");
    assertEquals(2, list("ana").getFirst().attendees().size());
    outlook.respond("bia", id, "maybe");
    outlook.respond("bia", id, "declined");
    assertEquals(
        "declined",
        list("ana").getFirst().attendees().stream()
            .filter(a -> a.id().equals(bia))
            .findFirst()
            .orElseThrow()
            .response());
    assertThrows(ResponseStatusException.class, () -> outlook.respond("bia", id, "invalid"));
    assertEquals(
        "going",
        list("ana").getFirst().attendees().stream()
            .filter(a -> a.id().equals(ana))
            .findFirst()
            .orElseThrow()
            .response());
  }

  @Test
  void cancelledEventsStayVisibleAndRejectResponsesOrEdits() {
    UUID id = create();
    outlook.cancel("ana", id, 1);
    outlook.cancel("ana", id, 1);
    assertTrue(list("bia").getFirst().cancelled());
    assertEquals(2, list("ana").getFirst().version());
    assertThrows(ResponseStatusException.class, () -> outlook.respond("bia", id, "going"));
    assertThrows(
        ResponseStatusException.class, () -> outlook.update("ana", id, 2, details("Reabrir")));
  }

  @Test
  void invalidDatesAndOversizedTextAreRejected() {
    assertThrows(
        ResponseStatusException.class,
        () ->
            outlook.create(
                "ana", UUID.randomUUID(), new Outlook.Details("Evento", "", "", "", start, start)));
    assertThrows(
        ResponseStatusException.class,
        () ->
            outlook.create(
                "ana",
                UUID.randomUUID(),
                new Outlook.Details(
                    "Evento", "", "", "", start, start.plus(Duration.ofHours(49)))));
    assertThrows(
        ResponseStatusException.class,
        () -> outlook.create("ana", UUID.randomUUID(), details(" ")));
    assertThrows(
        ResponseStatusException.class,
        () -> outlook.create("ana", UUID.randomUUID(), details("x".repeat(121))));
    assertThrows(
        ResponseStatusException.class,
        () -> outlook.list("ana", start, start.plus(Duration.ofDays(64))));
    assertTrue(list("ana").isEmpty());
  }

  @Test
  void ongoingEventsCanUpdateDetailsWithoutMovingTheirStart() {
    UUID id = create();
    Instant earlier = Instant.now().minusSeconds(3600).truncatedTo(ChronoUnit.MILLIS);
    games.db.update(
        "update outlook_events set starts_at=?,ends_at=? where id=?",
        java.sql.Timestamp.from(earlier),
        java.sql.Timestamp.from(earlier.plusSeconds(7200)),
        id);
    outlook.update(
        "ana",
        id,
        1,
        new Outlook.Details(
            "Novo local", "Minecraft", "Outra sala", "", earlier, earlier.plusSeconds(7200)));
    assertEquals("Outra sala", outlook.event(id).location());
    assertThrows(
        ResponseStatusException.class,
        () ->
            outlook.create(
                "bia",
                UUID.randomUUID(),
                new Outlook.Details("Passado", "", "", "", earlier, earlier.plusSeconds(7200))));
  }

  @Test
  void overnightEventsAppearOnBothDaysUsingHalfOpenRanges() {
    Instant midnight =
        LocalDate.now(ZoneOffset.UTC).plusDays(3).atStartOfDay().toInstant(ZoneOffset.UTC);
    outlook.create(
        "ana",
        UUID.randomUUID(),
        new Outlook.Details(
            "Madrugada", "", "", "", midnight.minusSeconds(1800), midnight.plusSeconds(3600)));
    assertEquals(1, outlook.list("bia", midnight.minusSeconds(86400), midnight).size());
    assertEquals(1, outlook.list("bia", midnight, midnight.plusSeconds(86400)).size());
    assertTrue(
        outlook.list("bia", midnight.plusSeconds(3600), midnight.plusSeconds(86400)).isEmpty());
  }

  @Test
  void disabledAccountsCannotReadOrCreate() {
    games.db.update("update accounts set enabled=false where id=?", bia);
    assertThrows(ResponseStatusException.class, () -> list("bia"));
    assertThrows(
        ResponseStatusException.class,
        () -> outlook.create("bia", UUID.randomUUID(), details("Evento")));
  }

  record Login(Cookie cookie, String token) {}

  Login login(String name) throws Exception {
    var csrf = mvc.perform(get("/api/csrf")).andReturn().getResponse();
    var response =
        mvc.perform(
                post("/api/login")
                    .cookie(csrf.getCookie("SESSION"))
                    .header(
                        "X-CSRF-TOKEN",
                        json.readTree(csrf.getContentAsString()).get("token").asText())
                    .param("username", name)
                    .param("password", "test-only-password-" + name))
            .andExpect(status().isNoContent())
            .andReturn()
            .getResponse();
    var cookie = response.getCookie("SESSION");
    var token =
        json.readTree(
                mvc.perform(get("/api/csrf").cookie(cookie))
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("token")
            .asText();
    return new Login(cookie, token);
  }

  @Test
  void apiEnforcesSessionCsrfPermissionsAndValidatesDates() throws Exception {
    mvc.perform(
            get("/api/outlook")
                .param("from", start.toString())
                .param("to", start.plusSeconds(86400).toString()))
        .andExpect(status().isUnauthorized());
    var a = login("ana");
    String body = json.writeValueAsString(new OutlookApi.Create(UUID.randomUUID(), details("API")));
    mvc.perform(
            post("/api/outlook").cookie(a.cookie()).contentType("application/json").content(body))
        .andExpect(status().isForbidden());
    var result =
        mvc.perform(
                post("/api/outlook")
                    .cookie(a.cookie())
                    .header("X-CSRF-TOKEN", a.token())
                    .contentType("application/json")
                    .content(body))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    var id = json.readTree(result.getContentAsString()).get("id").asText();
    var b = login("bia");
    mvc.perform(
            get("/api/outlook")
                .cookie(b.cookie())
                .param("from", start.minusSeconds(60).toString())
                .param("to", start.plusSeconds(86400).toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].title").value("API"));
    mvc.perform(
            put("/api/outlook/" + id)
                .cookie(b.cookie())
                .header("X-CSRF-TOKEN", b.token())
                .contentType("application/json")
                .content(json.writeValueAsString(new OutlookApi.Edit(1, details("Tentativa")))))
        .andExpect(status().isForbidden());
    mvc.perform(
            get("/api/outlook")
                .cookie(b.cookie())
                .param("from", "invalid")
                .param("to", start.toString()))
        .andExpect(status().isBadRequest());
  }
}
