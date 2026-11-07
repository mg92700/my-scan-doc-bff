package com.scan.bff.api;

import com.scan.bff.config.ApiProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class ApiStatusServiceTest {

    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private HttpServer server;
    private final AtomicInteger hits = new AtomicInteger();
    private volatile int code = 200;
    private final MutableClock clock = new MutableClock();
    private ApiStatusService service;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/actuator/health", exchange -> {
            hits.incrementAndGet();
            exchange.sendResponseHeaders(code, -1);
            exchange.close();
        });
        server.start();
        URI uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/actuator/health");
        service = new ApiStatusService(HttpClient.newHttpClient(), uri, clock);
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void disponible_quand_l_api_repond_200() {
        assertThat(service.isUp()).isTrue();
    }

    @Test
    void indisponible_quand_l_api_repond_une_erreur() {
        code = 503;
        assertThat(service.isUp()).isFalse();
    }

    @Test
    void indisponible_quand_l_api_est_injoignable() {
        server.stop(0);
        assertThat(service.isUp()).isFalse();
    }

    @Test
    void le_resultat_est_garde_quelques_secondes_puis_recontrole() {
        service.isUp();
        service.isUp();
        assertThat(hits.get()).isEqualTo(1);

        code = 503;
        clock.now = clock.now.plus(ApiStatusService.CACHE).plusSeconds(1);

        assertThat(service.isUp()).isFalse();
        assertThat(hits.get()).isEqualTo(2);
    }

    @Test
    void constructeur_spring_normalise_l_adresse() {
        ApiStatusService fromProps = new ApiStatusService(new ApiProperties("http://127.0.0.1:1/", "svc", "pw", null));
        assertThat(fromProps.isUp()).isFalse(); // aucun serveur sur le port 1
    }
}
