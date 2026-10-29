package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import jakarta.validation.constraints.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** The space's shared gaming calendar. Dates are stored as instants, displayed in local time. */
@Service
public class Outlook {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final Accounts accounts;

  public Outlook(JdbcTemplate db, TransactionTemplate tx, Accounts accounts) {
    this.db = db;
    this.tx = tx;
    this.accounts = accounts;
  }

  public record Details(
      @NotBlank @Size(max = 120) String title,
      @NotNull @Size(max = 80) String game,
      @NotNull @Size(max = 160) String location,
      @NotNull @Size(max = 2000) String description,
      @NotNull Instant startsAt,
      @NotNull Instant endsAt) {}

  public record Attendee(UUID id, String name, String response) {}

  public record CalendarEvent(
      UUID id,
      UUID creatorId,
      String creator,
      String title,
      String game,
      String location,
      String description,
      Instant startsAt,
      Instant endsAt,
      boolean cancelled,
      int version,
      List<Attendee> attendees) {}

  <T> T locked(Supplier<T> action) {
    return tx.execute(
        s -> {
          db.execute("select pg_advisory_xact_lock(918274)");
          return action.get();
        });
  }

  void check(boolean valid, String message) {
    if (!valid) throw new ResponseStatusException(BAD_REQUEST, message);
  }

  void validate(Details d) {
    check(
        d != null
            && d.title() != null
            && !d.title().isBlank()
            && d.title().length() <= 120
            && d.game() != null
            && d.game().length() <= 80
            && d.location() != null
            && d.location().length() <= 160
            && d.description() != null
            && d.description().length() <= 2000,
        "Confira o título e os limites dos campos.");
    check(
        d.startsAt() != null
            && d.endsAt() != null
            && d.endsAt().isAfter(d.startsAt())
            && Duration.between(d.startsAt(), d.endsAt()).compareTo(Duration.ofHours(48)) <= 0,
        "O fim deve ser depois do início, com duração máxima de 48 horas.");
    check(
        d.startsAt().isAfter(Instant.now().minus(Duration.ofDays(730)))
            && d.startsAt().isBefore(Instant.now().plus(Duration.ofDays(730))),
        "Escolha uma data dentro de dois anos do momento atual.");
  }

  static final String SELECT =
      "select e.*, a.display_name from outlook_events e join accounts a on a.id=e.creator_id ";

  CalendarEvent map(java.sql.ResultSet r, int n) throws java.sql.SQLException {
    return new CalendarEvent(
        r.getObject("id", UUID.class),
        r.getObject("creator_id", UUID.class),
        r.getString("display_name"),
        r.getString("title"),
        r.getString("game"),
        r.getString("location"),
        r.getString("description"),
        r.getTimestamp("starts_at").toInstant(),
        r.getTimestamp("ends_at").toInstant(),
        r.getBoolean("cancelled"),
        r.getInt("version"),
        new ArrayList<>());
  }

  CalendarEvent event(UUID id) {
    return db.query(SELECT + "where e.id=?", this::map, id).stream()
        .findFirst()
        .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Evento não encontrado."));
  }

  void canEdit(Accounts.Account a, CalendarEvent e, int version) {
    if (!a.admin() && !a.id().equals(e.creatorId()))
      throw new ResponseStatusException(
          FORBIDDEN, "Somente quem criou o evento ou um administrador pode alterá-lo.");
    if (e.version() != version)
      throw new ResponseStatusException(
          CONFLICT, "O evento mudou. Atualize a agenda antes de editar.");
    if (e.cancelled()) throw new ResponseStatusException(CONFLICT, "Este evento foi cancelado.");
  }

  public List<CalendarEvent> list(String name, Instant from, Instant to) {
    accounts.active(name);
    check(
        from != null
            && to != null
            && to.isAfter(from)
            && Duration.between(from, to).compareTo(Duration.ofDays(63)) <= 0,
        "Consulte um período de até 63 dias.");
    return locked(
        () -> {
          var events =
              db.query(
                  SELECT
                      + "where e.starts_at<? and e.ends_at>? order by e.starts_at,e.id limit 500",
                  this::map,
                  Timestamp.from(to),
                  Timestamp.from(from));
          var byId = new HashMap<UUID, CalendarEvent>();
          for (var e : events) byId.put(e.id(), e);
          db.query(
              "select p.event_id,p.account_id,a.display_name,p.response from outlook_attendees p"
                  + " join accounts a on a.id=p.account_id join outlook_events e on e.id=p.event_id"
                  + " where e.starts_at<? and e.ends_at>? order by a.display_name,p.account_id",
              r -> {
                var e = byId.get(r.getObject("event_id", UUID.class));
                if (e != null)
                  e.attendees()
                      .add(
                          new Attendee(
                              r.getObject("account_id", UUID.class),
                              r.getString("display_name"),
                              r.getString("response")));
              },
              Timestamp.from(to),
              Timestamp.from(from));
          return events;
        });
  }

