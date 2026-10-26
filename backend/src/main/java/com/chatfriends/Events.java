package com.chatfriends;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class Events extends TextWebSocketHandler {
  final Map<String, WebSocketSession> sockets = new ConcurrentHashMap<>();
  final Map<String, Long> last = new ConcurrentHashMap<>();
  final ObjectMapper json;
  final Accounts accounts;
  final JdbcTemplate db;

  public Events(ObjectMapper json, Accounts accounts, JdbcTemplate db) {
    this.json = json;
    this.accounts = accounts;
    this.db = db;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession raw) throws Exception {
    if (raw.getPrincipal() == null) {
      raw.close(CloseStatus.NOT_ACCEPTABLE);
      return;
    }
    accounts.active(raw.getPrincipal().getName());
    raw.setTextMessageSizeLimit(128);
    sockets.put(raw.getId(), new ConcurrentWebSocketSessionDecorator(raw, 5000, 65536));
    last.put(raw.getId(), System.currentTimeMillis());
    presence();
  }

  @Override
  protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
    if (!m.getPayload().equals("ping")) {
      s.close(CloseStatus.BAD_DATA);
      return;
    }
    last.put(s.getId(), System.currentTimeMillis());
    sockets
        .get(s.getId())
        .sendMessage(new TextMessage(json.writeValueAsString(Map.of("type", "pong"))));
  }

  @Override
  public void afterConnectionClosed(WebSocketSession s, CloseStatus c) {
    sockets.remove(s.getId());
    last.remove(s.getId());
    presence();
  }

  public void broadcast(Object event) {
    try {
      String body = json.writeValueAsString(event);
      for (var s : sockets.values()) {
        try {
          s.sendMessage(new TextMessage(body));
        } catch (Exception e) {
          close(s);
        }
      }
    } catch (Exception e) {
      throw new IllegalStateException("Evento inválido", e);
    }
  }

  public void presence() {
    broadcast(
        Map.of(
            "type",
            "presence",
            "users",
            sockets.values().stream()
                .map(s -> s.getPrincipal().getName())
                .distinct()
                .sorted()
                .toList()));
  }

  public void closeUser(String name) {
    sockets.values().stream()
        .filter(s -> s.getPrincipal().getName().equals(name))
        .forEach(this::close);
  }

  private void close(WebSocketSession s) {
    try {
      s.close(CloseStatus.POLICY_VIOLATION);
    } catch (Exception ignored) {
    }
    sockets.remove(s.getId());
    last.remove(s.getId());
  }

  @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 10000)
  public void reap() {
    boolean changed = false;
    for (var s : sockets.values()) {
      String sid = (String) s.getAttributes().get("sessionId");
      boolean exists =
          db.queryForObject(
                  "select count(*) from spring_session where session_id=? and expiry_time>?",
                  Integer.class,
                  sid,
                  System.currentTimeMillis())
              > 0;
      if (!exists || System.currentTimeMillis() - last.getOrDefault(s.getId(), 0L) > 45000) {
        close(s);
        changed = true;
      }
    }
    if (changed) presence();
  }
}
