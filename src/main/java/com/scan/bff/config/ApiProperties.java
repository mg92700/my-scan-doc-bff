package com.scan.bff.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Connexion à my-scan-doc-api avec le compte de service (valeurs lues dans .env).
 * Le mot de passe n'est jamais journalisé ni renvoyé au navigateur.
 */
@ConfigurationProperties(prefix = "app.api")
public record ApiProperties(String baseUrl, String username, String password, Duration readTimeout) {

    public ApiProperties {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalStateException("API_BASE_URL manquant (voir .env.example)");
        }
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new IllegalStateException("API_SERVICE_USERNAME / API_SERVICE_PASSWORD manquants (voir .env.example)");
        }
        if (readTimeout == null) {
            readTimeout = Duration.ofSeconds(90); // l'API gratuite peut mettre ~50 s à se réveiller
        }
    }

    @Override
    public String toString() {
        return "ApiProperties[baseUrl=" + baseUrl + ", username=" + username + ", password=***]";
    }
}
