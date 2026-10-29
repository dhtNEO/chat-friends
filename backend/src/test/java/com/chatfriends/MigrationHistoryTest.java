package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class MigrationHistoryTest {
  DriverManagerDataSource source;
  JdbcTemplate db;
  String schema;

  @BeforeEach
  void isolatedSchema() {
    source =
        new DriverManagerDataSource(
            System.getenv("DATABASE_URL"),
            System.getenv("POSTGRES_USER"),
            System.getenv("POSTGRES_PASSWORD"));
    db = new JdbcTemplate(source);
    schema = "migration_test_" + UUID.randomUUID().toString().replace("-", "");
    db.execute("CREATE SCHEMA " + schema);
  }

  @AfterEach
  void removeOnlyTestSchema() {
    if (schema != null) db.execute("DROP SCHEMA " + schema + " CASCADE");
  }

  FluentConfiguration config() {
    return Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema);
  }

  void upgrade() {
    var config = config();
    MigrationHistory.select(config);
    config.load().migrate();
    assertTrue(config.load().validateWithResult().validationSuccessful);
  }

  void assertComplete() {
    for (var table : new String[] {"accounts", "avatars", "account_mfa", "mfa_recovery"})
      assertNotNull(db.queryForObject("select to_regclass(?)", String.class, schema + "." + table));
    assertEquals(
        "11",
        db.queryForObject(
            "select version from "
                + schema
                + ".flyway_schema_history order by installed_rank desc limit 1",
            String.class));
  }

  @Test
  void freshInstallation() {
    upgrade();
    assertComplete();
  }

  @Test
  void profilesHistoryKeepsChecksumAndUserData() {
    config()
        .locations("classpath:db/migration", "classpath:db/legacy-main")
        .target("3")
        .load()
        .migrate();
    var history =
        db.queryForMap(
            "select script, checksum from " + schema + ".flyway_schema_history where version='3'");
    var id = UUID.randomUUID();
    db.update(
        "insert into "
            + schema
            + ".accounts(id,username,display_name,password_hash,primary_color) values(?,?,?,?,?)",
        id,
        "retained",
        "Perfil preservado",
        "test-only",
        "#abcdef");
    db.update(
        "insert into " + schema + ".avatars values(?,?,?,?)",
        id,
        "image/png",
        new byte[] {1, 2, 3},
        42L);
    db.update(
        "insert into " + schema + ".messages(author_id,client_id,body) values(?,?,?)",
        id,
        UUID.randomUUID(),
        "Histórico preservado");
    db.update(
        "insert into " + schema + ".spring_session values(?,?,0,0,7200,7200000,?)",
        UUID.randomUUID().toString(),
        UUID.randomUUID().toString(),
        "retained");
    upgrade();
    assertComplete();
    assertEquals(
        0, db.queryForObject("select count(*) from " + schema + ".spring_session", Integer.class));
    assertEquals(
        "Histórico preservado",
        db.queryForObject("select body from " + schema + ".messages", String.class));
    assertEquals(
        history,
        db.queryForMap(
            "select script, checksum from " + schema + ".flyway_schema_history where version='3'"));
    assertEquals(
        "#abcdef",
        db.queryForObject(
            "select primary_color from " + schema + ".accounts where id=?", String.class, id));
    assertEquals(
        42L,
        db.queryForObject(
            "select version from " + schema + ".avatars where account_id=?", Long.class, id));
  }

  @Test
  void securityHistoryKeepsChecksumMfaAndSessions() {
    config()
        .locations("classpath:db/migration", "classpath:db/legacy-security")
        .target("4")
        .load()
        .migrate();
    var history =
        db.queryForMap(
            "select script, checksum from " + schema + ".flyway_schema_history where version='3'");
    var id = UUID.randomUUID();
    db.update(
        "insert into "
            + schema
            + ".accounts(id,username,display_name,password_hash) values(?,?,?,?)",
        id,
        "retained",
        "Segurança preservada",
        "test-only");
    db.update("insert into " + schema + ".account_mfa values(?,?,?)", id, "retained-secret", 123L);
    db.update("insert into " + schema + ".mfa_recovery values(?,?)", id, "f".repeat(64));
    db.update(
        "insert into " + schema + ".spring_session values(?,?,0,0,7200,7200000,?)",
        UUID.randomUUID().toString(),
        UUID.randomUUID().toString(),
        "retained");
    upgrade();
    assertComplete();
    assertEquals(
        history,
        db.queryForMap(
            "select script, checksum from " + schema + ".flyway_schema_history where version='3'"));
    assertEquals(
        "retained-secret",
        db.queryForObject(
            "select secret from " + schema + ".account_mfa where account_id=?", String.class, id));
    assertEquals(
        1, db.queryForObject("select count(*) from " + schema + ".mfa_recovery", Integer.class));
    assertEquals(
        1, db.queryForObject("select count(*) from " + schema + ".spring_session", Integer.class));
  }

  @Test
  void alteredChecksumIsStillRejected() {
    config()
        .locations("classpath:db/migration", "classpath:db/legacy-security")
        .target("3")
        .load()
        .migrate();
    db.update("update " + schema + ".flyway_schema_history set checksum=0 where version='3'");
    var config = config();
    MigrationHistory.select(config);
    assertFalse(config.load().validateWithResult().validationSuccessful);
  }
}
