package com.scan.bff.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import java.util.Map;
import java.util.Set;

/**
 * Traduit les erreurs de l'API en réponses propres pour le navigateur.
 * Seules les erreurs « utilisateur » (400, 404, 413, 415) sont relayées avec leur message ;
 * tout le reste devient un 502/504 générique, jamais le détail interne.
 */
@RestControllerAdvice
public class BffExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(BffExceptionHandler.class);
    private static final Set<Integer> RELAYED = Set.of(400, 404, 413, 415);

    @ExceptionHandler(RestClientResponseException.class)
    public ResponseEntity<Map<String, String>> handleApiError(RestClientResponseException ex) {
        HttpStatusCode status = ex.getStatusCode();
        if (RELAYED.contains(status.value())) {
            return ResponseEntity.status(status).body(Map.of("message", ex.getResponseBodyAsString()));
        }
        log.error("my-scan-doc-api a répondu {}", status.value());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("message", "Service documents indisponible."));
    }

    @ExceptionHandler(ResourceAccessException.class)
    public ResponseEntity<Map<String, String>> handleTimeout(ResourceAccessException ex) {
        log.error("my-scan-doc-api injoignable", ex);
        return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                .body(Map.of("message", "Le service documents ne répond pas, réessayez dans un instant."));
    }

    @ExceptionHandler(ApiUnavailableException.class)
    public ResponseEntity<Map<String, String>> handleUnavailable(ApiUnavailableException ex) {
        log.error("Compte de service refusé ou API injoignable: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("message", "Service documents indisponible."));
    }
}
