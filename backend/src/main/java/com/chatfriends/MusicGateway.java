package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Server-to-server only: neither the control key nor the bot JWT reaches a browser. */
@Component
public class MusicGateway {
  static final Logger log = LoggerFactory.getLogger(MusicGateway.class);
  final ObjectMapper json;
  final String url, secretFile;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

  MusicGateway(
      ObjectMapper json,
      @Value("${app.music-url}") String url,
      @Value("${app.music-secret-file}") String secretFile) {
    this.json = json;
    this.url = url;
    this.secretFile = secretFile;
  }

  ResponseStatusException unavailable(String operation, String reason, int status) {
    // Only fixed categories and status codes: no keys, URLs, queries or response bodies.
    log.warn("music_control operation={} reason={} status={}", operation, reason, status);
    return new ResponseStatusException(
        SERVICE_UNAVAILABLE, "Bot de música indisponível; tente novamente");
  }

  JsonNode call(String method, String path, Object body) {
    String operation =
        path.startsWith("/search")
            ? "search"
            : path.startsWith("/rhythm/") ? "rhythm" : path.equals("/state") ? "state" : "control";
    String secret;
    try {
      secret = Files.readString(Path.of(secretFile)).strip();
    } catch (IOException | RuntimeException e) {
      throw unavailable(operation, "key_read", 0);
    }
    if (secret.length() < 32) throw unavailable(operation, "key_invalid", 0);
    try {
      var request =
          HttpRequest.newBuilder(URI.create(url + path))
              .timeout(
                  Duration.ofSeconds(
                      path.equals("/rhythm/prepare")
                          ? 120
                          : path.equals("/state") || path.equals("/rhythm/release")
                              ? 3
                              : path.startsWith("/search") ? 45 : 15))
              .header("Authorization", "Bearer " + secret)
              .header("Content-Type", "application/json")
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
              .build();
      var response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() == 400)
        throw new ResponseStatusException(
            BAD_REQUEST,
            path.equals("/rhythm/prepare")
                ? "Deixe o bot livre e escolha uma música com batidas e pelo menos 15 segundos."
                : "Confira a música e tente novamente");
      if (response.statusCode() != 200)
        throw unavailable(
            operation,
            response.statusCode() == 401 || response.statusCode() == 403
                ? "authentication"
                : "http",
            response.statusCode());
      if (response.body().length() > 65536) throw unavailable(operation, "response_size", 200);
      return json.readTree(response.body());
    } catch (ResponseStatusException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw unavailable(operation, "interrupted", 0);
    } catch (HttpTimeoutException e) {
      throw unavailable(operation, "timeout", 0);
    } catch (ConnectException e) {
      throw unavailable(operation, "connection", 0);
    } catch (IOException e) {
      throw unavailable(operation, "transport", 0);
    } catch (Exception e) {
      throw unavailable(operation, "response", 0);
    }
  }

  JsonNode state() {
    return call("GET", "/state", null);
  }

  JsonNode search(String query) {
    return call("GET", "/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8), null);
  }

  JsonNode enqueue(String video, String who, String token) {
    return call("POST", "/queue", Map.of("videoId", video, "requestedBy", who, "token", token));
  }

  JsonNode control(String action) {
    return call("POST", "/control", Map.of("action", action));
  }

  JsonNode prepareRhythm(String id, String video, String who, String token) {
    return call(
        "POST",
        "/rhythm/prepare",
        Map.of("id", id, "videoId", video, "requestedBy", who, "token", token));
  }

  JsonNode startRhythm(String id, long startsAt) {
    return call("POST", "/rhythm/start", Map.of("id", id, "startsAt", startsAt));
  }

  JsonNode releaseRhythm(String id) {
    return call("POST", "/rhythm/release", Map.of("id", id));
  }

  JsonNode remove(String id) {
    return call("DELETE", "/queue/" + id, null);
  }
}
