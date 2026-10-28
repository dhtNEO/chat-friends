package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Server-to-server only: neither the control key nor the bot JWT reaches a browser. */
@Component
public class MusicGateway {
  final ObjectMapper json;
  final String url, secretFile;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

  MusicGateway(ObjectMapper json, @Value("${app.music-url}") String url,
      @Value("${app.music-secret-file}") String secretFile) {
    this.json = json;
    this.url = url;
    this.secretFile = secretFile;
  }

  JsonNode call(String method, String path, Object body) {
    try {
      String secret = Files.readString(Path.of(secretFile)).strip();
      if (secret.length() < 32) throw new IllegalStateException();
      var request = HttpRequest.newBuilder(URI.create(url + path))
          .timeout(Duration.ofSeconds(path.startsWith("/search") ? 45 : 15))
          .header("Authorization", "Bearer " + secret)
          .header("Content-Type", "application/json")
          .method(method, body == null ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
      var response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() == 400)
        throw new ResponseStatusException(BAD_REQUEST, "Confira a música e tente novamente");
      if (response.statusCode() != 200 || response.body().length() > 65536)
        throw new IllegalStateException();
      return json.readTree(response.body());
    } catch (ResponseStatusException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new ResponseStatusException(SERVICE_UNAVAILABLE, "Bot de música indisponível");
    } catch (Exception e) {
      throw new ResponseStatusException(SERVICE_UNAVAILABLE, "Bot de música indisponível; tente novamente");
    }
  }

  JsonNode state() { return call("GET", "/state", null); }

  JsonNode search(String query) {
    return call("GET", "/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8), null);
  }

  JsonNode enqueue(String video, String who, String token) {
    return call("POST", "/queue", Map.of("videoId", video, "requestedBy", who, "token", token));
  }

  JsonNode control(String action) { return call("POST", "/control", Map.of("action", action)); }

  JsonNode remove(String id) { return call("DELETE", "/queue/" + id, null); }
}
