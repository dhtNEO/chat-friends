package com.chatfriends;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Keep private music-worker requests off the existing voice/lease scheduler. */
@Configuration
public class GameScheduling {
  @Bean
  public ThreadPoolTaskScheduler taskScheduler() {
    var scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(1);
    scheduler.setThreadNamePrefix("space-");
    return scheduler;
  }

  @Bean
  public ThreadPoolTaskScheduler partyScheduler() {
    var scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(1);
    scheduler.setThreadNamePrefix("party-");
    return scheduler;
  }
}
