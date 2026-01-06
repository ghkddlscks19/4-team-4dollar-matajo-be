import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// =====================================================
// REST API 부하 테스트 - 채팅 관련 API
// =====================================================

const apiLatency = new Trend('api_latency', true);
const apiSuccess = new Rate('api_success');
const requestCount = new Counter('request_count');

export const options = {
  scenarios: {
    // 채팅방 목록 조회 테스트
    chat_rooms_list: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '20s', target: 0 },
      ],
      exec: 'getChatRooms',
    },
    // 메시지 조회 테스트
    chat_messages: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 30 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '20s', target: 0 },
      ],
      exec: 'getChatMessages',
      startTime: '10s',  // 10초 후 시작
    },
  },
  thresholds: {
    'api_latency': ['p(95)<1000'],      // 95% API 응답 1초 이하
    'api_success': ['rate>0.95'],        // API 성공률 95% 이상
    'http_req_duration': ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// 테스트용 JWT 토큰 (실제 환경에서는 로그인 후 발급받은 토큰 사용)
function getAuthHeaders(userId) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer test-token-${userId}`,
  };
}

// 채팅방 목록 조회
export function getChatRooms() {
  const userId = (__VU % 100) + 1;
  const headers = getAuthHeaders(userId);

  const startTime = Date.now();
  const res = http.get(`${BASE_URL}/api/chats`, { headers });
  const endTime = Date.now();

  apiLatency.add(endTime - startTime);
  requestCount.add(1);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => r.json() !== null,
  });

  apiSuccess.add(success ? 1 : 0);

  if (!success) {
    console.log(`getChatRooms failed: ${res.status} - ${res.body}`);
  }

  sleep(Math.random() * 2 + 1);
}

// 채팅 메시지 조회
export function getChatMessages() {
  const userId = (__VU % 100) + 1;
  const roomId = (__VU % 10) + 1;
  const headers = getAuthHeaders(userId);

  const startTime = Date.now();
  const res = http.get(`${BASE_URL}/api/chats/${roomId}/message`, { headers });
  const endTime = Date.now();

  apiLatency.add(endTime - startTime);
  requestCount.add(1);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response is array or object': (r) => {
      try {
        const json = r.json();
        return json !== null;
      } catch (e) {
        return false;
      }
    },
  });

  apiSuccess.add(success ? 1 : 0);

  if (!success) {
    console.log(`getChatMessages failed: ${res.status} - ${res.body}`);
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
  const summary = {
    'Total Requests': data.metrics.request_count?.values.count || 0,
    'API Success Rate': `${((data.metrics.api_success?.values.rate || 0) * 100).toFixed(2)}%`,
    'Avg API Latency': `${(data.metrics.api_latency?.values.avg || 0).toFixed(2)}ms`,
    'P95 API Latency': `${(data.metrics.api_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
    'P99 API Latency': `${(data.metrics.api_latency?.values['p(99)'] || 0).toFixed(2)}ms`,
    'Max API Latency': `${(data.metrics.api_latency?.values.max || 0).toFixed(2)}ms`,
  };

  console.log('\n========== REST API TEST RESULTS ==========');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }
  console.log('============================================\n');

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'results/api-summary.json': JSON.stringify(data, null, 2),
  };
}
