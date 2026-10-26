package com.chatfriends;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.*;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.HandshakeInterceptor;

@Configuration
@EnableWebSocket
public class WebSockets implements WebSocketConfigurer {
  final Events events;
  final String origin;

  public WebSockets(Events events, @Value("${app.origin}") String origin) {
    this.events = events;
    this.origin = origin;
  }

  public void registerWebSocketHandlers(WebSocketHandlerRegistry r) {
    r.addHandler(events, "/ws")
        .setAllowedOrigins(origin)
        .addInterceptors(
            new HandshakeInterceptor() {
              public boolean beforeHandshake(
                  ServerHttpRequest q,
                  ServerHttpResponse s,
                  WebSocketHandler h,
                  Map<String, Object> a) {
                if (!origin.equals(q.getHeaders().getOrigin())) return false;
                if (q instanceof ServletServerHttpRequest req) {
                  var session = req.getServletRequest().getSession(false);
                  if (session != null) {
                    a.put("sessionId", session.getId());
                    return true;
                  }
                }
                return false;
              }

              public void afterHandshake(
                  ServerHttpRequest q, ServerHttpResponse s, WebSocketHandler h, Exception e) {}
            });
  }
}
