package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** All public signaling passes here. Never forward a refreshed elevated JWT unchanged. */
@RestController
public class MediaAdmission {
  final LiveKitGateway live;
  final Media media;
  final Accounts accounts;

  public MediaAdmission(LiveKitGateway live, Media media, Accounts accounts) {
    this.live = live;
    this.media = media;
    this.accounts = accounts;
  }

  public String downscope(String token) {
    try {
      var jwt =
          JWT.require(Algorithm.HMAC256(live.secret))
              .withIssuer(live.key)
              .withClaimPresence("exp")
              .build()
              .verify(token);
      var grant = jwt.getClaim("video").asMap();
      String identity = jwt.getSubject();
      if (grant == null
          || !Boolean.TRUE.equals(grant.get("roomJoin"))
          || !live.room.equals(grant.get("room"))
          || identity == null
          || !media.validConnection(identity)) throw new IllegalArgumentException();
      String name =
          accounts.db.queryForObject(
              "select a.display_name from accounts a join media_connections c on c.account_id=a.id"
                  + " where c.identity=?",
              String.class,
              identity);
      return live.token(identity, name);
    } catch (Exception e) {
      throw new ResponseStatusException(UNAUTHORIZED);
    }
  }

  @GetMapping("/api/livekit/admit")
  public ResponseEntity<Void> admit(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      @RequestHeader(value = "X-Forwarded-Uri", required = false) String uri) {
    String token = null;
    if (authorization != null && authorization.startsWith("Bearer "))
      token = authorization.substring(7);
    else if (uri != null && uri.length() < 16384) {
      try {
        String query = URI.create(uri).getRawQuery();
        if (query != null)
          for (String p : query.split("&")) {
            String[] kv = p.split("=", 2);
            if (kv.length == 2 && kv[0].equals("access_token"))
              token = URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
          }
      } catch (IllegalArgumentException ignored) {
      }
    }
    if (token == null) throw new ResponseStatusException(UNAUTHORIZED);
    return ResponseEntity.ok()
        .header("X-Media-Authorization", "Bearer " + downscope(token))
        .header("Cache-Control", "no-store")
        .build();
  }
}
