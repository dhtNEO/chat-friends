package com.chatfriends;

import java.nio.file.*;
import org.springframework.boot.*;
import org.springframework.context.*;
import org.springframework.stereotype.Component;

@Component
public class Bootstrap implements ApplicationRunner {
  final Accounts accounts;
  final ConfigurableApplicationContext context;

  public Bootstrap(Accounts accounts, ConfigurableApplicationContext context) {
    this.accounts = accounts;
    this.context = context;
  }

  public void run(ApplicationArguments args) throws Exception {
    if (!args.containsOption("bootstrap-admin")) return;
    String username = args.getOptionValues("bootstrap-admin").getFirst();
    if (accounts.db.queryForObject(
            "select count(*) from accounts where username=?", Integer.class, username)
        > 0) {
      if (!accounts.get(username).admin())
        throw new IllegalStateException("Conta existente não é administradora");
      System.out.println("Administrador já existe; senha preservada.");
    } else {
      String path = System.getenv("ADMIN_PASSWORD_FILE");
      if (path == null) throw new IllegalArgumentException("ADMIN_PASSWORD_FILE obrigatório");
      String password = Files.readString(Path.of(path)).stripTrailing();
      accounts.create(username, username, password, true);
      System.out.println("Administrador criado.");
    }
    System.exit(SpringApplication.exit(context));
  }
}
