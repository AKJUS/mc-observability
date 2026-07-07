package com.mcmp.o11ymanager.manager.infrastructure.tumblebug;

import feign.Request;
import feign.RequestInterceptor;
import feign.RetryableException;
import feign.Retryer;
import feign.codec.ErrorDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TumblebugFeignConfig {
    @Value("${feign.cb-tumblebug.id}")
    private String id;

    @Value("${feign.cb-tumblebug.pw}")
    private String pw;

    @Bean
    public RequestInterceptor tumblebugBasicAuthRequestInterceptor() {
        return requestTemplate -> {
            String auth = id + ":" + pw;
            byte[] encodedAuth = Base64.getEncoder().encode(auth.getBytes(StandardCharsets.UTF_8));
            String authHeader = "Basic " + new String(encodedAuth);

            requestTemplate.header("Authorization", authHeader);
        };
    }

    /**
     * cb-tumblebug applies a low per-path rate limiter (e.g. 2 req/s on the infra and k8sCluster
     * read endpoints) and returns 429 with no {@code Retry-After} header, so Feign's default
     * decoder surfaces it as a hard {@link feign.FeignException} that is never retried. Dashboards
     * and schedulers naturally fan out several reads at once and trip it constantly, making live
     * resources momentarily look failed/missing. Re-map 429 to a {@link RetryableException} so the
     * {@link #tumblebugRetryer() retryer} backs off and retries instead of failing outright.
     */
    @Bean
    public ErrorDecoder tumblebugErrorDecoder() {
        ErrorDecoder defaultDecoder = new ErrorDecoder.Default();
        return (methodKey, response) -> {
            Exception decoded = defaultDecoder.decode(methodKey, response);
            if (response.status() == 429 && !(decoded instanceof RetryableException)) {
                Request request = response.request();
                return new RetryableException(
                        response.status(),
                        decoded.getMessage(),
                        request != null ? request.httpMethod() : Request.HttpMethod.GET,
                        decoded,
                        (Long) null, // no Retry-After header — let the retryer compute the backoff
                        request);
            }
            return decoded;
        };
    }

    /** Backoff retry for the 429s re-mapped above: ~0.8s, 1.2s, 1.8s across 3 retries. */
    @Bean
    public Retryer tumblebugRetryer() {
        return new Retryer.Default(800L, 2500L, 4);
    }
}
