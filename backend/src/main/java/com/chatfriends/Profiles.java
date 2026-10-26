package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.security.Principal;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class Profiles {
  // Avatars are resized in the browser and must also fit the global request cap.
  static final int MAX_AVATAR = 16000;
  static final String COLOR = "#[0-9a-fA-F]{6}";
  final Accounts accounts;
  final Events events;
  final Media media;
  final TransactionTemplate tx;

  public Profiles(Accounts accounts, Events events, Media media, TransactionTemplate tx) {
    this.accounts = accounts;
    this.events = events;
    this.media = media;
    this.tx = tx;
  }

  public record Member(UUID id, String username, String displayName, Long avatarVersion) {}

  @GetMapping("/members")
  public List<Member> members() {
    return accounts.all().stream()
        .filter(Accounts.Account::enabled)
        .map(a -> new Member(a.id(), a.username(), a.displayName(), a.avatarVersion()))
        .toList();
  }

  /** Omitted fields stay; an empty color restores the default theme. */
  public record Change(
      String username, String displayName, String primaryColor, String secondaryColor) {}

  @PatchMapping("/profile")
  public Map<String, Object> update(Principal p, @RequestBody Change b) {
    var a = accounts.active(p.getName());
    if (b.displayName() != null && !Accounts.validDisplayName(b.displayName()))
      throw new ResponseStatusException(BAD_REQUEST, "Nome de exibição: 1 a 64 caracteres");
    for (String color : new String[] {b.primaryColor(), b.secondaryColor()})
      if (color != null && !color.isEmpty() && !color.matches(COLOR))
        throw new ResponseStatusException(BAD_REQUEST, "Cor inválida");
    boolean renamed = b.username() != null && !b.username().equals(a.username());
    if (renamed && !Accounts.validUsername(b.username()))
      throw new ResponseStatusException(
          BAD_REQUEST, "Usuário: 3 a 32 letras minúsculas, números, ponto, hífen ou _");
    try {
      tx.executeWithoutResult(
          s -> {
            if (b.displayName() != null)
              accounts.db.update(
                  "update accounts set display_name=? where id=?", b.displayName(), a.id());
            if (b.primaryColor() != null)
              accounts.db.update(
                  "update accounts set primary_color=? where id=?",
                  b.primaryColor().isEmpty() ? null : b.primaryColor().toLowerCase(),
                  a.id());
            if (b.secondaryColor() != null)
              accounts.db.update(
                  "update accounts set secondary_color=? where id=?",
                  b.secondaryColor().isEmpty() ? null : b.secondaryColor().toLowerCase(),
                  a.id());
            if (renamed) {
              accounts.db.update(
                  "update accounts set username=? where id=?", b.username(), a.id());
              // Sessions are bound to the login name: sign in again with the new one.
              accounts.invalidate(a.username());
            }
          });
    } catch (DuplicateKeyException e) {
      throw new ResponseStatusException(CONFLICT, "Esse usuário já existe");
    }
    if (renamed) {
      events.closeUser(a.username());
      media.removeUser(a.id());
    }
    events.broadcast(Map.of("type", "profile"));
    return Map.of(
        "user", accounts.get(renamed ? b.username() : a.username()), "signedOut", renamed);
  }

  static boolean matches(String type, byte[] d) {
    return switch (type) {
      case "image/png" -> d.length > 8 && (d[0] & 0xff) == 0x89 && d[1] == 'P' && d[2] == 'N';
      case "image/jpeg" ->
          d.length > 3 && (d[0] & 0xff) == 0xff && (d[1] & 0xff) == 0xd8 && (d[2] & 0xff) == 0xff;
      case "image/webp" ->
          d.length > 12
              && new String(d, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
              && new String(d, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP");
      default -> false;
    };
  }

  @PostMapping(
      path = "/profile/avatar",
      consumes = {MediaType.IMAGE_PNG_VALUE, MediaType.IMAGE_JPEG_VALUE, "image/webp"})
  public Map<String, Object> avatar(
      Principal p, @RequestHeader(HttpHeaders.CONTENT_TYPE) String type, @RequestBody byte[] data) {
    var a = accounts.active(p.getName());
    var media = MediaType.parseMediaType(type);
    String mime = media.getType() + "/" + media.getSubtype();
    if (data.length == 0 || data.length > MAX_AVATAR || !matches(mime, data))
      throw new ResponseStatusException(BAD_REQUEST, "Imagem inválida ou maior que 16 KB");
    accounts.db.update(
        "insert into avatars(account_id,content_type,data,version) values(?,?,?,?)"
            + " on conflict(account_id) do update set content_type=excluded.content_type,"
            + " data=excluded.data, version=excluded.version",
        a.id(),
        mime,
        data,
        System.currentTimeMillis());
    events.broadcast(Map.of("type", "profile"));
    return Map.of("user", accounts.get(a.username()));
  }

  @DeleteMapping("/profile/avatar")
  public void removeAvatar(Principal p) {
    accounts.db.update(
        "delete from avatars where account_id=?", accounts.active(p.getName()).id());
    events.broadcast(Map.of("type", "profile"));
  }

  @GetMapping("/avatars/{id}")
  public ResponseEntity<byte[]> image(@PathVariable UUID id) {
    return accounts
        .db
        .query(
            "select v.content_type,v.data from avatars v join accounts a on a.id=v.account_id"
                + " where v.account_id=? and a.enabled",
            (r, n) ->
                ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(r.getString("content_type")))
                    // URLs carry ?v=version, so a changed photo is a new URL.
                    .cacheControl(
                        CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePrivate())
                    .body(r.getBytes("data")),
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> new ResponseStatusException(NOT_FOUND));
  }
}
