package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import java.security.Principal;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Personal keyboard shortcuts. The account always comes from the session, never the body. */
@RestController
@RequestMapping("/api/me/shortcuts")
public class Shortcuts {
  static final int FORMAT = 1, MAX_BINDINGS = 12;
  static final Set<String> PLATFORMS = Set.of("mac", "other");
  static final Set<String> ACTIONS =
      Set.of("toggleMic", "toggleDeaf", "pushToTalk", "leaveVoice", "toggleStreamSound");
  static final Pattern CODE = Pattern.compile("[A-Za-z0-9]{1,24}");
  static final Pattern UNMODIFIED = Pattern.compile("F(1[3-9]|2[0-4])");
  static final Set<String> MODIFIER_CODES =
      Set.of(
          "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight",
          "MetaLeft", "MetaRight", "OSLeft", "OSRight", "AltGraph", "CapsLock", "Fn", "FnLock");
  static final TypeReference<List<Binding>> BINDINGS = new TypeReference<>() {};

  final Accounts accounts;
  final RateLimit rate;
  final ObjectMapper json;

  public Shortcuts(Accounts accounts, RateLimit rate, ObjectMapper json) {
    this.accounts = accounts;
    this.rate = rate;
    this.json = json;
  }

  public record Binding(String action, String code, boolean ctrl, boolean alt, boolean shift,
      boolean meta) {}

  public record Settings(String platform, Long revision, Boolean enabled, Boolean allowWhileTyping,
      List<Binding> bindings) {}

  static String platform(String value) {
    if (value == null || !PLATFORMS.contains(value))
      throw new ResponseStatusException(BAD_REQUEST, "Plataforma inválida: use mac ou other");
    return value;
  }

  static void validate(List<Binding> bindings) {
    if (bindings == null)
      throw new ResponseStatusException(BAD_REQUEST, "Lista de atalhos obrigatória");
    if (bindings.size() > MAX_BINDINGS)
      throw new ResponseStatusException(BAD_REQUEST, "No máximo " + MAX_BINDINGS + " atalhos");
    var actions = new HashSet<String>();
    var combos = new HashSet<String>();
    for (var b : bindings) {
      if (b == null || b.action() == null || !ACTIONS.contains(b.action()))
        throw new ResponseStatusException(BAD_REQUEST, "Ação de atalho desconhecida");
      if (b.code() == null || !CODE.matcher(b.code()).matches())
        throw new ResponseStatusException(BAD_REQUEST, "Tecla inválida");
      if (MODIFIER_CODES.contains(b.code()))
        throw new ResponseStatusException(BAD_REQUEST, "Modificador isolado não é um atalho");
      if (!(b.ctrl() || b.alt() || b.meta()) && !UNMODIFIED.matcher(b.code()).matches())
        throw new ResponseStatusException(BAD_REQUEST, "Atalho exige Ctrl, Alt ou Meta");
      if (!actions.add(b.action()))
        throw new ResponseStatusException(BAD_REQUEST, "Ação repetida no mesmo perfil");
      String combo = b.code() + (b.ctrl() ? "+c" : "") + (b.alt() ? "+a" : "")
          + (b.shift() ? "+s" : "") + (b.meta() ? "+m" : "");
      if (!combos.add(combo))
        throw new ResponseStatusException(BAD_REQUEST, "Combinação repetida no mesmo perfil");
    }
  }

  Settings read(UUID account, String platform) {
    return accounts.db
        .query(
            "select revision,enabled,allow_while_typing,bindings::text from user_shortcuts"
                + " where account_id=? and platform=?",
            (r, n) -> {
              try {
                return new Settings(platform, r.getLong(1), r.getBoolean(2), r.getBoolean(3),
                    json.readValue(r.getString(4), BINDINGS));
              } catch (JacksonException e) {
                throw new IllegalStateException("Atalhos armazenados inválidos", e);
              }
            },
            account,
            platform)
        .stream()
        .findFirst()
        .orElseGet(() -> new Settings(platform, 0L, true, false, List.of()));
  }

  @GetMapping
  public Settings get(Principal p, @RequestParam(required = false) String platform) {
    return read(accounts.active(p.getName()).id(), platform(platform));
  }

  @PutMapping
  public Settings save(Principal p, @RequestBody Settings b) throws JacksonException {
    var a = accounts.active(p.getName());
    if (!rate.allow("shortcuts:" + a.id(), 30, 60))
      throw new ResponseStatusException(TOO_MANY_REQUESTS, "Muitas alterações; aguarde um minuto");
    String platform = platform(b.platform());
    long revision = b.revision() == null ? 0 : b.revision();
    if (revision < 0) throw new ResponseStatusException(BAD_REQUEST, "Revisão inválida");
    validate(b.bindings());
    boolean enabled = b.enabled() == null || b.enabled();
    boolean typing = b.allowWhileTyping() != null && b.allowWhileTyping();
    String bindings = json.writeValueAsString(b.bindings());
    // Compare-and-set in one statement: a stale revision changes nothing.
    int changed =
        revision == 0
            ? accounts.db.update(
                "insert into user_shortcuts(account_id,platform,revision,enabled,"
                    + "allow_while_typing,format_version,bindings) values(?,?,1,?,?,?,?::jsonb)"
                    + " on conflict(account_id,platform) do nothing",
                a.id(), platform, enabled, typing, FORMAT, bindings)
            : accounts.db.update(
                "update user_shortcuts set revision=revision+1,enabled=?,allow_while_typing=?,"
                    + "format_version=?,bindings=?::jsonb,updated_at=now()"
                    + " where account_id=? and platform=? and revision=?",
                enabled, typing, FORMAT, bindings, a.id(), platform, revision);
    if (changed != 1)
      throw new ResponseStatusException(
          CONFLICT, "Atalhos alterados em outra sessão; recarregue");
    return new Settings(platform, revision + 1, enabled, typing, b.bindings());
  }
}
