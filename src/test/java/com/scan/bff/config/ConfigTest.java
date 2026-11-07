package com.scan.bff.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.UserDetailsService;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ConfigTest {

    @Test
    void api_properties_valident_et_masquent_le_mot_de_passe() {
        ApiProperties p = new ApiProperties("http://api", "svc", "secret-pw", null);

        assertThat(p.readTimeout()).isEqualTo(Duration.ofSeconds(90));
        assertThat(p.toString()).doesNotContain("secret-pw").contains("svc");
    }

    @Test
    void api_properties_refusent_une_config_incomplete() {
        assertThatThrownBy(() -> new ApiProperties("", "svc", "pw", null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ApiProperties("http://api", "", "pw", null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ApiProperties("http://api", "svc", null, null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ApiProperties(null, "svc", "pw", null)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void le_client_http_est_construit() {
        assertThat(new ApiClientConfig().apiRestClient(new ApiProperties("http://api", "svc", "pw", null))).isNotNull();
    }

    @Test
    void utilisateur_unique_exige_un_hash_bcrypt() {
        SecurityConfig config = new SecurityConfig();

        assertThatThrownBy(() -> config.userDetailsService("owner", "motdepasse-en-clair"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> config.userDetailsService("", "$2b$10$abc"))
                .isInstanceOf(IllegalStateException.class);

        UserDetailsService ok = config.userDetailsService("owner", "$2b$10$kkze//w20clWp.X1RmThBu2mhsiOI8mdAAn1PKYxPpIqdO52vBjOu");
        assertThat(ok.loadUserByUsername("owner").getUsername()).isEqualTo("owner");
    }
}
