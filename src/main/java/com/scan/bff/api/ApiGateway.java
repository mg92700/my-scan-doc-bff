package com.scan.bff.api;

import com.scan.bff.config.ApiProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiFunction;

/**
 * Porte d'entrée unique vers my-scan-doc-api. Se connecte avec le compte de service,
 * garde le jeton en mémoire et le renouvelle une fois si l'API répond 401 (jeton expiré).
 * Le jeton ne quitte jamais le serveur.
 */
@Component
public class ApiGateway {

    record TokenResponse(String token) {}

    private final RestClient client;
    private final ApiProperties props;
    private final AtomicReference<String> token = new AtomicReference<>();

    public ApiGateway(RestClient apiRestClient, ApiProperties props) {
        this.client = apiRestClient;
        this.props = props;
    }

    /** Exécute l'appel avec le jeton courant ; en cas de 401, se reconnecte et rejoue l'appel une seule fois. */
    public <T> T execute(BiFunction<RestClient, String, T> call) {
        try {
            return call.apply(client, currentToken());
        } catch (HttpClientErrorException.Unauthorized expired) {
            token.set(null);
            return call.apply(client, currentToken());
        }
    }

    private String currentToken() {
        String t = token.get();
        if (t == null) {
            t = login();
            token.set(t);
        }
        return t;
    }

    private String login() {
        try {
            TokenResponse res = client.post().uri("/auth/login")
                    .body(Map.of("username", props.username(), "password", props.password()))
                    .retrieve().body(TokenResponse.class);
            if (res == null || res.token() == null || res.token().isBlank()) {
                throw new ApiUnavailableException("Connexion au service documents refusée (réponse vide)", null);
            }
            return res.token();
        } catch (RestClientException e) {
            // Message volontairement sans détail : le compte de service est un secret
            throw new ApiUnavailableException("Connexion au service documents impossible", e);
        }
    }
}
