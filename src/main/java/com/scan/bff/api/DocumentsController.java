package com.scan.bff.api;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

/**
 * Passe-plat contrôlé vers my-scan-doc-api : seules les routes ci-dessous existent (liste blanche),
 * les identifiants sont des UUID validés, et la réponse de l'API est relayée sans la réinterpréter.
 */
@RestController
@RequestMapping("/bff/documents")
public class DocumentsController {

    private final ApiGateway api;

    public DocumentsController(ApiGateway api) {
        this.api = api;
    }

    @GetMapping
    public ResponseEntity<byte[]> list(@RequestParam(defaultValue = "false") boolean archived) {
        return relay(api.execute((c, t) -> c.get().uri("/api/documents?archived={a}", archived)
                .headers(h -> h.setBearerAuth(t)).retrieve().toEntity(byte[].class)));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable UUID id) {
        return relay(api.execute((c, t) -> c.get().uri("/api/download/{id}", id)
                .headers(h -> h.setBearerAuth(t)).retrieve().toEntity(byte[].class)));
    }

    @PostMapping("/{id}/archive")
    public ResponseEntity<byte[]> archive(@PathVariable UUID id) {
        return post(id, "archive");
    }

    @PostMapping("/{id}/unarchive")
    public ResponseEntity<byte[]> unarchive(@PathVariable UUID id) {
        return post(id, "unarchive");
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        api.execute((c, t) -> c.delete().uri("/api/documents/{id}", id)
                .headers(h -> h.setBearerAuth(t)).retrieve().toBodilessEntity());
        return ResponseEntity.noContent().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> upload(@RequestPart("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("Fichier manquant.".getBytes());
        }
        byte[] content = file.getBytes();
        String name = file.getOriginalFilename();
        return relay(api.execute((c, t) -> {
            MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
            form.add("file", new ByteArrayResource(content) {
                @Override
                public String getFilename() {
                    return name;
                }
            });
            return c.post().uri("/api/upload").headers(h -> h.setBearerAuth(t))
                    .contentType(MediaType.MULTIPART_FORM_DATA).body(form)
                    .retrieve().toEntity(byte[].class);
        }));
    }

    private ResponseEntity<byte[]> post(UUID id, String action) {
        return relay(api.execute((c, t) -> c.post().uri("/api/documents/{id}/" + action, id)
                .headers(h -> h.setBearerAuth(t)).retrieve().toEntity(byte[].class)));
    }

    /** Ne relaie que le statut, le type, le nom de fichier et le corps : jamais les autres en-têtes de l'API. */
    private static ResponseEntity<byte[]> relay(ResponseEntity<byte[]> res) {
        HttpHeaders out = new HttpHeaders();
        for (String name : new String[] {HttpHeaders.CONTENT_TYPE, HttpHeaders.CONTENT_DISPOSITION}) {
            String value = res.getHeaders().getFirst(name);
            if (value != null) {
                out.set(name, value);
            }
        }
        out.setCacheControl("no-store"); // documents personnels : jamais en cache
        return new ResponseEntity<>(res.getBody(), out, res.getStatusCode());
    }
}
