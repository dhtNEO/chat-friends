package com.chatfriends;

import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class SessionSecurity {
  static final String ISSUED = "security.issued",
      VERIFIED = "security.mfa",
      REAUTH = "security.reauth";
  final Accounts accounts;
  final Mfa mfa;
  final boolean required;
  final int absolute;

  public SessionSecurity(
      Accounts accounts,
      Mfa mfa,
      @Value("${app.admin-mfa-required:false}") boolean required,
      @Value("${app.session-absolute-seconds:28800}") int absolute) {
    this.accounts = accounts;
    this.mfa = mfa;
    this.required = required;
    this.absolute = absolute;
  }

  void login(HttpSession session, String user) {
    session.setAttribute(ISSUED, System.currentTimeMillis());
    session.setAttribute(VERIFIED, false);
    session.setAttribute(REAUTH, System.currentTimeMillis());
  }

  boolean pending(String user, HttpSession session) {
    return mfa.enabled(user) && !Boolean.TRUE.equals(session.getAttribute(VERIFIED));
  }

  boolean enrollment(String user) {
    return required && accounts.active(user).admin() && !mfa.enabled(user);
  }

  Map<String, Object> status(String user, HttpSession session) {
    return Map.of(
        "mfaEnabled",
        mfa.enabled(user),
        "mfaPending",
        pending(user, session),
        "enrollmentRequired",
        enrollment(user));
  }

  boolean authorize(HttpServletRequest q, HttpServletResponse s, String user) throws IOException {
    HttpSession session = q.getSession(false);
    long now = System.currentTimeMillis();
    if (session == null
        || !(session.getAttribute(ISSUED) instanceof Long issued)
        || issued > now
        || now - issued >= absolute * 1000L) {
      if (session != null) session.invalidate();
      s.sendError(401);
      return false;
    }
    session.setMaxInactiveInterval(
        (int) Math.min(7200, Math.max(1, (issued + absolute * 1000L - now) / 1000)));
    String path = q.getRequestURI();
    if ((pending(user, session) || enrollment(user))
        && !Set.of(
                "/api/me",
                "/api/csrf",
                "/api/logout",
                "/api/security/mfa/setup",
                "/api/security/mfa/confirm",
                "/api/security/mfa/verify")
            .contains(path)) {
      s.sendError(403);
      return false;
    }
    boolean sensitive =
        !q.getMethod().equals("GET")
            && (path.startsWith("/api/admin/")
                || path.equals("/api/media/screen/force-stop")
                || path.equals("/api/password"));
    Object recent = session.getAttribute(REAUTH);
    if (sensitive && (!(recent instanceof Long t) || now - t > 900000)) {
      s.setStatus(428);
      s.setContentType("application/json");
      s.getWriter()
          .write("{\"error\":\"Confirme sua identidade em Segurança antes desta operação\"}");
      return false;
    }
    return true;
  }
}
