# 실시간 채팅 시스템 부하 테스트 보고서

> **프로젝트**: Matajo - 1:1 실시간 채팅 서비스
> **목표**: 동시 사용자 1,000명 안정적 운영
> **테스트 도구**: k6, Docker, Prometheus, Grafana

---

## 1. 테스트 개요

### 1.1 테스트 목적
- 실시간 채팅 시스템의 **동시 접속자 1,000명** 처리 능력 검증
- WebSocket 연결 안정성 및 메시지 전송 지연시간(Latency) 측정
- 성능 병목 지점 식별 및 최적화 효과 검증
- 이력서/포트폴리오에 명시할 **정량적 성능 지표** 도출

### 1.2 테스트 환경

| 구분 | 사양 |
|------|------|
| **Application** | Spring Boot 3.4.3, Java 17, WebSocket + STOMP |
| **Database** | MySQL 8.0 (HikariCP 20 connections) |
| **Cache** | Redis 7 (Lettuce, max-active: 16) |
| **Container** | Docker Compose (512MB~1GB Heap) |
| **Load Test Tool** | k6 (Grafana Labs) |
| **Monitoring** | Prometheus + Grafana |

---

## 2. 성능 기준 (Performance Criteria)

### 2.1 실시간 채팅 시스템의 성능 기준 정의

실시간 채팅 서비스는 **사용자 체감 품질(QoE)**이 핵심입니다. 아래는 업계 표준과 사용자 경험 연구를 기반으로 설정한 성능 기준입니다.

#### P95 (95th Percentile) 레이턴시란?

```
P95 = 전체 요청 중 95%가 이 시간 이내에 완료됨
```

**왜 P95를 사용하는가?**
- **평균(Avg)**: 극단값에 민감하여 실제 사용자 경험을 반영하지 못함
- **P50 (중간값)**: 절반의 사용자 경험만 반영
- **P95**: 대부분의 사용자(95%) 경험을 보장하면서 합리적인 목표 설정
- **P99**: 더 엄격하지만, 달성하기 어려워 초기 목표로는 부적합

### 2.2 WebSocket 실시간 채팅 성능 기준

| 메트릭 | 목표 값 | 근거 |
|--------|---------|------|
| **연결 성공률** | ≥ 99% | 1%라도 연결 실패 시 사용자 이탈 발생 |
| **연결 시간 P95** | ≤ 3초 | 3초 이상 대기 시 33% 사용자 이탈 (Google 연구) |
| **메시지 레이턴시 P50** | ≤ 100ms | 실시간 대화 느낌 유지 |
| **메시지 레이턴시 P95** | ≤ 300ms | 인간이 지연을 인지하는 임계점 |
| **메시지 레이턴시 P99** | ≤ 500ms | 극단적 상황에서도 0.5초 이내 |
| **메시지 전달률** | ≥ 98% | 메시지 유실 최소화 |

#### 레이턴시 기준의 과학적 근거

```
0~100ms   : 즉각적 반응 (사용자가 지연 인지 못함)
100~300ms : 약간의 지연 인지 가능하나 수용 가능
300~500ms : 명확한 지연 인지, 불편함 시작
500ms+    : "느리다"는 인식, 사용자 경험 저하
1000ms+   : 시스템 장애로 인식 가능
```

### 2.3 REST API 성능 기준

| 메트릭 | 목표 값 | 용도 |
|--------|---------|------|
| **TPS (Transactions Per Second)** | ≥ 500 | 초당 처리 요청 수 |
| **API 성공률** | ≥ 99% | 오류율 1% 미만 |
| **응답 시간 P95** | ≤ 500ms | 95% 요청이 0.5초 이내 완료 |
| **응답 시간 P99** | ≤ 1000ms | 99% 요청이 1초 이내 완료 |

#### TPS (Throughput) 계산 방법

```
TPS = 총 요청 수 / 테스트 시간(초)

예시: 10분간 300,000건 처리 → 300,000 / 600 = 500 TPS
```

**TPS 목표 설정 근거**:
- 동시 사용자 1,000명
- 평균 요청 간격: 2초 (채팅방 목록 조회, 메시지 로드 등)
- 예상 TPS: 1,000 / 2 = 500 TPS
- 버퍼 고려 시 목표: 500~1,000 TPS

---

## 3. 테스트 시나리오

### 3.1 WebSocket 부하 테스트

