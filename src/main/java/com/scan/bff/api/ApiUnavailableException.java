package com.scan.bff.api;

/** my-scan-doc-api est injoignable ou refuse le compte de service : erreur côté serveur, pas du navigateur. */
public class ApiUnavailableException extends RuntimeException {
    public ApiUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
