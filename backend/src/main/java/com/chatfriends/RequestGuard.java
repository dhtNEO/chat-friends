package com.chatfriends;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Runs before CSRF/session creation. Forwarded identity is accepted only with a shared proxy key.
 */
public class RequestGuard extends OncePerRequestFilter {
  private final RequestBudget budget;
  private final String proxyKey;

  public RequestGuard(RequestBudget budget, String proxyKey) {
    this.budget = budget;
    this.proxyKey = proxyKey;
  }

  static String identity(HttpServletRequest request, String key) {
    String supplied = request.getHeader("X-Chat-Proxy-Key"),
        address = request.getHeader("X-Chat-Client-IP");
    if (!key.isBlank()
        && supplied != null
        && java.security.MessageDigest.isEqual(
            key.getBytes(java.nio.charset.StandardCharsets.UTF_8),
            supplied.getBytes(java.nio.charset.StandardCharsets.UTF_8))
        && address != null
        && address.length() <= 64
        && address.matches("[0-9a-fA-F:.]+")) return address;
    return request.getRemoteAddr();
  }

  @Override
  protected void doFilterInternal(HttpServletRequest q, HttpServletResponse s, FilterChain chain)
      throws IOException, ServletException {
    String ip = identity(q, proxyKey), path = q.getRequestURI();
    if (q.getContentLengthLong() > 16384) {
      s.sendError(413);
      return;
    }
    if (path.startsWith("/api/") || path.equals("/ws") || path.startsWith("/rtc")) {
      boolean accepted = budget.allow("global", 12000, 60) && budget.allow("ip:" + ip, 1800, 60);
      if (q.getSession(false) == null
          && (path.equals("/api/csrf")
              || Set.of("POST", "PUT", "PATCH", "DELETE").contains(q.getMethod())))
        accepted &=
            budget.allow("session:global", 240, 60) && budget.allow("session:" + ip, 40, 60);
      if (path.equals("/api/login") && q.getMethod().equals("POST"))
        accepted &=
            budget.allow("login:global", 300, 300) && budget.allow("loginip:" + ip, 100, 300);
      if (path.equals("/api/livekit/admit")) accepted &= budget.allow("admission:" + ip, 300, 60);
      if (!accepted) {
        s.setHeader("Retry-After", "60");
        s.sendError(429);
        return;
      }
    }
    if (Set.of("POST", "PUT", "PATCH", "DELETE").contains(q.getMethod())
        && (q.getContentType() == null
            || !q.getContentType()
                .toLowerCase(java.util.Locale.ROOT)
                .startsWith("application/x-www-form-urlencoded"))) {
      byte[] body = q.getInputStream().readNBytes(16385);
      if (body.length > 16384) {
        s.sendError(413);
        return;
      }
      q = new BoundedBodyRequest(q, body);
    }
    chain.doFilter(q, s);
  }
}
