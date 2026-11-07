package com.scan.bff.security;

import com.scan.bff.config.SecurityConfig;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Le vrai parcours CSRF d'Angular : cookie XSRF-TOKEN lisible, renvoyé dans l'en-tête X-XSRF-TOKEN.
 * Classe à part (contexte distinct, voir la propriété) : le post-processeur csrf() de spring-security-test
 * remplace le dépôt de jetons dans le contexte partagé et fausserait ce test.
 */
@WebMvcTest(controllers = SessionController.class)
@Import({SecurityConfig.class, LoginAttemptLimiter.class})
@TestPropertySource(properties = {
        "app.auth.username=owner",
        // BCrypt du mot de passe "test-password"
        "app.auth.password-hash=$2b$10$kkze//w20clWp.X1RmThBu2mhsiOI8mdAAn1PKYxPpIqdO52vBjOu",
        "test.contexte=csrf-reel"
})
class CsrfCookieTest {

    private static final String GOOD = "{\"username\":\"owner\",\"password\":\"test-password\"}";

    @Autowired MockMvc mvc;

    @Test
    void le_cookie_csrf_est_pose_des_la_premiere_reponse_et_lisible_par_javascript() throws Exception {
        mvc.perform(get("/bff/session/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    void connexion_avec_le_jeton_du_cookie_dans_l_en_tete() throws Exception {
        Cookie xsrf = mvc.perform(get("/bff/session/me")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();

        mvc.perform(post("/bff/session/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
                        .contentType(MediaType.APPLICATION_JSON).content(GOOD))
                .andExpect(status().isOk());
    }

    @Test
    void connexion_sans_l_en_tete_ou_avec_un_mauvais_jeton_refusee() throws Exception {
        Cookie xsrf = mvc.perform(get("/bff/session/me")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();

        mvc.perform(post("/bff/session/login").cookie(xsrf)
                        .contentType(MediaType.APPLICATION_JSON).content(GOOD))
                .andExpect(status().isForbidden());
        mvc.perform(post("/bff/session/login").cookie(xsrf).header("X-XSRF-TOKEN", "faux-jeton")
                        .contentType(MediaType.APPLICATION_JSON).content(GOOD))
                .andExpect(status().isForbidden());
    }
}
