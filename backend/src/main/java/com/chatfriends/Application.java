package com.chatfriends;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class Application {
  @org.springframework.context.annotation.Bean
  static org.springframework.security.crypto.password.PasswordEncoder passwordEncoder() {
    return new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12);
  }

  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
