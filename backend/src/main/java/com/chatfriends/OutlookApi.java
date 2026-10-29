package com.chatfriends;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.time.Instant;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/outlook")
public class OutlookApi {
  final Outlook outlook;

  public OutlookApi(Outlook outlook) {
    this.outlook = outlook;
  }

  public record Create(@NotNull UUID clientId, @Valid @NotNull Outlook.Details details) {}

  public record Edit(@Min(1) int version, @Valid @NotNull Outlook.Details details) {}

  public record Cancel(@Min(1) int version) {}

  public record Response(@NotNull String response) {}

  @GetMapping
  public List<Outlook.CalendarEvent> list(
      Principal p, @RequestParam Instant from, @RequestParam Instant to) {
    return outlook.list(p.getName(), from, to);
  }

  @PostMapping
  public Map<String, UUID> create(Principal p, @Valid @RequestBody Create r) {
    return Map.of("id", outlook.create(p.getName(), r.clientId(), r.details()));
  }

  @PutMapping("/{id}")
  public void update(Principal p, @PathVariable UUID id, @Valid @RequestBody Edit r) {
    outlook.update(p.getName(), id, r.version(), r.details());
  }

  @PostMapping("/{id}/cancel")
  public void cancel(Principal p, @PathVariable UUID id, @Valid @RequestBody Cancel r) {
    outlook.cancel(p.getName(), id, r.version());
  }

  @PostMapping("/{id}/response")
  public void respond(Principal p, @PathVariable UUID id, @Valid @RequestBody Response r) {
    outlook.respond(p.getName(), id, r.response());
  }
}
