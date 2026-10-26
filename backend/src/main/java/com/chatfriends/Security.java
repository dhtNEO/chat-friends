package com.chatfriends;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class Security {
  @Bean
  static PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  SecurityFilterChain chain(HttpSecurity h, RateLimit rate, Accounts accounts) throws Exception {
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
                    .successHandler((q, s, a) -> s.setStatus(204))
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
                      || !rate.allow("login:" + name, 8, 300)
                      || !rate.allow("ip:" + q.getRemoteAddr(), 100, 300)) {
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
                  } catch (Exception e) {
                    s.sendError(401);
                    return;
                  }
                }
                c.doFilter(q, s);
              }
            },
            UsernamePasswordAuthenticationFilter.class);
    return h.build();
  }
}
