package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import io.livekit.server.*;
import java.util.*;
import livekit.LivekitModels.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class LiveKitGateway {
  final RoomServiceClient client;
  final String key, secret, room, publicUrl;

  public LiveKitGateway(
      @Value("${app.livekit-url}") String url,
      @Value("${app.livekit-key}") String key,
      @Value("${app.livekit-secret}") String secret,
      @Value("${app.room}") String room,
      @Value("${app.livekit-public-url}") String publicUrl) {
    this.key = key;
    this.secret = secret;
    this.room = room;
    this.publicUrl = publicUrl;
    client =
        RoomServiceClient.create(
            url, key, secret, false, b -> b.callTimeout(java.time.Duration.ofSeconds(5)));
  }

  public String token(String identity, String name) {
    var t = new AccessToken(key, secret);
    t.setIdentity(identity);
    t.setName(name);
    t.setTtl(90000);
    t.addGrants(
        new RoomJoin(true),
        new RoomName(room),
        new CanPublish(true),
        new CanSubscribe(true),
        new CanPublishData(false),
        new CanPublishSources(List.of("microphone")),
        new CanUpdateOwnMetadata(false));
    return t.toJwt();
  }

  public String musicToken() {
    var t = new AccessToken(key, secret);
    t.setIdentity(Music.IDENTITY);
    t.setName("Bot de música");
    t.setTtl(86400000);
    t.addGrants(new RoomJoin(true), new RoomName(room), new CanPublish(true),
        new CanSubscribe(false), new CanPublishData(false),
        new CanPublishSources(List.of("microphone")), new CanUpdateOwnMetadata(false));
    return t.toJwt();
  }

  public List<ParticipantInfo> participants() {
    try {
      var r = client.listParticipants(room).execute();
      if (r.code() == 404) return List.of();
      if (!r.isSuccessful() || r.body() == null) throw new IllegalStateException();
      return r.body();
    } catch (Exception e) {
      throw new ResponseStatusException(SERVICE_UNAVAILABLE, "Mídia indisponível; tente novamente");
    }
  }

  public void permission(String identity, boolean screen) {
    var p =
        ParticipantPermission.newBuilder()
            .setCanSubscribe(true)
            .setCanPublish(true)
            .setCanPublishData(false)
            .addCanPublishSources(TrackSource.MICROPHONE);
    if (screen)
      p.addCanPublishSources(TrackSource.SCREEN_SHARE)
          .addCanPublishSources(TrackSource.SCREEN_SHARE_AUDIO);
    try {
      var r = client.updateParticipant(room, identity, null, null, p.build()).execute();
      if (!r.isSuccessful()) throw new IllegalStateException();
    } catch (Exception e) {
      throw new ResponseStatusException(
          SERVICE_UNAVAILABLE, "Não foi possível atualizar permissão de mídia");
    }
  }

  public void remove(String identity) {
    try {
      var r = client.removeParticipant(room, identity).execute();
      if (!r.isSuccessful() && r.code() != 404) throw new IllegalStateException();
    } catch (Exception e) {
      throw new ResponseStatusException(
          SERVICE_UNAVAILABLE, "Expulsão de mídia pendente; reconciliação tentará novamente");
    }
  }

  public void verifyWebhook(String body, String authorization) {
    try {
      new WebhookReceiver(key, secret).receive(body, authorization);
    } catch (Exception e) {
      throw new ResponseStatusException(UNAUTHORIZED);
    }
  }
}
