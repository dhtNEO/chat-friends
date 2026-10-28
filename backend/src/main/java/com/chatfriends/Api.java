package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.security.Principal;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class Api {
  final Accounts accounts;
  final SessionSecurity sessions;
  final Chat chat;
  final Events events;
  final Media media;
  final TransactionTemplate tx;

  @Value("${app.name}")
  String name;

  public Api(
      Accounts accounts,
      Chat chat,
      Events events,
      Media media,
      TransactionTemplate tx,
      SessionSecurity sessions) {
    this.accounts = accounts;
    this.sessions = sessions;
    this.chat = chat;
    this.events = events;
    this.media = media;
    this.tx = tx;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    accounts.db.queryForObject("select 1", Integer.class);
    return Map.of("status", "ok");
  }

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
  }

  @GetMapping("/me")
  public Map<String, Object> me(Principal p, jakarta.servlet.http.HttpServletRequest q) {
    return Map.of(
        "user",
        accounts.active(p.getName()),
        "spaceName",
        name,
        "security",
        sessions.status(p.getName(), q.getSession()));
  }

  @GetMapping("/messages")
  public List<Chat.Message> history(
      @RequestParam(required = false) Long before, @RequestParam(required = false) Long after) {
    return chat.history(before, after);
  }

  public record Send(UUID clientId, String body) {}

  @PostMapping("/messages")
  public Chat.Message send(Principal p, @RequestBody Send msg) {
    return chat.send(p.getName(), msg.clientId(), msg.body());
  }

  public record Password(String currentPassword, String password) {}

  @PostMapping("/password")
  public void password(Principal p, @RequestBody Password b) {
    if (!accounts.encoder.matches(
        b.currentPassword() == null ? "" : b.currentPassword(),
        accounts.loadUserByUsername(p.getName()).getPassword()))
      throw new ResponseStatusException(FORBIDDEN);
    accounts.passwordValid(b.password());
    accounts.setPassword(p.getName(), b.password());
    events.closeUser(p.getName());
    media.removeUser(accounts.get(p.getName()).id());
  }

  @GetMapping("/admin/accounts")
  public List<Accounts.Account> users() {
    return accounts.all();
  }

  public record NewAccount(String username, String displayName, String password) {}

  @PostMapping("/admin/accounts")
  public Accounts.Account create(@RequestBody NewAccount b) {
    return accounts.create(b.username(), b.displayName(), b.password(), false);
  }

  public record ChangeAccount(Boolean enabled, String password) {}

  @PatchMapping("/admin/accounts/{username}")
  public void change(Principal p, @PathVariable String username, @RequestBody ChangeAccount b) {
    var target = accounts.get(username);
    if (target.admin() && Boolean.FALSE.equals(b.enabled()))
      throw new ResponseStatusException(BAD_REQUEST, "Administrador não pode ser desativado");
    if (b.password() != null) accounts.passwordValid(b.password());
    tx.executeWithoutResult(
        s -> {
          if (b.enabled() != null)
            accounts.db.update(
                "update accounts set enabled=? where username=?", b.enabled(), username);
          if (b.password() != null) accounts.setPassword(username, b.password());
          accounts.invalidate(username);
        });
    events.closeUser(username);
    media.removeUser(target.id());
  }
}
