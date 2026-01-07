import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// =====================================================
// REST API 부하 테스트 - 채팅 관련 API
// Target: 1000 VUs 기준 안정적 운영
// =====================================================

// 커스텀 메트릭
const apiLatency = new Trend('api_latency', true);
const apiSuccess = new Rate('api_success');
const requestCount = new Counter('request_count');
const chatRoomListLatency = new Trend('chat_room_list_latency', true);
const chatMessageLatency = new Trend('chat_message_latency', true);
const errorCount = new Counter('error_count');

export const options = {
  scenarios: {
    // 시나리오 1: 채팅방 목록 조회 (읽기 부하)
    chat_rooms_list: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },    // 워밍업
        { duration: '2m', target: 500 },    // 증가
        { duration: '3m', target: 1000 },   // 목표 도달
        { duration: '5m', target: 1000 },   // 유지
        { duration: '2m', target: 0 },      // 감소
      ],
      exec: 'getChatRooms',
    },
    // 시나리오 2: 채팅 메시지 조회 (읽기 부하)
    chat_messages: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '3m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '2m', target: 0 },
      ],
      exec: 'getChatMessages',
      startTime: '30s',
    },
  },

  // =====================================================
  // 성능 기준 (Thresholds)
  // =====================================================
  thresholds: {
    'api_latency': [
      'p(50)<200',      // 중간값 200ms 이하
      'p(95)<500',      // 95% 500ms 이하
      'p(99)<1000',     // 99% 1초 이하
    ],
    'api_success': ['rate>0.99'],           // API 성공률 99% 이상
    'chat_room_list_latency': ['p(95)<300'],
    'chat_message_latency': ['p(95)<500'],
    'http_req_duration': ['p(95)<1000'],
    'http_req_failed': ['rate<0.01'],       // 실패율 1% 미만
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// 테스트용 JWT 토큰 헤더
function getAuthHeaders(userId) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer test-token-${userId}`,
  };
}

// 채팅방 목록 조회
export function getChatRooms() {
  const userId = (__VU % 1000) + 1;
  const headers = getAuthHeaders(userId);

  const startTime = Date.now();
  const res = http.get(`${BASE_URL}/api/chats`, { headers, tags: { name: 'GetChatRooms' } });
  const endTime = Date.now();
  const latency = endTime - startTime;

  apiLatency.add(latency);
  chatRoomListLatency.add(latency);
  requestCount.add(1);

  const success = check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (success) {
    apiSuccess.add(1);
  } else {
    apiSuccess.add(0);
    errorCount.add(1);
  }

  sleep(Math.random() * 2 + 1);
}

// 채팅 메시지 조회
export function getChatMessages() {
  const userId = (__VU % 1000) + 1;
  const roomId = (__VU % 100) + 1;
  const headers = getAuthHeaders(userId);

  const startTime = Date.now();
  const res = http.get(`${BASE_URL}/api/chats/${roomId}/message`, { headers, tags: { name: 'GetChatMessages' } });
  const endTime = Date.now();
  const latency = endTime - startTime;

  apiLatency.add(latency);
  chatMessageLatency.add(latency);
  requestCount.add(1);

  const success = check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  if (success) {
    apiSuccess.add(1);
  } else {
    apiSuccess.add(0);
    errorCount.add(1);
  }

  sleep(Math.random() * 2 + 1);
}

// 기본 실행 함수
export default function () {
  getChatRooms();
  sleep(1);
  getChatMessages();
}

export function handleSummary(data) {
  const metrics = data.metrics;
  const testDuration = data.state.testRunDurationMs / 1000;

  const summary = {
    test_info: {
      name: 'REST API Load Test',
      target_vus: 1000,
      duration_seconds: testDuration.toFixed(2),
      timestamp: new Date().toISOString(),
    },
    request_metrics: {
      total_requests: metrics.request_count?.values.count || 0,
      requests_per_second: ((metrics.request_count?.values.count || 0) / testDuration).toFixed(2),
      success_rate: `${((metrics.api_success?.values.rate || 0) * 100).toFixed(2)}%`,
      error_count: metrics.error_count?.values.count || 0,
    },
    latency_metrics: {
      avg: `${(metrics.api_latency?.values.avg || 0).toFixed(2)}ms`,
      min: `${(metrics.api_latency?.values.min || 0).toFixed(2)}ms`,
      max: `${(metrics.api_latency?.values.max || 0).toFixed(2)}ms`,
      p50: `${(metrics.api_latency?.values['p(50)'] || 0).toFixed(2)}ms`,
      p90: `${(metrics.api_latency?.values['p(90)'] || 0).toFixed(2)}ms`,
      p95: `${(metrics.api_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99: `${(metrics.api_latency?.values['p(99)'] || 0).toFixed(2)}ms`,
    },
    endpoint_latency: {
      chat_room_list_p95: `${(metrics.chat_room_list_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
      chat_message_p95: `${(metrics.chat_message_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
    },
    http_metrics: {
      http_req_duration_p95: `${(metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms`,
      http_req_failed_rate: `${((metrics.http_req_failed?.values.rate || 0) * 100).toFixed(4)}%`,
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('  REST API LOAD TEST RESULTS');
  console.log('='.repeat(60));
  console.log('\n[Request Summary]');
  console.log(`  Total Requests: ${summary.request_metrics.total_requests}`);
  console.log(`  Requests/sec (TPS): ${summary.request_metrics.requests_per_second}`);
  console.log(`  Success Rate: ${summary.request_metrics.success_rate}`);
  console.log(`  Errors: ${summary.request_metrics.error_count}`);
  console.log('\n[Latency Distribution]');
  console.log(`  Avg: ${summary.latency_metrics.avg}`);
  console.log(`  P50: ${summary.latency_metrics.p50}`);
  console.log(`  P90: ${summary.latency_metrics.p90}`);
  console.log(`  P95: ${summary.latency_metrics.p95}`);
  console.log(`  P99: ${summary.latency_metrics.p99}`);
  console.log(`  Max: ${summary.latency_metrics.max}`);
  console.log('\n[Endpoint Latency (P95)]');
  console.log(`  Chat Room List: ${summary.endpoint_latency.chat_room_list_p95}`);
  console.log(`  Chat Messages: ${summary.endpoint_latency.chat_message_p95}`);
  console.log('\n' + '='.repeat(60) + '\n');

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'k6/results/api-summary.json': JSON.stringify(summary, null, 2),
    'k6/results/api-full-report.json': JSON.stringify(data, null, 2),
  };
}
