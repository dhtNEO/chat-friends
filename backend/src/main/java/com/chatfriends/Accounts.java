package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Accounts implements UserDetailsService {
  final JdbcTemplate db;
  final PasswordEncoder encoder;

  public Accounts(JdbcTemplate db, PasswordEncoder encoder) {
    this.db = db;
    this.encoder = encoder;
  }

  public record Account(
      UUID id,
      String username,
      String displayName,
      boolean admin,
      boolean enabled,
      String primaryColor,
      String secondaryColor,
      Long avatarVersion) {}

  Account map(java.sql.ResultSet r, int n) throws java.sql.SQLException {
    long avatar = r.getLong("avatar_version");
    return new Account(
        r.getObject("id", UUID.class),
        r.getString("username"),
        r.getString("display_name"),
        r.getBoolean("admin"),
        r.getBoolean("enabled"),
        r.getString("primary_color"),
        r.getString("secondary_color"),
        r.wasNull() ? null : avatar);
  }

  static final String SELECT =
      "select a.*,v.version as avatar_version from accounts a"
          + " left join avatars v on v.account_id=a.id ";

  public Account get(String name) {
    return db.query(SELECT + "where a.username=?", this::map, name).stream()
        .findFirst()
        .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED));
  }

  public Account active(String name) {
    var a = get(name);
    if (!a.enabled()) throw new ResponseStatusException(UNAUTHORIZED);
    return a;
  }

  public List<Account> all() {
    return db.query(SELECT + "order by a.username", this::map);
  }

  public UserDetails loadUserByUsername(String name) {
    try {
      var a = get(name);
      String hash =
          db.queryForObject("select password_hash from accounts where id=?", String.class, a.id());
      return User.withUsername(a.username())
          .password(hash)
          .roles(a.admin() ? "ADMIN" : "USER")
          .disabled(!a.enabled())
          .build();
    } catch (ResponseStatusException e) {
      throw new UsernameNotFoundException("Conta inválida");
    }
  }

  public void passwordValid(String p) {
    if (p == null
        || p.length() < 12
        || p.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
      throw new ResponseStatusException(BAD_REQUEST, "Senha: 12 caracteres a 72 bytes");
  }

  static boolean validUsername(String name) {
    return name != null && name.matches("[a-z0-9][a-z0-9_.-]{2,31}");
  }

  static boolean validDisplayName(String display) {
    return display != null && !display.isBlank() && display.length() <= 64;
  }

  public Account create(String name, String display, String password, boolean admin) {
    if (!validUsername(name) || !validDisplayName(display))
      throw new ResponseStatusException(BAD_REQUEST, "Nome inválido");
    passwordValid(password);
    if (db.queryForObject("select count(*) from accounts where username=?", Integer.class, name)
        > 0) throw new ResponseStatusException(CONFLICT, "Conta já existe");
    db.update(
        "insert into accounts(id,username,display_name,password_hash,admin) values(?,?,?,?,?)",
        UUID.randomUUID(),
        name,
        display,
        encoder.encode(password),
        admin);
    return get(name);
  }

  public void invalidate(String name) {
    db.update("delete from spring_session where principal_name=?", name);
  }

  public void setPassword(String name, String password) {
    passwordValid(password);
    db.update(
        "update accounts set password_hash=? where username=?", encoder.encode(password), name);
    invalidate(name);
  }
}
