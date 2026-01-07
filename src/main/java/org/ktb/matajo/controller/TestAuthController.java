package org.ktb.matajo.controller;

import lombok.RequiredArgsConstructor;
import org.ktb.matajo.security.JwtUtil;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 부하 테스트용 인증 컨트롤러
 * Docker 프로파일에서만 활성화됩니다.
 */
@RestController
@RequestMapping("/api/test")
@Profile("docker")
@RequiredArgsConstructor
public class TestAuthController {

    private final JwtUtil jwtUtil;

    /**
     * 테스트용 JWT 토큰 생성
     * @param userId 사용자 ID
     * @return 액세스 토큰
     */
    @GetMapping("/token/{userId}")
    public ResponseEntity<Map<String, String>> generateTestToken(@PathVariable Long userId) {
        String accessToken = jwtUtil.createAccessToken(userId, "USER", "TestUser" + userId, null);

        Map<String, String> response = new HashMap<>();
        response.put("accessToken", accessToken);
        response.put("userId", userId.toString());

        return ResponseEntity.ok(response);
    }

    /**
     * 여러 사용자의 토큰을 한 번에 생성
     * @param count 생성할 토큰 수
     * @return 토큰 목록
     */
    @GetMapping("/tokens")
    public ResponseEntity<Map<String, Object>> generateMultipleTokens(
            @RequestParam(defaultValue = "100") int count) {

        Map<String, String> tokens = new HashMap<>();
        for (int i = 1; i <= count; i++) {
            String token = jwtUtil.createAccessToken((long) i, "USER", "TestUser" + i, null);
            tokens.put(String.valueOf(i), token);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("count", count);
        response.put("tokens", tokens);

        return ResponseEntity.ok(response);
    }
}
