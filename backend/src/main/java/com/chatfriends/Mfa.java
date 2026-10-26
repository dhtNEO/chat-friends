package com.chatfriends;

import static org.springframework.http.HttpStatus.*;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** RFC 6238 TOTP; encrypted server-side, single-use recovery codes and replay protection. */
@Service
public class Mfa {
  final Accounts accounts;
  final TransactionTemplate tx;
  final RequestBudget budget;
  final byte[] key;
  final SecureRandom random = new SecureRandom();

  public Mfa(
      Accounts accounts,
      TransactionTemplate tx,
      RequestBudget budget,
      @Value("${app.mfa-key:}") String key) {
    this.accounts = accounts;
    this.tx = tx;
    this.budget = budget;
    this.key = key.matches("[a-fA-F0-9]{64}") ? HexFormat.of().parseHex(key) : null;
  }

  boolean enabled(String user) {
    return accounts.db.queryForObject(
            "select count(*) from account_mfa where account_id=?",
            Integer.class,
            accounts.get(user).id())
        > 0;
  }

  void password(String user, String password) {
    if (!budget.allow("reauth:" + user, 8, 300))
      throw new ResponseStatusException(TOO_MANY_REQUESTS);
    if (password == null
        || password.length() > 128
        || !accounts.encoder.matches(password, accounts.loadUserByUsername(user).getPassword()))
      throw new ResponseStatusException(FORBIDDEN, "Senha ou código inválido");
  }

  String generate() {
    byte[] bytes = new byte[20];
    random.nextBytes(bytes);
    return base32(bytes);
  }

  static String base32(byte[] bytes) {
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    StringBuilder out = new StringBuilder();
    int bits = 0, value = 0;
    for (byte b : bytes) {
      value = (value << 8) | (b & 255);
      bits += 8;
      while (bits >= 5) {
        out.append(alphabet.charAt((value >> (bits - 5)) & 31));
        bits -= 5;
      }
    }
    if (bits > 0) out.append(alphabet.charAt((value << (5 - bits)) & 31));
    return out.toString();
  }

  static byte[] unbase32(String text) {
    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
    int bits = 0, value = 0;
    for (char c : text.toCharArray()) {
      int v = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
      if (v < 0) throw new IllegalArgumentException();
      value = (value << 5) | v;
      bits += 5;
      if (bits >= 8) {
        out.write((value >> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return out.toByteArray();
  }

  static String totp(String secret, long step) {
    try {
      Mac mac = Mac.getInstance("HmacSHA1");
      mac.init(new SecretKeySpec(unbase32(secret), "HmacSHA1"));
      byte[] hash = mac.doFinal(java.nio.ByteBuffer.allocate(8).putLong(step).array());
      int offset = hash[hash.length - 1] & 15;
      int n = java.nio.ByteBuffer.wrap(hash, offset, 4).getInt() & 0x7fffffff;
      return String.format(Locale.ROOT, "%06d", n % 1000000);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException(e);
    }
  }

  long step(String secret, String code) {
    if (code == null || !code.matches("[0-9]{6}")) return -1;
    long now = Instant.now().getEpochSecond() / 30;
    for (long i = now - 1; i <= now + 1; i++)
      if (MessageDigest.isEqual(
          totp(secret, i).getBytes(StandardCharsets.US_ASCII),
          code.getBytes(StandardCharsets.US_ASCII))) return i;
    return -1;
  }

  String crypt(String text, UUID account, boolean encrypt) {
    if (key == null)
      throw new ResponseStatusException(
          SERVICE_UNAVAILABLE, "Chave MFA indisponível; contate o operador");
    try {
      byte[] nonce = new byte[12], input;
      if (encrypt) {
        random.nextBytes(nonce);
        input = text.getBytes(StandardCharsets.UTF_8);
      } else {
        byte[] all = Base64.getDecoder().decode(text);
        nonce = Arrays.copyOfRange(all, 0, 12);
        input = Arrays.copyOfRange(all, 12, all.length);
      }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          encrypt ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, nonce));
      cipher.updateAAD(account.toString().getBytes(StandardCharsets.US_ASCII));
      byte[] result = cipher.doFinal(input);
      if (!encrypt) return new String(result, StandardCharsets.UTF_8);
      return Base64.getEncoder()
          .encodeToString(
              java.nio.ByteBuffer.allocate(12 + result.length).put(nonce).put(result).array());
    } catch (GeneralSecurityException | IllegalArgumentException e) {
      throw new ResponseStatusException(
          SERVICE_UNAVAILABLE, "Chave MFA indisponível; contate o operador");
    }
  }

  static String hash(String code) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException(e);
    }
  }

  List<String> enroll(String user, String secret, String code) {
    if (!budget.allow("mfa:" + user, 8, 300)) throw new ResponseStatusException(TOO_MANY_REQUESTS);
    long matched = step(secret, code);
    if (matched < 0) throw new ResponseStatusException(FORBIDDEN, "Código inválido");
    UUID id = accounts.get(user).id();
    List<String> recovery = new ArrayList<>();
    for (int i = 0; i < 8; i++) {
      byte[] b = new byte[16];
      random.nextBytes(b);
      recovery.add(HexFormat.of().formatHex(b));
    }
    tx.executeWithoutResult(
        s -> {
          accounts.db.update(
              "insert into account_mfa(account_id,secret,last_step) values(?,?,?)",
              id,
              crypt(secret, id, true),
              matched);
          for (String r : recovery)
            accounts.db.update("insert into mfa_recovery values(?,?)", id, hash(r));
        });
    return recovery;
  }

  void verify(String user, String code) {
    if (!budget.allow("mfa:" + user, 8, 300)) throw new ResponseStatusException(TOO_MANY_REQUESTS);
    UUID id = accounts.get(user).id();
    boolean valid =
        Boolean.TRUE.equals(
            tx.execute(
                s -> {
                  var rows =
                      accounts.db.queryForList(
                          "select secret,last_step from account_mfa where account_id=? for update",
                          id);
                  if (rows.isEmpty()) return false;
                  if (code != null
                      && code.matches("[a-f0-9]{32}")
                      && accounts.db.update(
                              "delete from mfa_recovery where account_id=? and code_hash=?",
                              id,
                              hash(code))
                          == 1) return true;
                  var row = rows.getFirst();
                  long matched = step(crypt((String) row.get("secret"), id, false), code);
                  if (matched < 0 || matched <= ((Number) row.get("last_step")).longValue())
                    return false;
                  accounts.db.update(
                      "update account_mfa set last_step=? where account_id=?", matched, id);
                  return true;
                }));
    if (!valid) throw new ResponseStatusException(FORBIDDEN, "Senha ou código inválido");
  }
}
