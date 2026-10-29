package com.chatfriends;

import java.sql.SQLException;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.springframework.boot.flyway.autoconfigure.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Preserve both released V3 histories without repair or changing applied SQL/checksums. */
@Configuration
public class MigrationHistory {
  @Bean
  FlywayConfigurationCustomizer legacyMigrationHistory() {
    return MigrationHistory::select;
  }

  static void select(FluentConfiguration config) {
    String legacy = "main";
    try (var connection = config.getDataSource().getConnection()) {
      String schema = config.getDefaultSchema();
      if (schema == null) schema = connection.getSchema();
      String table = "\"" + schema.replace("\"", "\"\"") + "\".\"flyway_schema_history\"";
      try (var query =
              connection.prepareStatement(
                  "select script from " + table + " where version='3' and success=true");
          var rows = query.executeQuery()) {
        if (rows.next()) {
          legacy =
              switch (rows.getString(1)) {
                case "V3__account_security.sql" -> "security";
                case "V3__profiles.sql" -> "main";
                default ->
                    throw new IllegalStateException(
                        "Histórico V3 desconhecido; migração interrompida");
              };
        }
      } catch (SQLException e) {
        // New installations have no history table yet. All other errors must fail closed.
        if (!"42P01".equals(e.getSQLState())) throw e;
      }
    } catch (SQLException e) {
      throw new IllegalStateException("Não foi possível verificar o histórico de migrações", e);
    }
    config.locations("classpath:db/migration", "classpath:db/legacy-" + legacy);
  }
}