  public UUID create(String name, UUID clientId, Details d) {
    check(clientId != null, "Identificador obrigatório.");
    validate(d);
    return locked(
        () -> {
          var a = accounts.active(name);
          var old =
              db.queryForList(
                  "select id from outlook_events where creator_id=? and client_id=?",
                  UUID.class,
                  a.id(),
                  clientId);
          if (!old.isEmpty()) {
            var previous = event(old.getFirst());
            if (!previous.title().equals(d.title().strip())
                || !previous.game().equals(d.game().strip())
                || !previous.location().equals(d.location().strip())
                || !previous.description().equals(d.description().strip())
                || previous.startsAt().toEpochMilli() != d.startsAt().toEpochMilli()
                || previous.endsAt().toEpochMilli() != d.endsAt().toEpochMilli())
              throw new ResponseStatusException(
                  CONFLICT,
                  "Identificador reutilizado para outro evento. Confira a agenda antes de criar"
                      + " novamente.");
            return old.getFirst();
          }
          check(
              d.startsAt().isAfter(Instant.now().minusSeconds(300)),
              "Escolha um início futuro para a jogatina.");
          if (db.queryForObject(
                  "select count(*) from outlook_events where creator_id=? and"
                      + " created_at>now()-interval '1 minute'",
                  Integer.class,
                  a.id())
              >= 10)
            throw new ResponseStatusException(
                TOO_MANY_REQUESTS, "Aguarde um minuto antes de criar outro evento.");
          UUID id = UUID.randomUUID();
          db.update(
              "insert into"
                  + " outlook_events(id,creator_id,client_id,title,game,location,description,starts_at,ends_at)"
                  + " values(?,?,?,?,?,?,?,?,?)",
              id,
              a.id(),
              clientId,
              d.title().strip(),
              d.game().strip(),
              d.location().strip(),
              d.description().strip(),
              Timestamp.from(d.startsAt()),
              Timestamp.from(d.endsAt()));
          db.update("insert into outlook_attendees values(?,?,'going')", id, a.id());
          return id;
        });
  }

  public void update(String name, UUID id, int version, Details d) {
    validate(d);
    locked(
        () -> {
          canEdit(accounts.active(name), event(id), version);
          db.update(
              "update outlook_events set"
                  + " title=?,game=?,location=?,description=?,starts_at=?,ends_at=?,version=version+1"
                  + " where id=?",
              d.title().strip(),
              d.game().strip(),
              d.location().strip(),
              d.description().strip(),
              Timestamp.from(d.startsAt()),
              Timestamp.from(d.endsAt()),
              id);
          return null;
        });
  }

  public void cancel(String name, UUID id, int version) {
    locked(
        () -> {
          var a = accounts.active(name);
          var e = event(id);
          if (e.cancelled()
              && e.version() == version + 1
              && (a.admin() || a.id().equals(e.creatorId()))) return null;
          canEdit(a, e, version);
          db.update("update outlook_events set cancelled=true,version=version+1 where id=?", id);
          return null;
        });
  }

  public void respond(String name, UUID id, String response) {
    check(
        response != null && Set.of("going", "maybe", "declined").contains(response),
        "Resposta inválida.");
    locked(
        () -> {
          var a = accounts.active(name);
          var e = event(id);
          if (e.cancelled() || !e.endsAt().isAfter(Instant.now()))
            throw new ResponseStatusException(
                CONFLICT, "Este evento foi cancelado ou já terminou.");
          db.update(
              "insert into outlook_attendees values(?,?,?) on conflict(event_id,account_id) do"
                  + " update set response=excluded.response",
              id,
              a.id(),
              response);
          return null;
        });
  }
}