```javascript
// 점진적 부하 증가 패턴 (Ramp-up)
stages: [
  { duration: '1m', target: 100 },    // 워밍업
  { duration: '2m', target: 300 },    // 증가
  { duration: '2m', target: 500 },    // 증가
  { duration: '3m', target: 1000 },   // 목표 도달
  { duration: '5m', target: 1000 },   // 안정성 검증 (중요!)
  { duration: '2m', target: 500 },    // 감소
  { duration: '1m', target: 0 },      // 정리
]
// 총 테스트 시간: 약 16분
```

**시나리오 설명**:
1. **워밍업 (1분)**: JIT 컴파일, 커넥션 풀 준비
2. **부하 증가 (7분)**: 단계적으로 1,000 VUs까지 증가
3. **안정성 유지 (5분)**: 피크 부하에서 시스템 안정성 검증
4. **정리 (3분)**: Graceful shutdown 검증

**각 VU(가상 사용자)의 행동**:
- WebSocket 연결 → STOMP CONNECT
- 채팅방 구독 (100개 방에 분산)
- 메시지 10개 전송 (2~5초 간격)
- 읽음 상태 업데이트 3회
- 30초 연결 유지 후 종료

### 3.2 REST API 부하 테스트

**테스트 엔드포인트**:
| API | 설명 | 예상 부하 |
|-----|------|----------|
| `GET /api/chats` | 채팅방 목록 조회 | 높음 (메인 화면) |
| `GET /api/chats/{roomId}/message` | 메시지 조회 | 중간 (채팅방 입장 시) |

---

## 4. 성능 측정 메트릭

### 4.1 주요 수집 메트릭

```
┌─────────────────────────────────────────────────────────────┐
│                    Performance Metrics                       │
├─────────────────────────────────────────────────────────────┤
│  Connection Metrics                                          │
│  ├── ws_connection_success (Rate)     : 연결 성공률          │
│  ├── ws_connection_time (Trend)       : 연결 소요 시간       │
│  └── ws_active_connections (Gauge)    : 활성 연결 수         │
├─────────────────────────────────────────────────────────────┤
│  Message Metrics                                             │
│  ├── ws_messages_sent (Counter)       : 전송 메시지 수       │
│  ├── ws_messages_received (Counter)   : 수신 메시지 수       │
│  ├── ws_message_latency (Trend)       : 메시지 레이턴시      │
│  ├── ws_message_success (Rate)        : 메시지 성공률        │
│  └── ws_message_delivery_rate (Rate)  : 메시지 전달률        │
├─────────────────────────────────────────────────────────────┤
│  API Metrics                                                 │
│  ├── api_latency (Trend)              : API 응답 시간        │
│  ├── api_success (Rate)               : API 성공률           │
│  ├── request_count (Counter)          : 총 요청 수           │
│  └── error_count (Counter)            : 오류 수              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Percentile 분포 해석

```
      ┌─────────────────────────────────────────────┐
      │         Latency Distribution                │
      │                                             │
      │  ████████████████████████████████ P50       │
      │  ██████████████████████████████████████ P90 │
      │  ████████████████████████████████████████ P95 ← 목표 기준
      │  ██████████████████████████████████████████ P99
      │                                             │
      │  0ms    100ms   200ms   300ms   400ms  500ms│
      └─────────────────────────────────────────────┘
```

---

## 5. 테스트 실행 방법

### 5.1 환경 준비

```bash
# 1. Docker 환경 시작
./run-test.sh start

# 또는 수동 실행
./gradlew bootJar -x test
docker-compose up -d --build

# 2. 서비스 상태 확인
curl http://localhost:8080/actuator/health
```

### 5.2 테스트 실행

```bash
# 스모크 테스트 (기본 기능 확인)
k6 run k6/smoke-test.js

# WebSocket 부하 테스트
k6 run k6/websocket-chat-test.js

# REST API 부하 테스트
k6 run k6/rest-api-test.js

