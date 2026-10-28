package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

class RequestGuardTest {
  @Test
  void spoofedForwardedIdentityIsIgnored() {
    var q = new MockHttpServletRequest();
    q.setRemoteAddr("192.0.2.5");
    q.addHeader("X-Forwarded-For", "203.0.113.50");
    q.addHeader("X-Chat-Client-IP", "203.0.113.50");
    q.addHeader("X-Chat-Proxy-Key", "wrong");
    assertEquals("192.0.2.5", RequestGuard.identity(q, "private-proxy-key"));
    q.removeHeader("X-Chat-Proxy-Key");
    q.addHeader("X-Chat-Proxy-Key", "private-proxy-key");
    assertEquals("203.0.113.50", RequestGuard.identity(q, "private-proxy-key"));
  }

  @Test
  void deniedAnonymousRequestsNeverCreateSessions() throws Exception {
    var guard = new RequestGuard(new RequestBudget(), "");
    int accepted = 0;
    for (int i = 0; i < 100; i++) {
      var q = new MockHttpServletRequest("GET", "/api/csrf");
      q.setRemoteAddr("192.0.2.1");
      q.addHeader("X-Forwarded-For", "203.0.113." + i);
      var s = new MockHttpServletResponse();
      var reached = new AtomicBoolean();
      guard.doFilter(
          q,
          s,
          (request, response) -> {
            reached.set(true);
            request.getServletContext();
          });
      if (reached.get()) accepted++;
      else {
        assertEquals(429, s.getStatus());
        assertNull(q.getSession(false));
      }
    }
    assertEquals(40, accepted);
  }

  @Test
  void distinctClientsHaveIndependentSessionBudgets() throws Exception {
    var guard = new RequestGuard(new RequestBudget(), "proxy");
    for (int i = 0; i < 10; i++) {
      var q = new MockHttpServletRequest("GET", "/api/csrf");
      q.addHeader("X-Chat-Proxy-Key", "proxy");
      q.addHeader("X-Chat-Client-IP", "203.0.113." + i);
      var s = new MockHttpServletResponse();
      guard.doFilter(q, s, (a, b) -> b.getWriter().write("ok"));
      assertEquals("ok", s.getContentAsString());
    }
  }

  @Test
  void chunkedBodyIsBoundedBeforeApplication() throws Exception {
    var guard = new RequestGuard(new RequestBudget(), "");
    var q =
        new MockHttpServletRequest("POST", "/api/messages") {
          @Override
          public long getContentLengthLong() {
            return -1;
          }
        };
    q.setContentType("application/json");
    q.setContent(new byte[16385]);
    var s = new MockHttpServletResponse();
    guard.doFilter(q, s, (a, b) -> fail("oversized request reached application"));
    assertEquals(413, s.getStatus());
  }

  @Test
  void cardinalityIsBounded() {
    var b = new RequestBudget(Clock.fixed(Instant.now(), ZoneOffset.UTC));
    for (int i = 0; i < 10000; i++) b.allow("attacker:" + i, 1, 60);
    assertEquals(4096, b.size());
    assertFalse(b.allow("new-key", 1, 60));
  }

  @Test
  void totpMatchesRfc6238() {
    assertEquals(
        "287082",
        Mfa.totp(
            Mfa.base32("12345678901234567890".getBytes(java.nio.charset.StandardCharsets.US_ASCII)),
            1));
  }

  MockHttpServletRequest request(String method, String path, String ip, boolean existingSession) {
    var q = new MockHttpServletRequest(method, path);
    q.setRemoteAddr(ip);
    if (existingSession) q.setSession(new MockHttpSession());
    if (method.equals("POST")) q.setContentType("application/x-www-form-urlencoded");
    return q;
  }

  @Test
  void rejectedClientDoesNotBurnOtherClientsSessionQuota() throws Exception {
    var guard = new RequestGuard(new RequestBudget(), "");
    for (int i = 0; i < 400; i++)
      guard.doFilter(
          request("GET", "/api/csrf", "192.0.2.1", false),
          new MockHttpServletResponse(),
          (q, s) -> {});
    var response = new MockHttpServletResponse();
    guard.doFilter(
        request("GET", "/api/csrf", "192.0.2.2", false),
        response,
        (q, s) -> s.getWriter().write("allowed"));
    assertEquals("allowed", response.getContentAsString());
  }

  @Test
  void rejectedLoginClientDoesNotBurnOtherClientsLoginQuota() throws Exception {
    var guard = new RequestGuard(new RequestBudget(), "");
    for (int i = 0; i < 400; i++)
      guard.doFilter(
          request("POST", "/api/login", "192.0.2.1", true),
          new MockHttpServletResponse(),
          (q, s) -> {});
    var response = new MockHttpServletResponse();
    guard.doFilter(
        request("POST", "/api/login", "192.0.2.2", true),
        response,
        (q, s) -> s.getWriter().write("allowed"));
    assertEquals("allowed", response.getContentAsString());
  }

  @Test
  void webhooksAreBoundedAsRequestsButDoNotConsumeSessionCreationQuota() throws Exception {
    var guard = new RequestGuard(new RequestBudget(), "");
    for (int i = 0; i < 400; i++) {
      var s = new MockHttpServletResponse();
      guard.doFilter(
          request("POST", "/api/livekit/webhook", "192.0.2.1", false),
          s,
          (q, r) -> r.getWriter().write("webhook"));
      assertEquals("webhook", s.getContentAsString());
    }
    var response = new MockHttpServletResponse();
    guard.doFilter(
        request("GET", "/api/csrf", "192.0.2.1", false),
        response,
        (q, s) -> s.getWriter().write("allowed"));
    assertEquals("allowed", response.getContentAsString());
  }
}
