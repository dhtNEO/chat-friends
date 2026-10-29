package com.chatfriends;

import static org.junit.jupiter.api.Assertions.*;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class MusicGatewayTest {
  @TempDir Path temp;
  HttpServer server;
  Path key;
  String address;
  String secret = "test-only-music-control-credential-000000000000";
  AtomicReference<String> accepted = new AtomicReference<>(secret);
  int status = 200;
  String body = "{\"status\":\"idle\",\"queue\":[],\"rhythm\":null}";
  ListAppender<ILoggingEvent> logs;
  Logger logger;

  @BeforeEach
  void setup() throws Exception {
    key = temp.resolve("control.key");
    Files.writeString(key, secret);
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/",
        exchange -> {
          boolean valid =
              ("Bearer " + accepted.get())
                  .equals(exchange.getRequestHeaders().getFirst("Authorization"));
          byte[] bytes =
              (valid ? body : "private-worker-diagnostic").getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(valid ? status : 401, bytes.length);
          try (var output = exchange.getResponseBody()) {
            output.write(bytes);
          }
        });
    server.start();
    address = "http://127.0.0.1:" + server.getAddress().getPort();
    logger = (Logger) LoggerFactory.getLogger(MusicGateway.class);
    logs = new ListAppender<>();
    logs.start();
    logger.addAppender(logs);
  }

  @AfterEach
  void cleanup() {
    server.stop(0);
    logger.detachAppender(logs);
    logs.stop();
  }

  MusicGateway gateway() {
    return new MusicGateway(JsonMapper.builder().build(), address, key.toString());
  }

  String messages() {
    return String.join("\n", logs.list.stream().map(ILoggingEvent::getFormattedMessage).toList());
  }

  @Test
  void readsStateThroughRealJavaHttpClient() {
    assertEquals("idle", gateway().state().path("status").asString());
    assertTrue(logs.list.isEmpty());
  }

  @Test
  void keyRotationIsReadWithoutRecreatingTheClient() throws Exception {
    var client = gateway();
    assertEquals("idle", client.state().path("status").asString());
    String rotated = "rotated-test-only-control-credential-000000000";
    Path next = temp.resolve("next");
    Files.writeString(next, rotated);
    Files.move(next, key, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    accepted.set(rotated);
    assertEquals("idle", client.state().path("status").asString());
  }

  @Test
  void authMismatchHasSafeDiagnosticAndDoesNotExposeSecretsOrQueries() {
    accepted.set("other-test-only-control-credential-000000000");
    var error =
        assertThrows(ResponseStatusException.class, () -> gateway().search("private-query-value"));
    assertEquals(503, error.getStatusCode().value());
    assertTrue(messages().contains("operation=search reason=authentication status=401"));
    for (String value :
        new String[] {secret, "private-query-value", "private-worker-diagnostic", address})
      assertFalse(messages().contains(value));
  }

  @Test
  void unreadableAndInvalidKeyAreDistinguishableAndFailClosed() throws Exception {
    Files.delete(key);
    assertThrows(ResponseStatusException.class, () -> gateway().state());
    assertTrue(messages().contains("reason=key_read"));
    Files.writeString(key, "short");
    assertThrows(ResponseStatusException.class, () -> gateway().state());
    assertTrue(messages().contains("reason=key_invalid"));
  }

  @Test
  void badInputIsStill400AndWorkerHttpErrorsAre503() {
    status = 400;
    assertEquals(
        400,
        assertThrows(ResponseStatusException.class, () -> gateway().search("test"))
            .getStatusCode()
            .value());
    status = 500;
    assertEquals(
        503,
        assertThrows(ResponseStatusException.class, () -> gateway().state())
            .getStatusCode()
            .value());
    assertTrue(messages().contains("reason=http status=500"));
  }

  @Test
  void malformedJsonAndConnectionFailureHaveSafeDiagnostics() {
    body = "private-invalid-json-value";
    assertThrows(ResponseStatusException.class, () -> gateway().state());
    assertTrue(messages().contains("reason=response"));
    assertFalse(messages().contains(body));
    server.stop(0);
    assertThrows(ResponseStatusException.class, () -> gateway().state());
    assertTrue(messages().contains("reason=connection"));
  }
}
