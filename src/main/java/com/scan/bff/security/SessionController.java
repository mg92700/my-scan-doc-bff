package com.scan.bff.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Ouverture et lecture de la session du navigateur ({@code /bff/session/*}). La fermeture est gérée par Spring Security. */
@RestController
@RequestMapping("/bff/session")
public class SessionController {

    public record LoginRequest(String username, String password) {}

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contextRepository;
    private final LoginAttemptLimiter limiter;
    private final SecurityContextHolderStrategy holder = SecurityContextHolder.getContextHolderStrategy();

    public SessionController(AuthenticationManager authenticationManager,
                             SecurityContextRepository contextRepository,
                             LoginAttemptLimiter limiter) {
        this.authenticationManager = authenticationManager;
        this.contextRepository = contextRepository;
        this.limiter = limiter;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest body,
                                   HttpServletRequest request, HttpServletResponse response) {
        String client = request.getRemoteAddr();
        if (limiter.isBlocked(client)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Trop de tentatives, réessayez dans quelques minutes."));
        }
        Authentication auth;
        try {
            auth = authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(
                    body.username() == null ? "" : body.username(),
                    body.password() == null ? "" : body.password()));
        } catch (AuthenticationException e) {
            limiter.recordFailure(client);
            // Message identique que l'identifiant ou le mot de passe soit faux
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Identifiants invalides."));
        }
        limiter.reset(client);

        request.getSession(true);
        request.changeSessionId(); // nouvel identifiant de session à chaque connexion (anti fixation)
        SecurityContext context = holder.createEmptyContext();
        context.setAuthentication(auth);
        holder.setContext(context);
        contextRepository.saveContext(context, request, response);
        return ResponseEntity.ok(Map.of("username", auth.getName()));
    }

    /** 200 si la session est valide, 401 sinon : le front s'en sert au chargement de la page. */
    @GetMapping("/me")
    public ResponseEntity<?> me() {
        Authentication auth = holder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(Map.of("username", auth.getName()));
    }
}
