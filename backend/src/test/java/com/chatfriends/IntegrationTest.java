package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import livekit.LivekitModels.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(
    properties = {
      "app.reconcile-initial-delay=600000",
      "app.mfa-key=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    })
@AutoConfigureMockMvc
class IntegrationTest {
  @Autowired Accounts accounts;
  @Autowired Chat chat;
  @Autowired Media media;
  @Autowired MockMvc mvc;
  @MockitoBean LiveKitGateway live;
  @Autowired Events events;
  @Autowired Mfa mfa;
  @Autowired RequestBudget requestBudget;
  final Map<String, org.springframework.test.web.servlet.request.RequestPostProcessor>
      profileLogins = new HashMap<>();

  @BeforeEach
  void setup() {
    profileLogins.clear();
    media.invalidateState();
    synchronized (requestBudget) {
      ((Map<?, ?>)
              org.springframework.test.util.ReflectionTestUtils.getField(requestBudget, "buckets"))
          .clear();
    }
    accounts.db.execute(
        "TRUNCATE messages,media_connections,accounts,rate_limits,spring_session CASCADE");
    accounts.db.execute("UPDATE screen_lease SET identity=NULL,lease_id=NULL,expires_at=NULL");
    accounts.create("ana", "Ana", "test-only-password-ana", false);
    accounts.create("bia", "Bia", "test-only-password-bia", false);
    when(live.participants()).thenReturn(List.of());
  }

  @Test
  void anonymousCannotReadHistoryOrMintMedia() throws Exception {
    mvc.perform(get("/api/messages")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/media/join")).andExpect(status().isForbidden());
    mvc.perform(get("/ws")).andExpect(status().isUnauthorized());
  }

  @Test
  void csrfRequiredForLogin() throws Exception {
    mvc.perform(
            post("/api/login").param("username", "ana").param("password", "test-only-password-ana"))
        .andExpect(status().isForbidden());
  }

  @Test
  void idempotencyAndCursor() {
    UUID id = UUID.randomUUID();
    var first = chat.send("ana", id, "<script>alert(1)</script>");
    assertEquals(first.id(), chat.send("ana", id, first.body()).id());
    assertThrows(ResponseStatusException.class, () -> chat.send("ana", id, "changed"));
    var next = chat.send("bia", UUID.randomUUID(), "segundo");
    assertEquals(List.of(next), chat.history(null, first.id()));
    assertEquals(List.of(first), chat.history(next.id(), null));
    assertEquals(2, accounts.db.queryForObject("select count(*) from messages", Integer.class));
  }

  @Test
  void duplicateSendRaceCommitsOnce() throws Exception {
    UUID id = UUID.randomUUID();
    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      var gate = new CountDownLatch(1);
      List<Future<Chat.Message>> requests = new ArrayList<>();
      for (int i = 0; i < 8; i++)
        requests.add(
            pool.submit(
                () -> {
                  gate.await();
                  return chat.send("ana", id, "olá");
                }));
      gate.countDown();
      Set<Long> ids = new HashSet<>();
      for (var f : requests) ids.add(f.get(10, TimeUnit.SECONDS).id());
      assertEquals(1, ids.size());
    }
  }

  @Test
  void validationAndRateLimit() {
    assertThrows(ResponseStatusException.class, () -> chat.send("ana", UUID.randomUUID(), " "));
    assertThrows(
        ResponseStatusException.class, () -> chat.send("ana", UUID.randomUUID(), "x".repeat(4001)));
    for (int i = 0; i < 20; i++) chat.send("ana", UUID.randomUUID(), "m" + i);
    assertEquals(
        429,
        assertThrows(
                ResponseStatusException.class, () -> chat.send("ana", UUID.randomUUID(), "limite"))
            .getStatusCode()
            .value());
  }

  MockHttpServletRequest connection(String name, String identity) {
    var request = new MockHttpServletRequest();
    var session = new MockHttpSession();
    request.setSession(session);
    long now = System.currentTimeMillis();
    accounts.db.update(
        "insert into spring_session values(?,?,?,?,?,?,?)",
        UUID.randomUUID().toString(),
        session.getId(),
        now,
        now,
        3600,
        now + 3600000,
        name);
    accounts.db.update(
        "insert into media_connections(identity,account_id,session_id,expires_at)"
            + " values(?,?,?,now()+interval '45 seconds')",
        identity,
        accounts.get(name).id(),
        session.getId());
    return request;
  }

  ParticipantInfo participant(String id, boolean screen) {
    var permission =
        ParticipantPermission.newBuilder()
            .setCanPublish(true)
            .setCanSubscribe(true)
            .addCanPublishSources(TrackSource.MICROPHONE);
    if (screen) permission.addCanPublishSources(TrackSource.SCREEN_SHARE);
    return ParticipantInfo.newBuilder()
        .setIdentity(id)
        .setName(id)
        .setPermission(permission)
        .build();
  }

  @Test
  void audioPreferencesBelongToTheConnectionSessionAndDoNotChangePermissions() {
    var ana = connection("ana", "ana-audio");
    var otherTab = connection("ana", "ana-other");
    var bia = connection("bia", "bia-audio");
    when(live.participants())
        .thenReturn(
            List.of(
                participant("ana-audio", false).toBuilder()
                    .addTracks(
                        TrackInfo.newBuilder().setSource(TrackSource.MICROPHONE).setMuted(true))
                    .build(),
                participant("bia-audio", false).toBuilder()
                    .addTracks(
                        TrackInfo.newBuilder().setSource(TrackSource.MICROPHONE).setMuted(false))
                    .build()));
    media.audio(() -> "ana", ana, new Media.AudioPreferences("ana-audio", true));
    var people = (List<?>) media.state().get("participants");
    assertTrue(
        people.contains(
            Map.of("identity", "ana-audio", "name", "ana-audio", "micMuted", true, "deaf", true)));
    assertTrue(
        people.contains(
            Map.of(
                "identity", "bia-audio", "name", "bia-audio", "micMuted", false, "deaf", false)));
    assertEquals(
        403,
        assertThrows(
                ResponseStatusException.class,
                () -> media.audio(() -> "bia", bia, new Media.AudioPreferences("ana-audio", false)))
            .getStatusCode()
            .value());
    assertEquals(
        403,
        assertThrows(
                ResponseStatusException.class,
                () ->
                    media.audio(
                        () -> "ana", otherTab, new Media.AudioPreferences("ana-audio", false)))
            .getStatusCode()
            .value());
    media.audio(() -> "ana", ana, new Media.AudioPreferences("ana-audio", false));
    assertFalse(
        accounts.db.queryForObject(
            "select deaf from media_connections where identity='ana-audio'", Boolean.class));
    accounts.db.update(
        "update media_connections set expires_at=now()-interval '1 second' where"
            + " identity='ana-audio'");
    assertEquals(
        409,
        assertThrows(
                ResponseStatusException.class,
                () -> media.audio(() -> "ana", ana, new Media.AudioPreferences("ana-audio", true)))
            .getStatusCode()
            .value());
    verify(live, never()).permission(anyString(), anyBoolean());
  }

  @Test
  void screenCapabilitiesSupportFullHdAndClampUnsafeValues() {
    var request = connection("ana", "previous-tab");
    when(live.token(anyString(), anyString())).thenReturn("test-only-token");
    org.springframework.test.util.ReflectionTestUtils.setField(
        live, "publicUrl", "ws://localhost:8080");
    media.height = 1080;
    media.bitrate = 8000000;
    media.fps = 60;
    assertEquals(
        Map.of("height", 1080, "bitrate", 8000000, "fps", 60),
        media.join(() -> "ana", request).get("screen"));
    media.leave(() -> "ana", request, new Media.Connection("previous-tab"));
    media.height = 9000;
    media.bitrate = Integer.MAX_VALUE;
    media.fps = 120;
    assertEquals(
        Map.of("height", 1080, "bitrate", 8000000, "fps", 60),
        media.join(() -> "ana", request).get("screen"));
  }

  @Test
  void simultaneousReservationsAuthorizeOneScreen() throws Exception {
    var ana = connection("ana", "ana-tab");
    var bia = connection("bia", "bia-tab");
    when(live.participants())
        .thenReturn(List.of(participant("ana-tab", false), participant("bia-tab", false)));
    var successes = new AtomicInteger();
    var conflicts = new AtomicInteger();
    var gate = new CountDownLatch(1);
    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      var a =
          pool.submit(
              () -> {
                gate.await();
                reserve("ana", ana, "ana-tab", successes, conflicts);
                return null;
              });
      var b =
          pool.submit(
              () -> {
                gate.await();
                reserve("bia", bia, "bia-tab", successes, conflicts);
                return null;
              });
      gate.countDown();
      a.get(10, TimeUnit.SECONDS);
      b.get(10, TimeUnit.SECONDS);
    }
    assertEquals(1, successes.get());
    assertEquals(1, conflicts.get());
    verify(live, times(1)).permission(anyString(), eq(true));
  }

  void reserve(
      String user,
      MockHttpServletRequest req,
      String id,
      AtomicInteger successes,
      AtomicInteger conflicts) {
    try {
      media.acquire(() -> user, req, new Media.Connection(id));
      successes.incrementAndGet();
    } catch (ResponseStatusException e) {
      assertEquals(409, e.getStatusCode().value());
      conflicts.incrementAndGet();
    }
  }

  @Test
  void expiryRevokesBeforeNextGrant() {
    var a = connection("ana", "a");
    var b = connection("bia", "b");
    when(live.participants()).thenReturn(List.of(participant("a", false), participant("b", false)));
    var old = media.acquire(() -> "ana", a, new Media.Connection("a"));
    accounts.db.update("update screen_lease set expires_at=now()-interval '1 second'");
    when(live.participants()).thenReturn(List.of(participant("a", true), participant("b", false)));
    var next = media.acquire(() -> "bia", b, new Media.Connection("b"));
    assertNotEquals(old.leaseId(), next.leaseId());
    var order = inOrder(live);
    order.verify(live).permission("a", true);
    order.verify(live, atLeastOnce()).permission("a", false);
    order.verify(live).permission("b", true);
    media.release(() -> "ana", a, new Media.Renew("a", old.leaseId()));
    assertEquals("b", media.lease().identity());
  }

  @Test
  void failureToRevokeBlocksHandover() {
    var a = connection("ana", "a");
    var b = connection("bia", "b");
    when(live.participants()).thenReturn(List.of(participant("a", false), participant("b", false)));
    media.acquire(() -> "ana", a, new Media.Connection("a"));
    accounts.db.update("update screen_lease set expires_at=now()-interval '1 second'");
    doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE))
        .when(live)
        .permission("a", false);
    assertThrows(
        ResponseStatusException.class,
        () -> media.acquire(() -> "bia", b, new Media.Connection("b")));
    verify(live, never()).permission("b", true);
  }

  @Test
  void disabledAccountAndMissingSessionAreRemoved() {
    connection("ana", "a");
    when(live.participants()).thenReturn(List.of(participant("a", false)));
    accounts.db.update("update accounts set enabled=false where username='ana'");
    media.reconcile();
    verify(live).remove("a");
    assertThrows(ResponseStatusException.class, () -> chat.send("ana", UUID.randomUUID(), "não"));
  }

  @Test
  void staleElevatedPermissionIsReconciledAfterRestart() {
    connection("ana", "a");
    when(live.participants()).thenReturn(List.of(participant("a", true)));
    media.reconcile();
    media.reconcile();
    verify(live, times(2)).permission("a", false);
    assertNull(media.lease().identity());
  }

  @Test
  void tokenSourcesAndWebhookSignature() {
    var gateway =
        new LiveKitGateway(
            "http://localhost:7880",
            "test-key",
            "test-secret-only-not-a-real-credential-123",
            "amigos",
            "ws://localhost:7880");
    var token = com.auth0.jwt.JWT.decode(gateway.token("identity", "Ana"));
    assertEquals("identity", token.getSubject());
    var video = token.getClaim("video").asMap();
    assertEquals("amigos", video.get("room"));
    assertEquals(List.of("microphone"), video.get("canPublishSources"));
    assertEquals(false, video.get("canPublishData"));
    assertTrue(token.getExpiresAtAsInstant().isBefore(java.time.Instant.now().plusSeconds(100)));
    assertThrows(ResponseStatusException.class, () -> gateway.verifyWebhook("{}", "invalid"));
  }

  @Test
  void admissionStripsReplayedScreenGrantAndRejectsDisabledSession() {
    connection("ana", "replayed");
    var gateway =
        new LiveKitGateway(
            "http://localhost:7880",
            "test-key",
            "test-secret-only-not-a-real-credential-123",
            "amigos",
            "ws://localhost:8080");
    var admission = new MediaAdmission(gateway, media, accounts);
    var elevated = new io.livekit.server.AccessToken(gateway.key, gateway.secret);
    elevated.setIdentity("replayed");
    elevated.setTtl(90000);
    elevated.addGrants(
        new io.livekit.server.RoomJoin(true),
        new io.livekit.server.RoomName("amigos"),
        new io.livekit.server.CanPublishSources(
            List.of("microphone", "screen_share", "screen_share_audio")));
    var clean = com.auth0.jwt.JWT.decode(admission.downscope(elevated.toJwt()));
    assertEquals(List.of("microphone"), clean.getClaim("video").asMap().get("canPublishSources"));
    accounts.invalidate("ana");
    assertThrows(ResponseStatusException.class, () -> admission.downscope(elevated.toJwt()));
  }

  @Test
  void admissionRejectsOtherRoomAndInvalidSignature() {
    connection("ana", "a");
    var gateway =
        new LiveKitGateway(
            "http://localhost:7880",
            "key",
            "test-only-secret-at-least-32-characters",
            "amigos",
            "ws://localhost:8080");
    var admission = new MediaAdmission(gateway, media, accounts);
    var t = new io.livekit.server.AccessToken(gateway.key, gateway.secret);
    t.setIdentity("a");
    t.addGrants(new io.livekit.server.RoomJoin(true), new io.livekit.server.RoomName("other"));
    assertThrows(ResponseStatusException.class, () -> admission.downscope(t.toJwt()));
    assertThrows(ResponseStatusException.class, () -> admission.downscope("invalid"));
  }

  @Test
  void webhookAuthenticatesBodyAndRejectsTampering() throws Exception {
    var gateway =
        new LiveKitGateway(
            "http://localhost:7880",
            "key",
            "test-only-secret-at-least-32-characters",
            "amigos",
            "ws://localhost:8080");
    String body = "{}";
    var t = new io.livekit.server.AccessToken(gateway.key, gateway.secret);
    t.setSha256(
        Base64.getEncoder()
            .encodeToString(
                java.security.MessageDigest.getInstance("SHA-256")
                    .digest(body.getBytes(java.nio.charset.StandardCharsets.UTF_8))));
    t.setTtl(90000);
    gateway.verifyWebhook(body, t.toJwt());
    gateway.verifyWebhook(body, t.toJwt());
    assertThrows(ResponseStatusException.class, () -> gateway.verifyWebhook("{ }", t.toJwt()));
  }

  @Test
  void nonAdminCannotManageAccountsAndDisabledCannotRead() throws Exception {
    var cookie = loginCookie("ana", "test-only-password-ana");
    mvc.perform(get("/api/admin/accounts").cookie(cookie)).andExpect(status().isForbidden());
    accounts.db.update("update accounts set enabled=false where username='ana'");
    mvc.perform(get("/api/messages").cookie(cookie)).andExpect(status().isUnauthorized());
  }

  jakarta.servlet.http.Cookie loginCookie(String user, String password) throws Exception {
    var csrf = mvc.perform(get("/api/csrf")).andExpect(status().isOk()).andReturn().getResponse();
    String token =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(csrf.getContentAsString())
            .get("token")
            .asText();
    var login =
        mvc.perform(
                post("/api/login")
                    .cookie(csrf.getCookie("SESSION"))
                    .header("X-CSRF-TOKEN", token)
                    .param("username", user)
                    .param("password", password))
            .andExpect(status().isNoContent())
            .andReturn()
            .getResponse();
    return login.getCookie("SESSION");
  }

  MockHttpSession authSession() {
    var s = new MockHttpSession();
    s.setAttribute(SessionSecurity.ISSUED, System.currentTimeMillis());
    s.setAttribute(SessionSecurity.REAUTH, System.currentTimeMillis());
    return s;
  }

  @Test
  void replayDoesNotBroadcastAgain() throws Exception {
    var socket = mock(org.springframework.web.socket.WebSocketSession.class);
    when(socket.getId()).thenReturn("replay-test");
    when(socket.getPrincipal()).thenReturn(() -> "ana");
    events.sockets.put(socket.getId(), socket);
    try {
      var id = UUID.randomUUID();
      for (int i = 0; i < 6; i++) chat.send("ana", id, "same");
      verify(socket, times(1)).sendMessage(any());
    } finally {
      events.sockets.remove(socket.getId());
    }
  }

  @Test
  void expiredHeartbeatCannotReviveConnection() {
    var q = connection("ana", "expired");
    accounts.db.update(
        "update media_connections set expires_at=now()-interval '1 second' where"
            + " identity='expired'");
    assertEquals(
        409,
        assertThrows(
                ResponseStatusException.class,
                () -> media.heartbeat(() -> "ana", q, new Media.Connection("expired")))
            .getStatusCode()
            .value());
    assertFalse(media.validConnection("expired"));
  }

  @Test
  void websocketQuotaRejectsFifthSocket() throws Exception {
    List<org.springframework.web.socket.WebSocketSession> opened = new ArrayList<>();
    try {
      for (int i = 0; i < 5; i++) {
        var s = mock(org.springframework.web.socket.WebSocketSession.class);
        when(s.getId()).thenReturn("quota-" + i);
        when(s.getPrincipal()).thenReturn(() -> "ana");
        opened.add(s);
        events.afterConnectionEstablished(s);
      }
      verify(opened.get(4)).close(org.springframework.web.socket.CloseStatus.POLICY_VIOLATION);
      assertEquals(4, events.sockets.size());
    } finally {
      for (var s : opened)
        events.afterConnectionClosed(s, org.springframework.web.socket.CloseStatus.NORMAL);
    }
  }

  @Test
  void mfaEncryptsSecretsRejectsReplayAndConsumesRecovery() {
    String secret = mfa.generate();
    long now = java.time.Instant.now().getEpochSecond() / 30;
    String code = Mfa.totp(secret, now);
    var recovery = mfa.enroll("ana", secret, code);
    assertEquals(8, recovery.size());
    String stored =
        accounts.db.queryForObject(
            "select secret from account_mfa where account_id=?",
            String.class,
            accounts.get("ana").id());
    assertNotEquals(secret, stored);
    assertThrows(ResponseStatusException.class, () -> mfa.verify("ana", code));
    mfa.verify("ana", recovery.getFirst());
    assertThrows(ResponseStatusException.class, () -> mfa.verify("ana", recovery.getFirst()));
    assertEquals(7, accounts.db.queryForObject("select count(*) from mfa_recovery", Integer.class));
  }

  @Test
  void absoluteSessionExpiresDespiteRecentAccess() throws Exception {
    var session = authSession();
    session.setAttribute(SessionSecurity.ISSUED, System.currentTimeMillis() - 28801000L);
    var q = new MockHttpServletRequest("GET", "/api/me");
    q.setSession(session);
    var response = new org.springframework.mock.web.MockHttpServletResponse();
    assertFalse(new SessionSecurity(accounts, mfa, false, 28800).authorize(q, response, "ana"));
    assertEquals(401, response.getStatus());
  }

  @Test
  void passwordLoginWithMfaCannotReadBeforeSecondFactorAndRotatesSession() throws Exception {
    String secret = mfa.generate();
    var codes =
        mfa.enroll("ana", secret, Mfa.totp(secret, java.time.Instant.now().getEpochSecond() / 30));
    var cookie = loginCookie("ana", "test-only-password-ana");
    mvc.perform(get("/api/me").cookie(cookie))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.security.mfaPending").value(true));
    mvc.perform(get("/api/messages").cookie(cookie)).andExpect(status().isForbidden());
    var csrf = mvc.perform(get("/api/csrf").cookie(cookie)).andReturn().getResponse();
    String token =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(csrf.getContentAsString())
            .get("token")
            .asText();
    var verified =
        mvc.perform(
                post("/api/security/mfa/verify")
                    .cookie(cookie)
                    .header("X-CSRF-TOKEN", token)
                    .contentType("application/json")
                    .content("{\"code\":\"" + codes.getFirst() + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    var rotated = verified.getCookie("SESSION");
    assertNotNull(rotated);
    assertNotEquals(cookie.getValue(), rotated.getValue());
    mvc.perform(get("/api/messages").cookie(cookie)).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/messages").cookie(rotated)).andExpect(status().isOk());
  }

  @Test
  void leftParticipantDoesNotHoldTheAccountQuotaAndDelayedEventCannotKickActiveOne() {
    connection("ana", "left");
    when(live.participants()).thenReturn(List.of(participant("left", false)));
    media.reconcile();
    assertTrue(media.validConnection("left"));
    media.departed("left");
    assertTrue(media.validConnection("left"));
    when(live.participants()).thenReturn(List.of());
    media.reconcile();
    assertFalse(media.validConnection("left"));
    var q = connection("ana", "fast-left");
    media.departed("fast-left");
    assertFalse(media.validConnection("fast-left"));
  }

  @Test
  void anonymousSessionBudgetPrecedesJdbcCreationEvenWithSpoofedHeaders() throws Exception {
    int allowed = 0;
    for (int i = 0; i < 60; i++) {
      final int attempt = i;
      var result =
          mvc.perform(
                  get("/api/csrf")
                      .with(
                          q -> {
                            q.setRemoteAddr("203.0.113.254");
                            q.addHeader("X-Forwarded-For", "192.0.2." + attempt);
                            q.addHeader("X-Chat-Client-IP", "192.0.2." + attempt);
                            return q;
                          }))
              .andReturn()
              .getResponse();
      if (result.getStatus() == 200) allowed++;
      else assertEquals(429, result.getStatus());
    }
    assertEquals(40, allowed);
    assertEquals(
        40, accounts.db.queryForObject("select count(*) from spring_session", Integer.class));
  }

  @Test
  void enrollmentSecretIsEncryptedEvenWhilePendingAndConfirmationRotatesSession() throws Exception {
    var cookie = loginCookie("ana", "test-only-password-ana");
    var csrf = mvc.perform(get("/api/csrf").cookie(cookie)).andReturn().getResponse();
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    String token = json.readTree(csrf.getContentAsString()).get("token").asText();
    var setup =
        mvc.perform(
                post("/api/security/mfa/setup")
                    .cookie(cookie)
                    .header("X-CSRF-TOKEN", token)
                    .contentType("application/json")
                    .content("{\"password\":\"test-only-password-ana\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    String secret = json.readTree(setup.getContentAsString()).get("secret").asText();
    var stored =
        accounts.db.queryForObject(
            "select attribute_bytes from spring_session_attributes where"
                + " attribute_name='mfa.pending'",
            byte[].class);
    assertFalse(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1).contains(secret));
    String code = Mfa.totp(secret, java.time.Instant.now().getEpochSecond() / 30);
    var confirmed =
        mvc.perform(
                post("/api/security/mfa/confirm")
                    .cookie(cookie)
                    .header("X-CSRF-TOKEN", token)
                    .contentType("application/json")
                    .content("{\"code\":\"" + code + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recoveryCodes.length()").value(8))
            .andReturn()
            .getResponse();
    var rotated = confirmed.getCookie("SESSION");
    assertNotNull(rotated);
    assertNotEquals(cookie.getValue(), rotated.getValue());
    mvc.perform(get("/api/messages").cookie(cookie)).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/messages").cookie(rotated)).andExpect(status().isOk());
  }

  org.springframework.test.web.servlet.request.RequestPostProcessor as(String name)
      throws Exception {
    if (profileLogins.containsKey(name)) return profileLogins.get(name);
    var cookie = loginCookie(name, "test-only-password-" + name);
    var response =
        mvc.perform(get("/api/csrf").cookie(cookie))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    String token =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(response.getContentAsString())
            .get("token")
            .asText();
    org.springframework.test.web.servlet.request.RequestPostProcessor authenticated =
        request -> {
          request.setCookies(cookie);
          request.addHeader("X-CSRF-TOKEN", token);
          return request;
        };
    profileLogins.put(name, authenticated);
    return authenticated;
  }

  @Test
  void profileChangesNameColorsAndAvatar() throws Exception {
    mvc.perform(
            patch("/api/profile")
                .with(as("ana"))
                .contentType("application/json")
                .content(
                    "{\"displayName\":\"Ana Clara\",\"primaryColor\":\"#FF8800\","
                        + "\"secondaryColor\":\"#22c55e\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.signedOut").value(false))
        .andExpect(jsonPath("$.user.primaryColor").value("#ff8800"));
    var ana = accounts.get("ana");
    assertEquals("Ana Clara", ana.displayName());
    assertEquals("#22c55e", ana.secondaryColor());
    for (String body :
        new String[] {
          "{\"primaryColor\":\"red\"}", "{\"displayName\":\" \"}", "{\"username\":\"Ana!\"}"
        })
      mvc.perform(
              patch("/api/profile").with(as("ana")).contentType("application/json").content(body))
          .andExpect(status().isBadRequest());
    mvc.perform(
            patch("/api/profile")
                .with(as("ana"))
                .contentType("application/json")
                .content("{\"primaryColor\":\"\"}"))
        .andExpect(status().isOk());
    assertNull(accounts.get("ana").primaryColor());

    byte[] webp = new byte[64];
    System.arraycopy("RIFF".getBytes(), 0, webp, 0, 4);
    System.arraycopy("WEBP".getBytes(), 0, webp, 8, 4);
    mvc.perform(post("/api/profile/avatar").contentType("image/webp").content(webp))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/profile/avatar").with(as("ana")).contentType("image/png").content(webp))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/profile/avatar")
                .with(as("ana"))
                .contentType("image/svg+xml")
                .content("<svg/>"))
        .andExpect(status().isUnsupportedMediaType());
    mvc.perform(
            post("/api/profile/avatar")
                .with(as("ana"))
                .contentType("image/webp")
                .content(new byte[16001]))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/profile/avatar").with(as("ana")).contentType("image/webp").content(webp))
        .andExpect(status().isOk());
    var id = accounts.get("ana").id();
    assertNotNull(accounts.get("ana").avatarVersion());
    mvc.perform(get("/api/avatars/" + id).with(as("bia")))
        .andExpect(status().isOk())
        .andExpect(content().contentType("image/webp"))
        .andExpect(content().bytes(webp));
    mvc.perform(get("/api/avatars/" + id)).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/members").with(as("bia")))
        .andExpect(jsonPath("$[?(@.username=='ana')].avatarVersion").isNotEmpty())
        .andExpect(jsonPath("$[0].admin").doesNotExist());
    mvc.perform(delete("/api/profile/avatar").with(as("ana"))).andExpect(status().isOk());
    mvc.perform(get("/api/avatars/" + id).with(as("bia"))).andExpect(status().isNotFound());
  }

  @Test
  void usernameChangeIsUniqueAndSignsOut() throws Exception {
    connection("ana", accounts.get("ana").id() + ":tab");
    mvc.perform(
            patch("/api/profile")
                .with(as("ana"))
                .contentType("application/json")
                .content("{\"username\":\"bia\"}"))
        .andExpect(status().isConflict());
    assertEquals("ana", accounts.get("ana").username());
    mvc.perform(
            patch("/api/profile")
                .with(as("ana"))
                .contentType("application/json")
                .content("{\"username\":\"ana.nova\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.signedOut").value(true));
    assertEquals("Ana", accounts.get("ana.nova").displayName());
    assertEquals(
        0,
        accounts.db.queryForObject(
            "select count(*) from spring_session where principal_name='ana'", Integer.class));
    assertThrows(ResponseStatusException.class, () -> accounts.get("ana"));
  }
}
