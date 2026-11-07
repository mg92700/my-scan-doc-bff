package com.scan.bff;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Démarre toute l'application avec une configuration de test : câblage, sécurité, santé. */
@SpringBootTest(properties = {
        "app.auth.username=owner",
        "app.auth.password-hash=$2b$10$kkze//w20clWp.X1RmThBu2mhsiOI8mdAAn1PKYxPpIqdO52vBjOu",
        "app.api.base-url=http://localhost:1",
        "app.api.username=svc",
        "app.api.password=pw"
})
@AutoConfigureMockMvc
class BffApplicationContextTest {

    @Autowired MockMvc mvc;

    @Test
    void sante_publique() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void documents_proteges() throws Exception {
        mvc.perform(get("/bff/documents")).andExpect(status().isUnauthorized());
    }
}
