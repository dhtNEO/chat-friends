package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Chat {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final Accounts accounts;
  final RateLimit rate;
  final Events events;

  public Chat(
      JdbcTemplate db, TransactionTemplate tx, Accounts accounts, RateLimit rate, Events events) {
    this.db = db;
    this.tx = tx;
    this.accounts = accounts;
    this.rate = rate;
    this.events = events;
  }

  private record Sent(Message message, boolean created) {}

  public record Message(
      long id, UUID clientId, UUID authorId, String author, String body, Instant createdAt) {}

  Message map(java.sql.ResultSet r, int n) throws java.sql.SQLException {
    return new Message(
        r.getLong("id"),
        r.getObject("client_id", UUID.class),
        r.getObject("author_id", UUID.class),
        r.getString("display_name"),
        r.getString("body"),
        r.getTimestamp("created_at").toInstant());
  }

  static final String SELECT =
      "select m.*,a.display_name from messages m join accounts a on a.id=m.author_id ";

  public List<Message> history(Long before, Long after) {
    if (before != null && after != null) throw new ResponseStatusException(BAD_REQUEST);
    if (after != null)
      return db.query(SELECT + "where m.id>? order by m.id limit 100", this::map, after);
    var list =
        db.query(
            SELECT + "where m.id<? order by m.id desc limit 50",
            this::map,
            before == null ? Long.MAX_VALUE : before);
    Collections.reverse(list);
    return list;
  }

  public Message send(String user, UUID clientId, String body) {
    var a = accounts.active(user);
    if (clientId == null || body == null || body.isBlank() || body.length() > 4000)
      throw new ResponseStatusException(BAD_REQUEST, "Mensagem: 1 a 4000 caracteres");
    Sent sent =
        tx.execute(
            s -> {
              db.execute("select pg_advisory_xact_lock(1)");
              var old =
                  db.query(
                      SELECT + "where m.author_id=? and m.client_id=?",
                      this::map,
                      a.id(),
                      clientId);
              if (!old.isEmpty()) {
                if (!old.getFirst().body().equals(body))
                  throw new ResponseStatusException(CONFLICT, "Identificador reutilizado");
                return new Sent(old.getFirst(), false);
              }
              if (!rate.allow("chat:" + a.id(), 20, 10))
                throw new ResponseStatusException(TOO_MANY_REQUESTS);
              Long id =
                  db.queryForObject(
                      "insert into messages(author_id,client_id,body) values(?,?,?) returning id",
                      Long.class,
                      a.id(),
                      clientId,
                      body);
              return new Sent(db.query(SELECT + "where m.id=?", this::map, id).getFirst(), true);
            });
    if (sent.created()) events.broadcast(Map.of("type", "message", "message", sent.message()));
    return sent.message();
  }
}
