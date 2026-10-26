package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.time.Instant;
import java.util.*;
import livekit.LivekitModels.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/media")
public class Media {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final Accounts accounts;
  final LiveKitGateway live;
  final RateLimit rate;

  @Value("${app.screen-bitrate}")
  int bitrate;

  @Value("${app.screen-height}")
  int height;

  @Value("${app.screen-fps}")
  int fps;

  public Media(
      JdbcTemplate db,
      TransactionTemplate tx,
      Accounts accounts,
      LiveKitGateway live,
      RateLimit rate) {
    this.db = db;
    this.tx = tx;
    this.accounts = accounts;
    this.live = live;
    this.rate = rate;
  }

  public record Lease(String identity, UUID leaseId, Instant expiresAt) {}

  Lease lease() {
    return db.query(
            "select * from screen_lease where id=1",
            (r, n) ->
                new Lease(
                    r.getString("identity"),
                    r.getObject("lease_id", UUID.class),
                    r.getTimestamp("expires_at") == null
                        ? null
                        : r.getTimestamp("expires_at").toInstant()))
        .getFirst();
  }

  void lock() {
    db.execute("select pg_advisory_xact_lock(2)");
  }

  boolean validConnection(String identity) {
    return db.queryForObject(
            """
            select count(*) from media_connections c join accounts a on a.id=c.account_id
            join spring_session s on s.session_id=c.session_id
            where c.identity=? and c.expires_at>now() and a.enabled and s.expiry_time>?
            """,
            Integer.class,
            identity,
            System.currentTimeMillis())
        > 0;
  }

  void own(String identity, Principal p, HttpServletRequest q) {
    var a = accounts.active(p.getName());
    if (identity == null
        || db.queryForObject(
                "select count(*) from media_connections where identity=? and account_id=? and"
                    + " session_id=?",
                Integer.class,
                identity,
                a.id(),
                q.getSession().getId())
            == 0) throw new ResponseStatusException(FORBIDDEN);
  }

  @PostMapping("/join")
  public Map<String, Object> join(Principal p, HttpServletRequest q) {
    var a = accounts.active(p.getName());
    if (!rate.allow("join:" + a.id(), 10, 60)) throw new ResponseStatusException(TOO_MANY_REQUESTS);
    return tx.execute(
        s -> {
          lock();
          reconcileLocked();
          if (db.queryForObject(
                  "select count(*) from media_connections where expires_at>now()", Integer.class)
              >= 16) throw new ResponseStatusException(CONFLICT, "Sala cheia (16 conexões)");
          String id = a.id() + ":" + UUID.randomUUID();
          db.update(
              "insert into media_connections(identity,account_id,session_id,expires_at)"
                  + " values(?,?,?,now()+interval '45 seconds')",
              id,
              a.id(),
              q.getSession().getId());
          return Map.of(
              "identity",
              id,
              "token",
              live.token(id, a.displayName()),
              "url",
              live.publicUrl,
              "screen",
              Map.of(
                  "bitrate",
                  Math.clamp(bitrate, 100000, 8000000),
                  "height",
                  Math.clamp(height, 360, 1080),
                  "fps",
                  Math.clamp(fps, 5, 60)));
        });
  }

  public record Connection(String identity) {}

  @PostMapping("/heartbeat")
  public void heartbeat(Principal p, HttpServletRequest q, @RequestBody Connection b) {
    own(b.identity(), p, q);
    db.update(
        "update media_connections set expires_at=now()+interval '45 seconds' where identity=?",
        b.identity());
  }

  public record AudioPreferences(String identity, boolean deaf) {}

  @PutMapping("/audio")
  public void audio(Principal p, HttpServletRequest q, @RequestBody AudioPreferences b) {
    own(b.identity(), p, q);
    if (!validConnection(b.identity())) throw new ResponseStatusException(UNAUTHORIZED);
    db.update("update media_connections set deaf=? where identity=?", b.deaf(), b.identity());
  }

  @PostMapping("/leave")
  public void leave(Principal p, HttpServletRequest q, @RequestBody Connection b) {
    own(b.identity(), p, q);
    db.update("update media_connections set expires_at=now() where identity=?", b.identity());
    reconcile();
  }

  @GetMapping("/state")
  public Map<String, Object> state() {
    return tx.execute(
        s -> {
          lock();
          reconcileLocked();
          return Map.of(
              "lease",
              lease(),
              "participants",
              live.participants().stream()
                  .filter(p -> validConnection(p.getIdentity()))
                  .map(
                      p ->
                          Map.of(
                              "identity",
                              p.getIdentity(),
                              "name",
                              p.getName(),
                              "micMuted",
                              p.getTracksList().stream()
                                  .noneMatch(
                                      t ->
                                          t.getSource() == TrackSource.MICROPHONE && !t.getMuted()),
                              "deaf",
                              Boolean.TRUE.equals(
                                  db.queryForObject(
                                      "select deaf from media_connections where identity=?",
                                      Boolean.class,
                                      p.getIdentity()))))
                  .toList());
        });
  }

