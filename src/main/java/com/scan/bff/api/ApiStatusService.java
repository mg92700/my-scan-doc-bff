package com.scan.bff.api;

import com.scan.bff.config.ApiProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Indique si my-scan-doc-api répond (son {@code /actuator/health}, public et sans détail).
 * Le résultat est gardé 5 secondes pour qu'un appel répété ne sollicite pas l'API.
 * Effet voulu : interroger l'API la réveille quand elle dort (offre gratuite).
 */
@Component
public class ApiStatusService {

    static final Duration CACHE = Duration.ofSeconds(5);
    private static final Duration TIMEOUT = Duration.ofSeconds(8);

    private final HttpClient http;
    private final URI healthUri;
    private final Clock clock;
    private Instant checkedAt = Instant.MIN;
    private boolean up;

    @Autowired
    public ApiStatusService(ApiProperties props) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                        .followRedirects(HttpClient.Redirect.NEVER).build(),
                URI.create(props.baseUrl().replaceAll("/+$", "") + "/actuator/health"),
                Clock.systemUTC());
    }

    ApiStatusService(HttpClient http, URI healthUri, Clock clock) {
        this.http = http;
        this.healthUri = healthUri;
        this.clock = clock;
    }

    public synchronized boolean isUp() {
        Instant now = clock.instant();
        if (checkedAt.plus(CACHE).isAfter(now)) {
            return up;
        }
        up = probe();
        checkedAt = clock.instant();
        return up;
    }

    private boolean probe() {
        try {
            HttpRequest request = HttpRequest.newBuilder(healthUri).timeout(TIMEOUT).GET().build();
            return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (IOException | RuntimeException e) {
            return false; // injoignable, en veille ou délai dépassé
        }
    }
}
