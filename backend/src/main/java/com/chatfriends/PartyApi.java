package com.chatfriends;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/party")
public class PartyApi {
  final PartyGames games;
  final Music music;

  public PartyApi(PartyGames games, Music music) {
    this.games = games;
    this.music = music;
  }

  public record Create(@NotNull UUID clientId, @NotNull String kind, String videoId) {}

  public record Action(@NotNull UUID clientId, String identity, UUID roundId) {}

  public record Note(@NotNull @Min(0) Integer note, @NotNull @Min(0) @Max(3) Integer lane) {}

  @GetMapping
  public Map<String, Object> overview(Principal p) {
    return games.overview(p.getName());
  }

  @GetMapping("/music/search")
  public Object search(
      Principal p,
      HttpServletRequest q,
      @RequestParam String identity,
      @RequestParam("q") String query) {
    return music.search(p, q, identity, query);
  }

  @PostMapping
  public Map<String, UUID> create(Principal p, @Valid @RequestBody Create r) {
    return Map.of("id", games.create(p.getName(), r.clientId(), r.kind(), r.videoId()));
  }

  @PostMapping("/{id}/start")
  public void start(
      Principal p, HttpServletRequest q, @PathVariable UUID id, @Valid @RequestBody Action r) {
    var room = games.row(id);
    if (room.get("kind").equals("rhythm")) {
      music.listener(p, q, r.identity());
      games.rhythmStart(p.getName(), id);
    } else games.action(p.getName(), id, r.clientId(), "start", null, r.roundId());
  }

  @PostMapping("/{id}/note")
  public Map<String, Integer> note(Principal p, @PathVariable UUID id, @Valid @RequestBody Note r) {
    return Map.of("points", games.note(p.getName(), id, r.note(), r.lane()));
  }

  @PostMapping("/{id}/{action}")
  public void action(
      Principal p,
      HttpServletRequest q,
      @PathVariable UUID id,
      @PathVariable String action,
      @Valid @RequestBody Action r) {
    if (action.equals("ready") && games.row(id).get("kind").equals("rhythm"))
      music.listener(p, q, r.identity());
    games.action(p.getName(), id, r.clientId(), action, r.identity(), r.roundId());
  }
}