# 결과를 JSON으로 저장
k6 run --out json=k6/results/result.json k6/websocket-chat-test.js
```

### 5.3 모니터링

| 서비스 | URL | 용도 |
|--------|-----|------|
| **Grafana** | http://localhost:3001 | 실시간 대시보드 |
| **Prometheus** | http://localhost:9090 | 메트릭 쿼리 |
| **App Health** | http://localhost:8080/actuator/health | 헬스체크 |
| **Metrics** | http://localhost:8080/actuator/prometheus | 앱 메트릭 |

---

## 6. 결과 해석 가이드

### 6.1 성공 기준 판정

```
✅ PASS 조건:
  - 연결 성공률 ≥ 99%
  - 메시지 레이턴시 P95 ≤ 300ms
  - 메시지 전달률 ≥ 98%
  - API 성공률 ≥ 99%
  - TPS ≥ 500

❌ FAIL 조건:
  - 위 조건 중 하나라도 미달
  - 테스트 중 서버 크래시
  - 메모리 OOM 발생
```

### 6.2 결과 예시 및 해석

```
============================================================
  WEBSOCKET CHAT LOAD TEST RESULTS
============================================================

[Connection Performance]
  Success Rate: 99.85%           ✅ 목표 99% 달성
  Avg Time: 245.32ms
  P95 Time: 1523.45ms            ✅ 목표 3000ms 이하
  P99 Time: 2891.23ms            ✅ 목표 5000ms 이하

[Message Performance]
  Total Sent: 45,230
  Total Received: 89,456
  Success Rate: 99.92%           ✅ 목표 99% 달성
  Delivery Rate: 98.45%          ✅ 목표 98% 달성
  Avg Latency: 67.23ms
  P95 Latency: 245.67ms          ✅ 목표 300ms 이하 (핵심!)
  P99 Latency: 389.12ms          ✅ 목표 500ms 이하

[Throughput]
  Messages/sec: 47.53

============================================================
```

### 6.3 이력서/포트폴리오 작성 예시

**Before (최적화 전)**:
```
- WebSocket 동시 접속: 200명
- 메시지 레이턴시 P95: 850ms
- API 응답시간 P95: 1,200ms
- 메시지 전달률: 94%
```

**After (최적화 후)**:
```
- WebSocket 동시 접속: 1,000명 (5배 향상)
- 메시지 레이턴시 P95: 245ms (71% 개선)
- API 응답시간 P95: 320ms (73% 개선)
- 메시지 전달률: 98.5% (4.5%p 향상)
```

**이력서 기술 예시**:
> "실시간 채팅 시스템 성능 최적화를 통해 동시 접속자 1,000명 환경에서 메시지 P95 레이턴시 300ms 이하, 메시지 전달률 98% 이상 달성. Redis 캐싱, WebSocket 세션 관리 최적화, DB 쿼리 튜닝을 적용하여 기존 대비 71% 성능 개선."

---

## 7. 트러블슈팅

### 7.1 일반적인 문제

| 증상 | 원인 | 해결 방법 |
|------|------|----------|
| 연결 성공률 < 90% | 서버 리소스 부족 | Heap 메모리 증가, 커넥션 풀 조정 |
| P95 레이턴시 > 1초 | DB 쿼리 병목 | N+1 문제 해결, 인덱스 추가 |
| 메시지 유실 | WebSocket 버퍼 오버플로우 | 메시지 큐 도입, 배치 처리 |
| OOM 에러 | 메모리 누수 | 세션 정리 로직 확인, GC 튜닝 |

### 7.2 k6 테스트 관련

```bash
# 로그 레벨 조정
k6 run --log-output=stdout --log-format=json script.js

# VUs 수 오버라이드
k6 run --vus=100 --duration=5m script.js

# 특정 시나리오만 실행
k6 run --scenario=gradual_load script.js
```

---

## 8. 다음 단계

### 8.1 성능 최적화 체크리스트

- [ ] Redis 캐싱 적용 (채팅방 목록, 사용자 정보)
- [ ] 메시지 읽음 상태 배치 처리
- [ ] WebSocket Redis Pub/Sub 클러스터링
- [ ] DB 쿼리 최적화 (N+1 문제, 인덱스)
- [ ] FCM 알림 비동기 처리

### 8.2 확장 테스트

- [ ] 장시간 부하 테스트 (Soak Test) - 1시간 이상
- [ ] 스트레스 테스트 - 한계점 파악
- [ ] 장애 복구 테스트 - Redis/DB 장애 시나리오

---

## 참고 자료

- [k6 Documentation](https://k6.io/docs/)
- [WebSocket Performance Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [Google Web Vitals](https://web.dev/vitals/)
- [Spring WebSocket Reference](https://docs.spring.io/spring-framework/reference/web/websocket.html)
