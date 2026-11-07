package com.scan.bff.security;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limite les essais de connexion ratés par adresse IP (anti force brute) :
 * {@value #MAX_FAILURES} échecs en {@link #WINDOW} bloquent l'adresse jusqu'à la fin de la fenêtre.
 * En mémoire : suffisant pour une instance unique.
 */
@Component
public class LoginAttemptLimiter {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);
    private static final int MAX_TRACKED = 1000;

    private record Attempts(int count, Instant since) {}

    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();
    private final Clock clock;

    public LoginAttemptLimiter() {
        this(Clock.systemUTC());
    }

    LoginAttemptLimiter(Clock clock) {
        this.clock = clock;
    }

    public boolean isBlocked(String key) {
        Attempts a = attempts.get(key);
        if (a == null) {
            return false;
        }
        if (expired(a)) {
            attempts.remove(key);
            return false;
        }
        return a.count() >= MAX_FAILURES;
    }

    public void recordFailure(String key) {
        if (attempts.size() >= MAX_TRACKED) {
            attempts.values().removeIf(this::expired); // évite une croissance sans fin
        }
        attempts.merge(key, new Attempts(1, clock.instant()),
                (old, fresh) -> expired(old) ? fresh : new Attempts(old.count() + 1, old.since()));
    }

    public void reset(String key) {
        attempts.remove(key);
    }

    private boolean expired(Attempts a) {
        return a.since().plus(WINDOW).isBefore(clock.instant());
    }
}
