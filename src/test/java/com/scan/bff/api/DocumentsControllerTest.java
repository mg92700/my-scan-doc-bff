package com.scan.bff.api;

import com.scan.bff.config.ApiProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.match.MockRestRequestMatchers;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Contrôleur + passerelle réelle, API simulée : vérifie ce qui est envoyé à l'API et ce qui revient au navigateur. */
class DocumentsControllerTest {

    private static final UUID ID = UUID.randomUUID();
    private static final String BEARER = "Bearer tok";

    private MockRestServiceServer api;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://api");
        api = MockRestServiceServer.bindTo(builder).build();
        ApiGateway gateway = new ApiGateway(builder.build(), new ApiProperties("http://api", "svc", "pw", null));
        mvc = MockMvcBuilders.standaloneSetup(new DocumentsController(gateway))
                .setControllerAdvice(new BffExceptionHandler()).build();
        api.expect(once(), requestTo("http://api/auth/login"))
                .andRespond(withSuccess("{\"token\":\"tok\"}", MediaType.APPLICATION_JSON));
    }

    @Test
    void liste_relaie_le_json_et_ne_copie_pas_les_en_tetes_internes() throws Exception {
        api.expect(requestTo("http://api/api/documents?archived=true&q=fact%20ure%26x&offset=20&limit=10"))
                .andExpect(MockRestRequestMatchers.header(HttpHeaders.AUTHORIZATION, BEARER))
                .andRespond(withSuccess("[{\"id\":\"1\"}]", MediaType.APPLICATION_JSON).header("X-Interne", "secret"));

        mvc.perform(get("/bff/documents").param("archived", "true").param("q", "fact ure&x")
                        .param("offset", "20").param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(content().json("[{\"id\":\"1\"}]"))
                .andExpect(header().doesNotExist("X-Interne"))
                .andExpect(header().string("Cache-Control", "no-store"));
        api.verify();
    }

    @Test
    void liste_par_defaut_demande_les_documents_actifs() throws Exception {
        api.expect(requestTo("http://api/api/documents?archived=false&q=&offset=0&limit=20"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        mvc.perform(get("/bff/documents")).andExpect(status().isOk());
        api.verify();
    }

    @Test
    void telechargement_conserve_type_et_nom_de_fichier() throws Exception {
        api.expect(requestTo("http://api/api/download/" + ID))
                .andRespond(withSuccess(new byte[] {1, 2, 3}, MediaType.APPLICATION_PDF)
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''a.pdf"));

        mvc.perform(get("/bff/documents/{id}/download", ID))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("a.pdf")))
                .andExpect(content().bytes(new byte[] {1, 2, 3}));
    }

    @Test
    void archive_et_restaure() throws Exception {
        api.expect(requestTo("http://api/api/documents/" + ID + "/archive")).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"archivedAt\":\"2026-01-01T00:00:00Z\"}", MediaType.APPLICATION_JSON));
        api.expect(requestTo("http://api/api/documents/" + ID + "/unarchive")).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        mvc.perform(post("/bff/documents/{id}/archive", ID)).andExpect(status().isOk())
                .andExpect(jsonPath("$.archivedAt").exists());
        mvc.perform(post("/bff/documents/{id}/unarchive", ID)).andExpect(status().isOk());
        api.verify();
    }

    @Test
    void suppression_retourne_204() throws Exception {
        api.expect(requestTo("http://api/api/documents/" + ID)).andExpect(method(HttpMethod.DELETE))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));

        mvc.perform(delete("/bff/documents/{id}", ID)).andExpect(status().isNoContent());
        api.verify();
    }

    @Test
    void upload_transmet_le_fichier_en_multipart() throws Exception {
        api.expect(requestTo("http://api/api/upload")).andExpect(method(HttpMethod.POST))
                .andExpect(MockRestRequestMatchers.header(HttpHeaders.CONTENT_TYPE, startsWith("multipart/form-data")))
                .andExpect(MockRestRequestMatchers.header(HttpHeaders.AUTHORIZATION, BEARER))
                .andExpect(MockRestRequestMatchers.content().string(containsString("filename=\"scan.pdf\"")))
                .andRespond(withSuccess("{\"id\":\"" + ID + "\"}", MediaType.APPLICATION_JSON));

        mvc.perform(multipart("/bff/documents")
                        .file(new MockMultipartFile("file", "scan.pdf", "application/pdf", "%PDF-1.4".getBytes())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ID.toString()));
        api.verify();
    }

    @Test
    void upload_vide_refuse_sans_appeler_l_api() throws Exception {
        mvc.perform(multipart("/bff/documents").file(new MockMultipartFile("file", "a.pdf", "application/pdf", new byte[0])))
                .andExpect(status().isBadRequest());
    }

    @Test
    void erreur_utilisateur_de_l_api_est_relayee_avec_son_message() throws Exception {
        api.expect(requestTo("http://api/api/download/" + ID))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("Document introuvable").contentType(MediaType.TEXT_PLAIN));

        mvc.perform(get("/bff/documents/{id}/download", ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Document introuvable"));
    }

    @Test
    void format_refuse_par_l_api_est_relaye_en_400() throws Exception {
        api.expect(requestTo("http://api/api/upload"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).body("Format non supporté").contentType(MediaType.TEXT_PLAIN));

        mvc.perform(multipart("/bff/documents").file(new MockMultipartFile("file", "a.txt", "text/plain", "x".getBytes())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Format non supporté"));
    }

    @Test
    void erreur_interne_de_l_api_devient_502_generique() throws Exception {
        api.expect(requestTo("http://api/api/documents?archived=false&q=&offset=0&limit=20"))
                .andRespond(withServerError().body("stacktrace secrète"));

        mvc.perform(get("/bff/documents"))
                .andExpect(status().isBadGateway())
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("secrète"))));
    }

    @Test
    void api_injoignable_devient_504() throws Exception {
        api.expect(requestTo("http://api/api/documents?archived=false&q=&offset=0&limit=20"))
                .andRespond(request -> { throw new IOException("timeout"); });

        mvc.perform(get("/bff/documents")).andExpect(status().isGatewayTimeout());
    }

    @Test
    void compte_de_service_refuse_devient_502() throws Exception {
        MockRestServiceServer fresh = api;
        fresh.reset();
        fresh.expect(requestTo("http://api/auth/login")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        mvc.perform(get("/bff/documents")).andExpect(status().isBadGateway());
    }

    @Test
    void identifiant_non_uuid_refuse_sans_appeler_l_api() throws Exception {
        mvc.perform(delete("/bff/documents/{id}", "pas-un-uuid")).andExpect(status().isBadRequest());
    }
}
