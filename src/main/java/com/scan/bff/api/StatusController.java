package com.scan.bff.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** État de my-scan-doc-api, public : ne renvoie que « UP » ou « DOWN ». */
@RestController
@RequestMapping("/bff")
public class StatusController {

    private final ApiStatusService status;

    public StatusController(ApiStatusService status) {
        this.status = status;
    }

    @GetMapping("/api-status")
    public Map<String, String> apiStatus() {
        return Map.of("status", status.isUp() ? "UP" : "DOWN");
    }
}
