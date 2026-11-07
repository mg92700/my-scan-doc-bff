package com.scan.bff.security;

import com.scan.bff.api.ApiGateway;
import com.scan.bff.api.BffExceptionHandler;
import com.scan.bff.api.DocumentsController;
import com.scan.bff.config.SecurityConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Parcours de sécurité : session, CSRF, anti force brute, routes protégées. */
@WebMvcTest(controllers = {SessionController.class, DocumentsController.class})
@Import({SecurityConfig.class, LoginAttemptLimiter.class, BffExceptionHandler.class})
@TestPropertySource(properties = {
        "app.auth.username=owner",
        // BCrypt du mot de passe "test-password"
        "app.auth.password-hash=$2b$10$kkze//w20clWp.X1RmThBu2mhsiOI8mdAAn1PKYxPpIqdO52vBjOu"
})
class SecurityFlowTest {

    private static final String GOOD = "{\"username\":\"owner\",\"password\":\"test-password\"}";
    private static final String BAD = "{\"username\":\"owner\",\"password\":\"nope\"}";

    @Autowired MockMvc mvc;
    @Autowired LoginAttemptLimiter limiter;
    @MockitoBean ApiGateway gateway;

    @BeforeEach
    void resetLimiter() {
        limiter.reset("127.0.0.1");
    }

    @Test
    void login_ouvre_une_session_utilisable() throws Exception {
        MvcResult res = mvc.perform(post("/bff/session/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(GOOD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("owner"))
                .andReturn();
        MockHttpSession session = (MockHttpSession) res.getRequest().getSession(false);

        mvc.perform(get("/bff/session/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("owner"));
    }

    @Test
    void mauvais_mot_de_passe_refuse() throws Exception {
        mvc.perform(post("/bff/session/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BAD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Identifiants invalides."));
    }

    @Test
    void champs_absents_traites_comme_un_echec() throws Exception {
        mvc.perform(post("/bff/session/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void login_sans_csrf_refuse() throws Exception {
        mvc.perform(post("/bff/session/login").contentType(MediaType.APPLICATION_JSON).content(GOOD))
                .andExpect(status().isForbidden());
    }

    @Test
    void trop_d_echecs_bloquent_meme_le_bon_mot_de_passe() throws Exception {
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
            mvc.perform(post("/bff/session/login").with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(BAD));
        }

        mvc.perform(post("/bff/session/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(GOOD))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void me_sans_session_retourne_401_et_pose_le_cookie_csrf() throws Exception {
        mvc.perform(get("/bff/session/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(cookie().exists("XSRF-TOKEN"));
    }

    @Test
    void en_tetes_de_securite_presents() throws Exception {
        mvc.perform(get("/bff/session/me"))
                .andExpect(header().string("Content-Security-Policy", org.hamcrest.Matchers.containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().exists("Permissions-Policy"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void documents_sans_session_refuses() throws Exception {
        mvc.perform(get("/bff/documents")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/bff/documents/{id}", java.util.UUID.randomUUID()).with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void documents_avec_session_autorises() throws Exception {
        when(gateway.execute(any())).thenReturn(ResponseEntity.ok("[]".getBytes()));

        mvc.perform(get("/bff/documents").with(user("owner")))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void mutation_sans_csrf_refusee_meme_connecte() throws Exception {
        mvc.perform(delete("/bff/documents/{id}", java.util.UUID.randomUUID()).with(user("owner")))
                .andExpect(status().isForbidden());
    }

    @Test
    void route_inconnue_refusee() throws Exception {
        mvc.perform(get("/nimporte/quoi")).andExpect(status().isUnauthorized());
    }

    @Test
    void logout_ferme_la_session() throws Exception {
        mvc.perform(post("/bff/session/logout").with(csrf()).with(user("owner")))
                .andExpect(status().isNoContent());
    }
}
