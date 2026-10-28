package com.chatfriends;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
@org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
public class Security {
  @Bean
  SecurityFilterChain chain(
      HttpSecurity h,
      Accounts accounts,
      RequestBudget budget,
      SessionSecurity sessions,
      @org.springframework.beans.factory.annotation.Value("${app.proxy-key:}") String proxyKey)
      throws Exception {
    var csrf = new HttpSessionCsrfTokenRepository();
    h.csrf(
            c ->
                c.csrfTokenRepository(csrf)
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                    .ignoringRequestMatchers("/api/livekit/webhook"))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers(
                        "/api/livekit/admit",
                        "/api/csrf",
                        "/api/login",
                        "/api/health",
                        "/api/livekit/webhook",
                        "/error")
                    .permitAll()
                    .requestMatchers("/api/admin/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .formLogin(
            f ->
                f.loginProcessingUrl("/api/login")
                    .successHandler(
                        (q, s, a) -> {
                          sessions.login(q.getSession(), a.getName());
                          s.setStatus(204);
                        })
                    .failureHandler((q, s, e) -> s.sendError(401)))
        .logout(
            l ->
                l.logoutUrl("/api/logout")
                    .logoutSuccessHandler((q, s, a) -> s.setStatus(204))
                    .deleteCookies("SESSION"))
        .exceptionHandling(e -> e.authenticationEntryPoint((q, s, x) -> s.sendError(401)))
        .requestCache(c -> c.disable())
        .headers(
            c ->
                c.contentSecurityPolicy(
                    p -> p.policyDirectives("default-src 'none'; frame-ancestors 'none'")))
        .addFilterBefore(
            new OncePerRequestFilter() {
              protected void doFilterInternal(
                  HttpServletRequest q, HttpServletResponse s, FilterChain c)
                  throws ServletException, IOException {
                if (q.getRequestURI().equals("/api/login") && q.getMethod().equals("POST")) {
                  String name = q.getParameter("username");
                  if (name == null
                      || name.length() > 32
                      || !budget.allow(
                          "loginname:" + name.toLowerCase(java.util.Locale.ROOT), 8, 300)) {
                    s.sendError(429);
                    return;
                  }
                }
                if (q.getContentLengthLong() > 16384) {
                  s.sendError(413);
                  return;
                }
                c.doFilter(q, s);
              }
            },
            UsernamePasswordAuthenticationFilter.class)
        .addFilterAfter(
            new OncePerRequestFilter() {
              protected void doFilterInternal(
                  HttpServletRequest q, HttpServletResponse s, FilterChain c)
                  throws ServletException, IOException {
                var auth =
                    org.springframework.security.core.context.SecurityContextHolder.getContext()
                        .getAuthentication();
                if (auth != null
                    && auth.isAuthenticated()
                    && !(auth
                        instanceof
                        org.springframework.security.authentication.AnonymousAuthenticationToken)) {
                  try {
                    accounts.active(auth.getName());
                    if (!sessions.authorize(q, s, auth.getName())) return;
                    if (!budget.allow("user:" + auth.getName(), 600, 60)) {
                      s.setHeader("Retry-After", "60");
                      s.sendError(429);
                      return;
                    }
                    if (q.getRequestURI().equals("/api/media/state")
                        && !budget.allow("state:" + auth.getName(), 120, 60)) {
                      s.sendError(429);
                      return;
                    }
                  } catch (Exception e) {
                    s.sendError(401);
                    return;
                  }
                }
                c.doFilter(q, s);
              }
            },
            UsernamePasswordAuthenticationFilter.class);
    h.addFilterBefore(
        new RequestGuard(budget, proxyKey), org.springframework.security.web.csrf.CsrfFilter.class);
    return h.build();
  }
}
