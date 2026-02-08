package org.ktb.matajo.config;

import org.ktb.matajo.interceptor.RateLimitInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

  private final RateLimitInterceptor rateLimitInterceptor;

  @Value("${spring.profiles.active:default}")
  private String activeProfile;

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    // docker 프로파일에서는 부하 테스트를 위해 Rate Limiting 비활성화
    if ("docker".equals(activeProfile)) {
      log.info("Rate limiting disabled for docker profile");
      return;
    }

    registry
        .addInterceptor(rateLimitInterceptor)
        .addPathPatterns("/**") // 모든 경로 적용
        .excludePathPatterns(
            "/swagger-ui/**", // API 문서 제외
            "/v3/api-docs/**" // API 문서 제외
            );
  }
}