  @PostMapping("/screen")
  public Lease acquire(Principal p, HttpServletRequest q, @RequestBody Connection b) {
    own(b.identity(), p, q);
    return tx.execute(
        s -> {
          lock();
          reconcileLocked();
          var l = lease();
          if (l.identity() != null) {
            if (l.identity().equals(b.identity())) return l;
            throw new ResponseStatusException(CONFLICT, "Outra pessoa está compartilhando");
          }
          if (!validConnection(b.identity())
              || live.participants().stream().noneMatch(x -> x.getIdentity().equals(b.identity())))
            throw new ResponseStatusException(CONFLICT, "Entre na voz primeiro");
          UUID id = UUID.randomUUID();
          db.update(
              "update screen_lease set identity=?,lease_id=?,expires_at=now()+interval '30 seconds'"
                  + " where id=1",
              b.identity(),
              id);
          // External grant occurs inside the lock; crash after grant is repaired by reconciliation.
          live.permission(b.identity(), true);
          return lease();
        });
  }

  public record Renew(String identity, UUID leaseId) {}

  @PostMapping("/screen/heartbeat")
  public void renew(Principal p, HttpServletRequest q, @RequestBody Renew b) {
    own(b.identity(), p, q);
    tx.executeWithoutResult(
        s -> {
          lock();
          reconcileLocked();
          if (db.update(
                  "update screen_lease set expires_at=now()+interval '30 seconds' where id=1 and"
                      + " identity=? and lease_id=? and expires_at>now()",
                  b.identity(),
                  b.leaseId())
              != 1) throw new ResponseStatusException(CONFLICT, "Reserva expirada");
        });
  }

  @DeleteMapping("/screen")
  public void release(Principal p, HttpServletRequest q, @RequestBody Renew b) {
    own(b.identity(), p, q);
    tx.executeWithoutResult(
        s -> {
          lock();
          var l = lease();
          if (Objects.equals(l.identity(), b.identity())
              && Objects.equals(l.leaseId(), b.leaseId())) clear(l);
        });
  }

  @PostMapping("/screen/force-stop")
  public void force(Principal p) {
    if (!accounts.active(p.getName()).admin()) throw new ResponseStatusException(FORBIDDEN);
    tx.executeWithoutResult(
        s -> {
          lock();
          clear(lease());
        });
  }

  void clear(Lease l) {
    if (l.identity() != null
        && live.participants().stream().anyMatch(p -> p.getIdentity().equals(l.identity())))
      live.permission(l.identity(), false);
    db.update("update screen_lease set identity=null,lease_id=null,expires_at=null where id=1");
  }

  void reconcileLocked() {
    var participants = live.participants();
    var l = lease();
    String initialOwner = l.identity();
    if (l.identity() != null
        && (l.expiresAt().isBefore(Instant.now())
            || !validConnection(l.identity())
            || participants.stream().noneMatch(p -> p.getIdentity().equals(initialOwner)))) {
      clear(l);
      l = lease();
    }
    for (var p : participants) {
      if (!validConnection(p.getIdentity())) {
        live.remove(p.getIdentity());
        continue;
      }
      boolean owner = Objects.equals(l.identity(), p.getIdentity());
      long screens =
          p.getTracksList().stream().filter(t -> t.getSource() == TrackSource.SCREEN_SHARE).count();
      boolean elevated =
          p.getPermission().getCanPublishSourcesList().contains(TrackSource.SCREEN_SHARE);
      if (screens > 1) {
        live.remove(p.getIdentity());
        if (owner) clear(l);
        continue;
      }
      if (elevated && !owner) live.permission(p.getIdentity(), false);
    }
    db.update("delete from media_connections where expires_at<now()-interval '1 day'");
  }

  public void removeUser(UUID id) {
    db.update("update media_connections set expires_at=now() where account_id=?", id);
    reconcile();
  }

  public void reconcile() {
    tx.executeWithoutResult(
        s -> {
          lock();
          reconcileLocked();
        });
  }

  @org.springframework.scheduling.annotation.Scheduled(
      fixedDelayString = "${app.reconcile-delay:3000}",
      initialDelayString = "${app.reconcile-initial-delay:5000}")
  public void tick() {
    try {
      reconcile();
    } catch (Exception e) {
      org.slf4j.LoggerFactory.getLogger(Media.class)
          .warn("Reconciliação de mídia indisponível; novas reservas falham fechadas.");
    }
  }
}
