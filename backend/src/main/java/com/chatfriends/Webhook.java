package com.chatfriends;

import org.springframework.web.bind.annotation.*;

@RestController
public class Webhook {
  final LiveKitGateway live;
  final Media media;
  final com.fasterxml.jackson.databind.ObjectMapper json;

  public Webhook(
      LiveKitGateway live, Media media, com.fasterxml.jackson.databind.ObjectMapper json) {
    this.live = live;
    this.media = media;
    this.json = json;
  }

  @PostMapping("/api/livekit/webhook")
  public void webhook(
      @RequestBody String body,
      @RequestHeader(value = "Authorization", required = false) String authorization)
      throws com.fasterxml.jackson.core.JsonProcessingException {
    live.verifyWebhook(body, authorization);
    var event = json.readTree(body);
    if (event.path("event").asText().equals("participant_left"))
      media.departed(event.path("participant").path("identity").asText());
    else media.reconcile();
  }
}
