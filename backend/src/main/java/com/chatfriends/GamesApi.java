package com.chatfriends;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/games")
public class GamesApi {
  final Games games;

  public GamesApi(Games games) {
    this.games = games;
  }

  public record SpinRequest(@NotNull UUID clientId) {}

  public record RoomRequest(@NotNull UUID clientId, @NotNull Boolean solo) {}

  @GetMapping
  public Map<String, Object> overview(Principal p) {
    return games.overview(p.getName());
  }

  @PostMapping("/spin")
  public Map<String, Object> spin(Principal p, @Valid @RequestBody SpinRequest r) {
    return games.spin(p.getName(), r.clientId());
  }

  @PostMapping("/rooms")
  public Map<String, UUID> create(Principal p, @Valid @RequestBody RoomRequest r) {
    return Map.of("id", games.create(p.getName(), r.clientId(), r.solo()));
  }

  public record BetRequest(
      @NotNull UUID clientId,
      @NotNull UUID roundId,
      @NotNull String choice,
      @NotNull
          @DecimalMin("1")
          @DecimalMax("9223372036854775807")
          @Digits(integer = 19, fraction = 0)
          BigDecimal amount) {}

  @PostMapping("/rooms/{id}/bet")
  public void bet(Principal p, @PathVariable UUID id, @Valid @RequestBody BetRequest r) {
    games.roulette.bet(
        p.getName(), id, r.roundId(), r.clientId(), r.choice(), r.amount().longValueExact());
  }

  @PostMapping("/rooms/{id}/next")
  public void next(Principal p, @PathVariable UUID id, @Valid @RequestBody SpinRequest r) {
    games.roulette.next(p.getName(), id, r.clientId());
  }

  @PostMapping("/rooms/{id}/{action}")
  public void action(Principal p, @PathVariable UUID id, @PathVariable String action) {
    games.action(p.getName(), id, action);
  }
}
