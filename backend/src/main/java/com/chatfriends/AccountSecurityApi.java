package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/security")
public class AccountSecurityApi {
  final Accounts accounts;
  final Mfa mfa;
  final Events events;

  public AccountSecurityApi(Accounts accounts, Mfa mfa, Events events) {
    this.accounts = accounts;
    this.mfa = mfa;
    this.events = events;
  }

  public record Proof(String password, String code) {}

  @PostMapping("/mfa/setup")
  public Map<String, String> setup(Principal p, HttpServletRequest q, @RequestBody Proof b) {
    mfa.password(p.getName(), b.password());
    if (mfa.enabled(p.getName())) throw new ResponseStatusException(CONFLICT, "MFA já configurado");
    String secret = mfa.generate();
    q.getSession()
        .setAttribute("mfa.pending", mfa.crypt(secret, accounts.get(p.getName()).id(), true));
    q.getSession().setAttribute("mfa.pendingUntil", System.currentTimeMillis() + 600000);
    return Map.of("secret", secret);
  }

  @PostMapping("/mfa/confirm")
  public Map<String, Object> confirm(Principal p, HttpServletRequest q, @RequestBody Proof b) {
    var session = q.getSession();
    Object secret = session.getAttribute("mfa.pending"),
        until = session.getAttribute("mfa.pendingUntil");
    if (!(secret instanceof String text)
        || !(until instanceof Long expiry)
        || expiry < System.currentTimeMillis()
        || mfa.enabled(p.getName()))
      throw new ResponseStatusException(CONFLICT, "Reinicie a configuração MFA");
    var codes =
        mfa.enroll(p.getName(), mfa.crypt(text, accounts.get(p.getName()).id(), false), b.code());
    session.removeAttribute("mfa.pending");
    session.removeAttribute("mfa.pendingUntil");
    session.setAttribute(SessionSecurity.VERIFIED, true);
    session.setAttribute(SessionSecurity.REAUTH, System.currentTimeMillis());
    accounts.db.update(
        "delete from spring_session where principal_name=? and session_id<>?",
        p.getName(),
        session.getId());
    q.changeSessionId();
    events.closeUser(p.getName());
    return Map.of("recoveryCodes", codes);
  }

  @PostMapping("/mfa/verify")
  public void verify(Principal p, HttpServletRequest q, @RequestBody Proof b) {
    mfa.verify(p.getName(), b.code());
    q.changeSessionId();
    q.getSession().setAttribute(SessionSecurity.VERIFIED, true);
    q.getSession().setAttribute(SessionSecurity.REAUTH, System.currentTimeMillis());
  }

  @PostMapping("/reauth")
  public void reauth(Principal p, HttpServletRequest q, @RequestBody Proof b) {
    mfa.password(p.getName(), b.password());
    if (mfa.enabled(p.getName())) mfa.verify(p.getName(), b.code());
    q.getSession().setAttribute(SessionSecurity.REAUTH, System.currentTimeMillis());
  }

  @GetMapping("/sessions")
  public List<Map<String, Object>> list(Principal p, HttpServletRequest q) {
    return accounts.db.query(
        "select primary_id,session_id,creation_time,last_access_time,expiry_time from"
            + " spring_session where principal_name=? and expiry_time>? order by creation_time"
            + " desc",
        (r, n) ->
            Map.of(
                "id",
                r.getString(1),
                "current",
                r.getString(2).equals(q.getSession().getId()),
                "createdAt",
                r.getLong(3),
                "lastAccessAt",
                r.getLong(4),
                "expiresAt",
                r.getLong(5)),
        p.getName(),
        System.currentTimeMillis());
  }

  @DeleteMapping("/sessions/{id}")
  public void revoke(Principal p, HttpServletRequest q, @PathVariable String id) {
    accounts.db.update(
        "delete from spring_session where primary_id=? and principal_name=?", id, p.getName());
    events.reap();
  }
}
