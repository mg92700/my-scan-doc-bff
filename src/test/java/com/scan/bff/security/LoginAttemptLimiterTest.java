package com.scan.bff.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class LoginAttemptLimiterTest {

    /** Horloge modifiable pour tester l'expiration de la fenêtre. */
    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private final MutableClock clock = new MutableClock();
    private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock);

    @Test
    void bloque_apres_le_nombre_maximal_d_echecs() {
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES - 1; i++) {
            limiter.recordFailure("1.1.1.1");
        }
        assertThat(limiter.isBlocked("1.1.1.1")).isFalse();

        limiter.recordFailure("1.1.1.1");

        assertThat(limiter.isBlocked("1.1.1.1")).isTrue();
        assertThat(limiter.isBlocked("2.2.2.2")).as("autre adresse non concernée").isFalse();
    }

    @Test
    void se_debloque_a_la_fin_de_la_fenetre() {
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
            limiter.recordFailure("1.1.1.1");
        }
        clock.now = clock.now.plus(LoginAttemptLimiter.WINDOW).plus(Duration.ofSeconds(1));

        assertThat(limiter.isBlocked("1.1.1.1")).isFalse();
    }

    @Test
    void un_echec_apres_expiration_repart_de_un() {
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
            limiter.recordFailure("1.1.1.1");
        }
        clock.now = clock.now.plus(LoginAttemptLimiter.WINDOW).plus(Duration.ofSeconds(1));

        limiter.recordFailure("1.1.1.1");

        assertThat(limiter.isBlocked("1.1.1.1")).isFalse();
    }

    @Test
    void reset_efface_les_echecs() {
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
            limiter.recordFailure("1.1.1.1");
        }
        limiter.reset("1.1.1.1");

        assertThat(limiter.isBlocked("1.1.1.1")).isFalse();
    }

    @Test
    void nettoie_les_entrees_expirees_quand_la_table_est_pleine() {
        for (int i = 0; i < 1000; i++) {
            limiter.recordFailure("ip-" + i);
        }
        clock.now = clock.now.plus(LoginAttemptLimiter.WINDOW).plus(Duration.ofSeconds(1));

        limiter.recordFailure("nouvelle");

        assertThat(limiter.isBlocked("ip-0")).isFalse();
        assertThat(limiter.isBlocked("nouvelle")).isFalse();
    }

    @Test
    void constructeur_par_defaut_utilise_l_horloge_systeme() {
        LoginAttemptLimiter reel = new LoginAttemptLimiter();
        reel.recordFailure("x");
        assertThat(reel.isBlocked("x")).isFalse();
    }
}
