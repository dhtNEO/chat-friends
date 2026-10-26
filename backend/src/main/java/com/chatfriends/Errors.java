package com.chatfriends;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class Errors {
  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<?> status(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode())
        .body(Map.of("error", e.getReason() == null ? "Operação recusada" : e.getReason()));
  }

  @ExceptionHandler({org.springframework.dao.DuplicateKeyException.class})
  ResponseEntity<?> duplicate() {
    return ResponseEntity.status(409).body(Map.of("error", "Registro já existe"));
  }
}
