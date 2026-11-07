package com.scan.bff.api;

import com.scan.bff.config.ApiProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ApiGatewayTest {

    private final RestClient.Builder builder = RestClient.builder().baseUrl("http://api");
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final ApiGateway gateway = new ApiGateway(builder.build(),
            new ApiProperties("http://api", "svc", "pw", null));

    private void expectLogin(String token) {
        server.expect(once(), requestTo("http://api/auth/login"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.username").value("svc"))
                .andExpect(jsonPath("$.password").value("pw"))
                .andRespond(withSuccess("{\"token\":\"" + token + "\"}", MediaType.APPLICATION_JSON));
    }

    private String ping() {
        return gateway.execute((c, t) -> c.get().uri("/api/ping").headers(h -> h.setBearerAuth(t))
                .retrieve().body(String.class));
    }

    @Test
    void se_connecte_puis_reutilise_le_jeton() {
        expectLogin("tok1");
        server.expect(once(), requestTo("http://api/api/ping"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok1")).andRespond(withSuccess("a", MediaType.TEXT_PLAIN));
        server.expect(once(), requestTo("http://api/api/ping"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok1")).andRespond(withSuccess("b", MediaType.TEXT_PLAIN));

        assertThat(ping()).isEqualTo("a");
        assertThat(ping()).isEqualTo("b");
        server.verify();
    }

    @Test
    void renouvelle_le_jeton_une_fois_sur_401() {
        expectLogin("vieux");
        server.expect(once(), requestTo("http://api/api/ping"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer vieux")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectLogin("neuf");
        server.expect(once(), requestTo("http://api/api/ping"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer neuf")).andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        assertThat(ping()).isEqualTo("ok");
        server.verify();
    }

    @Test
    void un_second_401_est_remonte() {
        expectLogin("a");
        server.expect(once(), requestTo("http://api/api/ping")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectLogin("b");
        server.expect(once(), requestTo("http://api/api/ping")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(this::ping).isInstanceOf(org.springframework.web.client.HttpClientErrorException.Unauthorized.class);
    }

    @Test
    void connexion_refusee_devient_api_unavailable() {
        server.expect(once(), requestTo("http://api/auth/login")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(this::ping)
                .isInstanceOf(ApiUnavailableException.class)
                .hasMessageNotContaining("pw");
    }

    @Test
    void reponse_de_connexion_sans_jeton_devient_api_unavailable() {
        server.expect(once(), requestTo("http://api/auth/login"))
                .andRespond(withSuccess("{\"token\":\"\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(this::ping).isInstanceOf(ApiUnavailableException.class);
    }
}
