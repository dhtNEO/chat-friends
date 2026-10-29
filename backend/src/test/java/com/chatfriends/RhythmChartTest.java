package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class RhythmChartTest {
  @Test
  void difficultyKeepsRealTimestampsAndReducesDensity() {
    var notes = new ArrayList<Map<String, Integer>>();
    for (int i = 0; i < 120; i++) notes.add(Map.of("at", 2100 + 125 * i, "lane", i % 4));
    var easy = PartyGames.rhythmChart(notes, "easy");
    var normal = PartyGames.rhythmChart(notes, "normal");
    var hard = PartyGames.rhythmChart(notes, "hard");
    assertTrue(easy.size() < normal.size());
    assertTrue(normal.size() < hard.size());
    assertEquals(notes, hard);
    for (var chart : List.of(easy, normal, hard)) {
      assertTrue(notes.containsAll(chart));
      assertTrue(chart.getLast().get("at") > 16000);
    }
  }

  @Test
  void aWeakPickupCannotReplaceAStrongBeatOnEasierLevels() {
    var notes =
        List.of(
            Map.of("at", 2100, "lane", 1, "strength", 10),
            Map.of("at", 2220, "lane", 0, "strength", 900));
    assertEquals(List.of(Map.of("at", 2220, "lane", 0)), PartyGames.rhythmChart(notes, "normal"));
    assertEquals(2, PartyGames.rhythmChart(notes, "hard").size());
  }
}
