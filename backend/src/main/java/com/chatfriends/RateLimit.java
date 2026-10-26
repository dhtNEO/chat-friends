package com.chatfriends;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class RateLimit {
  final JdbcTemplate db;

  public RateLimit(JdbcTemplate db) {
    this.db = db;
  }

  public boolean allow(String key, int limit, int seconds) {
    int hits =
        db.queryForObject(
            """
            insert into rate_limits(key,window_start,hits) values(?,now(),1)
            on conflict(key) do update set
            hits=case when rate_limits.window_start < now()-make_interval(secs=>?) then 1 else rate_limits.hits+1 end,
            window_start=case when rate_limits.window_start < now()-make_interval(secs=>?) then now() else rate_limits.window_start end returning hits
            """,
            Integer.class,
            key,
            seconds,
            seconds);
    return hits <= limit;
  }

  @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 3600000)
  public void prune() {
    db.update("delete from rate_limits where window_start < now()-interval '1 day'");
  }
}
