package com.chatfriends;

import org.springframework.web.bind.annotation.*;

@RestController
public class Webhook {
  final LiveKitGateway live;
  final Media media;

  public Webhook(LiveKitGateway live, Media media) {
    this.live = live;
    this.media = media;
  }

  @PostMapping("/api/livekit/webhook")
  public void webhook(
      @RequestBody String body,
      @RequestHeader(value = "Authorization", required = false) String authorization) {
    live.verifyWebhook(body, authorization);
    media.reconcile();
  }
}
