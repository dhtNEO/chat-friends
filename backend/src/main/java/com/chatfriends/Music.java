package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import tools.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Set;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/music")
public class Music {
  static final String IDENTITY = "music-bot";
  final Media media;
  final MusicGateway bot;

  Music(Media media, MusicGateway bot) {
    this.media = media;
    this.bot = bot;
  }

  void listener(Principal p, HttpServletRequest q, String identity) {
    media.own(identity, p, q);
    if (!media.validConnection(identity)) throw new ResponseStatusException(UNAUTHORIZED);
    if (media.live.participants().stream().noneMatch(x -> x.getIdentity().equals(identity)))
      throw new ResponseStatusException(CONFLICT, "Entre na voz primeiro");
  }

  void limit(Principal p, String operation, int maximum) {
    if (!media.rate.allow("music:" + operation + ":" + p.getName(), maximum, 60))
      throw new ResponseStatusException(TOO_MANY_REQUESTS);
  }

  @GetMapping("/state")
  public JsonNode state() { return bot.state(); }

  @GetMapping("/search")
  public JsonNode search(Principal p, HttpServletRequest q, @RequestParam String identity,
      @RequestParam("q") String qtext) {
    listener(p, q, identity);
    if (qtext.isBlank() || qtext.length() > 200 || qtext.chars().anyMatch(x -> x < 32))
      throw new ResponseStatusException(BAD_REQUEST, "Digite um nome ou link do YouTube");
    limit(p, "search", 12);
    return bot.search(qtext.strip());
  }

  public record Enqueue(String identity, String videoId) {}

  @PostMapping("/queue")
  public JsonNode enqueue(Principal p, HttpServletRequest q, @RequestBody Enqueue b) {
    listener(p, q, b.identity());
    if (b.videoId() == null || !b.videoId().matches("[A-Za-z0-9_-]{11}"))
      throw new ResponseStatusException(BAD_REQUEST, "Vídeo inválido");
    limit(p, "queue", 20);
    return bot.enqueue(b.videoId(), media.accounts.active(p.getName()).displayName(),
        media.live.musicToken());
  }

  public record Control(String identity, String action) {}

  @PostMapping("/control")
  public JsonNode control(Principal p, HttpServletRequest q, @RequestBody Control b) {
    listener(p, q, b.identity());
    if (b.action() == null || !Set.of("pause", "resume", "skip", "stop").contains(b.action()))
      throw new ResponseStatusException(BAD_REQUEST, "Controle inválido");
    limit(p, "control", 40);
    return bot.control(b.action());
  }

  @DeleteMapping("/queue/{id}")
  public JsonNode remove(Principal p, HttpServletRequest q, @PathVariable String id,
      @RequestBody Media.Connection b) {
    listener(p, q, b.identity());
    try { java.util.UUID.fromString(id); }
    catch (IllegalArgumentException e) { throw new ResponseStatusException(BAD_REQUEST); }
    limit(p, "control", 40);
    return bot.remove(id);
  }
}
