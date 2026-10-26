package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

class SessionSecurityTest {
  @Test
  void administratorCannotUsePasswordOnlyInProduction() throws Exception {
    var accounts = mock(Accounts.class);
    var mfa = mock(Mfa.class);
    when(accounts.active("admin"))
        .thenReturn(new Accounts.Account(UUID.randomUUID(), "admin", "Admin", true, true));
    var policy = new SessionSecurity(accounts, mfa, true, 28800);
    var q = new MockHttpServletRequest("GET", "/api/admin/accounts");
    var session = new MockHttpSession();
    q.setSession(session);
    policy.login(session, "admin");
    var response = new MockHttpServletResponse();
    assertFalse(policy.authorize(q, response, "admin"));
    assertEquals(403, response.getStatus());
    q.setRequestURI("/api/security/mfa/setup");
    assertTrue(policy.authorize(q, new MockHttpServletResponse(), "admin"));
    when(mfa.enabled("admin")).thenReturn(true);
    q.setRequestURI("/ws");
    assertFalse(policy.authorize(q, new MockHttpServletResponse(), "admin"));
    session.setAttribute(SessionSecurity.VERIFIED, true);
    assertTrue(policy.authorize(q, new MockHttpServletResponse(), "admin"));
  }

  @Test
  void oldReauthenticationCannotAuthorizeSensitiveMutation() throws Exception {
    var accounts = mock(Accounts.class);
    var mfa = mock(Mfa.class);
    var policy = new SessionSecurity(accounts, mfa, false, 28800);
    var q = new MockHttpServletRequest("POST", "/api/admin/accounts");
    var session = new MockHttpSession();
    q.setSession(session);
    policy.login(session, "admin");
    session.setAttribute(SessionSecurity.REAUTH, System.currentTimeMillis() - 901000L);
    var response = new MockHttpServletResponse();
    assertFalse(policy.authorize(q, response, "admin"));
    assertEquals(428, response.getStatus());
  }
}
