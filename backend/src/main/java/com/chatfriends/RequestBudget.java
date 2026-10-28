package com.chatfriends;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Bounded admission budget. Untrusted identifiers never create unbounded DB rows. */
@Component
public class RequestBudget {
  private record Bucket(long start, int hits) {}

  private final Map<String, Bucket> buckets = new LinkedHashMap<>();
  private final Clock clock;
  static final int MAX_KEYS = 4096;

  public RequestBudget() {
    this(Clock.systemUTC());
  }

  RequestBudget(Clock clock) {
    this.clock = clock;
  }

  public synchronized boolean allow(String key, int limit, int seconds) {
    long now = clock.millis();
    buckets.entrySet().removeIf(e -> now - e.getValue().start() >= 300_000);
    Bucket b = buckets.get(key);
    if (b == null && buckets.size() >= MAX_KEYS) return false;
    if (b == null || now - b.start() >= seconds * 1000L) b = new Bucket(now, 0);
    if (b.hits() >= limit) return false;
    buckets.put(key, new Bucket(b.start(), b.hits() + 1));
    return true;
  }

  synchronized int size() {
    return buckets.size();
  }
}
