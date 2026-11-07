package com.scan.bff.config;

import com.scan.bff.security.CsrfCookieFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;

/**
 * Sécurité du navigateur : session par cookie HttpOnly + protection CSRF.
 * L'utilisateur unique vient de .env (nom + hash BCrypt), jamais du code.
 */
@Configuration
public class SecurityConfig {

    static final String CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            + "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService(@Value("${app.auth.username:}") String username,
                                                 @Value("${app.auth.password-hash:}") String hash) {
        if (username.isBlank() || !hash.startsWith("$2")) {
            throw new IllegalStateException(
                    "BFF_USERNAME / BFF_PASSWORD_HASH manquants ou invalides : le hash doit être du BCrypt (voir .env.example)");
        }
        return new InMemoryUserDetailsManager(User.withUsername(username).password(hash).roles("OWNER").build());
    }

    @Bean
    public AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, SecurityContextRepository contextRepository) throws Exception {
        http
            .securityContext(sc -> sc.securityContextRepository(contextRepository))
            // Jeton CSRF dans un cookie lisible par le front (Angular le renvoie dans X-XSRF-TOKEN)
            .csrf(csrf -> csrf
                    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
            .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
            .httpBasic(b -> b.disable())
            .formLogin(f -> f.disable())
            .logout(l -> l
                    .logoutUrl("/bff/session/logout")
                    .deleteCookies("JSESSIONID")
                    .logoutSuccessHandler((req, res, auth) -> res.setStatus(HttpStatus.NO_CONTENT.value())))
            .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .headers(h -> h
                    .contentSecurityPolicy(c -> c.policyDirectives(CSP))
                    .referrerPolicy(r -> r.policy(ReferrerPolicy.NO_REFERRER))
                    .httpStrictTransportSecurity(s -> s.includeSubDomains(true).maxAgeInSeconds(31536000))
                    .permissionsPolicyHeader(p -> p.policy("camera=(), microphone=(), geolocation=()")))
            .authorizeHttpRequests(a -> a
                    // Fichiers du front Angular
                    .requestMatchers("/", "/index.html", "/*.js", "/*.css", "/*.ico", "/*.svg", "/*.png",
                            "/*.woff2", "/media/**", "/assets/**").permitAll()
                    .requestMatchers("/bff/session/login", "/bff/session/me", "/bff/api-status", "/actuator/health", "/error").permitAll()
                    .requestMatchers("/bff/**").authenticated()
                    .anyRequest().denyAll());
        return http.build();
    }
}
