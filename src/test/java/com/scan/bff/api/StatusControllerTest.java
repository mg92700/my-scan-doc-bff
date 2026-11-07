package com.scan.bff.api;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

class StatusControllerTest {

    private final ApiStatusService service = mock(ApiStatusService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new StatusController(service)).build();

    @Test
    void up_et_down() throws Exception {
        when(service.isUp()).thenReturn(true, false);

        mvc.perform(get("/bff/api-status")).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/bff/api-status")).andExpect(jsonPath("$.status").value("DOWN"));
    }
}
