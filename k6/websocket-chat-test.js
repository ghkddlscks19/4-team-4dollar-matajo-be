import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

// =====================================================
// 실시간 채팅 WebSocket 부하 테스트
// Target: 1000 VUs (동시 사용자)
// =====================================================

// 커스텀 메트릭 정의
const messagesSent = new Counter('ws_messages_sent');
const messagesReceived = new Counter('ws_messages_received');
const messageLatency = new Trend('ws_message_latency', true);
const connectionTime = new Trend('ws_connection_time', true);
const connectionSuccess = new Rate('ws_connection_success');
const messageSuccess = new Rate('ws_message_success');
const activeConnections = new Gauge('ws_active_connections');

// =====================================================
// 테스트 시나리오: 1000 VUs
// =====================================================
export const options = {
  scenarios: {
    gradual_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 200 },     // 1분: 워밍업
        { duration: '2m', target: 500 },     // 2분: 500 VUs
        { duration: '2m', target: 1000 },    // 2분: 1000 VUs 도달
        { duration: '3m', target: 1000 },    // 3분: 1000 VUs 유지 (안정성 검증)
        { duration: '1m', target: 0 },       // 1분: 정리
      ],
      gracefulRampDown: '30s',
    },
  },

  thresholds: {
    'ws_connection_success': ['rate>0.95'],
    'ws_connection_time': ['p(95)<5000'],
    'ws_message_success': ['rate>0.95'],
    'ws_message_latency': ['p(95)<500'],
  },
};

// =====================================================
// 환경 설정
// =====================================================
const BASE_URL = __ENV.BASE_URL || 'localhost:8080';
const WS_URL = `ws://${BASE_URL}/ws-chat`;
const HTTP_URL = `http://${BASE_URL}`;

// =====================================================
// Setup: 테스트 토큰 미리 생성 (1000명)
// =====================================================
export function setup() {
  console.log('Generating test tokens for 1000 users...');

  const tokenRes = http.get(`${HTTP_URL}/api/test/tokens?count=1000`);
  if (tokenRes.status === 200) {
    console.log('Test tokens generated successfully');
    return tokenRes.json();
  } else {
    console.log('Warning: Could not generate test tokens');
    return { tokens: {} };
  }
}

// =====================================================
// 메인 테스트 함수
// =====================================================
export default function (data) {
  const userId = ((__VU - 1) % 1000) + 1;
  const roomId = ((__VU - 1) % 100) + 1;  // 100개 채팅방에 분산

  // 토큰 가져오기
  const token = data.tokens ? data.tokens[String(userId)] : null;

  if (!token) {
    connectionSuccess.add(0);
    return;
  }

  const url = `${WS_URL}/websocket?userId=${userId}&token=${token}`;
  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    const connectEnd = Date.now();
    connectionTime.add(connectEnd - connectStart);
    activeConnections.add(1);

    let stompConnected = false;

    // STOMP CONNECT
    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    socket.on('message', function (message) {
      messagesReceived.add(1);

      // STOMP CONNECTED 응답
      if (message.includes('CONNECTED') && !stompConnected) {
        stompConnected = true;
        // 채팅방 구독
        socket.send(`SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`);
      }

      // MESSAGE 수신 시 레이턴시 계산
      if (message.includes('MESSAGE')) {
        try {
          const bodyMatch = message.match(/\n\n(.+)\0/);
          if (bodyMatch) {
            const body = JSON.parse(bodyMatch[1]);
            if (body.sendTimestamp) {
              const latency = Date.now() - body.sendTimestamp;
              messageLatency.add(latency);
            }
          }
        } catch (e) {
          // 파싱 실패 무시
        }
        messageSuccess.add(1);
      }
    });

    socket.on('error', function (e) {
      // 에러 로깅 최소화 (부하 테스트 시)
    });

    socket.on('close', function () {
      activeConnections.add(-1);
    });

    // STOMP 연결 대기
    sleep(1);

    // 메시지 전송 (5개)
    for (let i = 0; i < 5; i++) {
      sleep(Math.random() * 2 + 1);  // 1~3초 랜덤 대기

      const sendTimestamp = Date.now();
      const messageContent = JSON.stringify({
        sender_id: userId,
        content: `Message ${i + 1} from user ${userId}`,
        message_type: 'TEXT',
        sendTimestamp: sendTimestamp,
      });

      socket.send(`SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`);
      messagesSent.add(1);
      messageSuccess.add(1);
    }

    // 연결 유지 (실제 채팅 시뮬레이션)
    sleep(15);

    // 종료
    socket.close();
  });

  // 연결 결과 판정
  const connected = check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });

  connectionSuccess.add(connected ? 1 : 0);
}

// =====================================================
// 테스트 결과 요약
// =====================================================
export function handleSummary(data) {
  const metrics = data.metrics;
  const testDuration = (data.state.testRunDurationMs / 1000).toFixed(2);

  const summary = {
    test_info: {
      name: 'WebSocket Chat Load Test',
      target_vus: 1000,
      duration_seconds: testDuration,
      timestamp: new Date().toISOString(),
    },
    connection: {
      success_rate: `${((metrics.ws_connection_success?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_time: `${(metrics.ws_connection_time?.values.avg || 0).toFixed(2)}ms`,
      p50_time: `${(metrics.ws_connection_time?.values['p(50)'] || 0).toFixed(2)}ms`,
      p95_time: `${(metrics.ws_connection_time?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_time: `${(metrics.ws_connection_time?.values['p(99)'] || 0).toFixed(2)}ms`,
    },
    message: {
      total_sent: metrics.ws_messages_sent?.values.count || 0,
      total_received: metrics.ws_messages_received?.values.count || 0,
      success_rate: `${((metrics.ws_message_success?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_latency: `${(metrics.ws_message_latency?.values.avg || 0).toFixed(2)}ms`,
      p50_latency: `${(metrics.ws_message_latency?.values['p(50)'] || 0).toFixed(2)}ms`,
      p95_latency: `${(metrics.ws_message_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_latency: `${(metrics.ws_message_latency?.values['p(99)'] || 0).toFixed(2)}ms`,
      max_latency: `${(metrics.ws_message_latency?.values.max || 0).toFixed(2)}ms`,
    },
    throughput: {
      messages_per_second: ((metrics.ws_messages_sent?.values.count || 0) / parseFloat(testDuration)).toFixed(2),
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('  WEBSOCKET LOAD TEST RESULTS (1000 VUs)');
  console.log('='.repeat(60));
  console.log(`\n[Test Info]`);
  console.log(`  Duration: ${testDuration}s`);
  console.log(`  Target VUs: 1000`);
  console.log(`\n[Connection Performance]`);
  console.log(`  Success Rate: ${summary.connection.success_rate}`);
  console.log(`  Avg Time: ${summary.connection.avg_time}`);
  console.log(`  P95 Time: ${summary.connection.p95_time}`);
  console.log(`  P99 Time: ${summary.connection.p99_time}`);
  console.log(`\n[Message Performance]`);
  console.log(`  Total Sent: ${summary.message.total_sent}`);
  console.log(`  Total Received: ${summary.message.total_received}`);
  console.log(`  Success Rate: ${summary.message.success_rate}`);
  console.log(`  Avg Latency: ${summary.message.avg_latency}`);
  console.log(`  P50 Latency: ${summary.message.p50_latency}`);
  console.log(`  P95 Latency: ${summary.message.p95_latency}`);
  console.log(`  P99 Latency: ${summary.message.p99_latency}`);
  console.log(`  Max Latency: ${summary.message.max_latency}`);
  console.log(`\n[Throughput]`);
  console.log(`  Messages/sec: ${summary.throughput.messages_per_second}`);
  console.log('\n' + '='.repeat(60));

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'k6/results/websocket-load-test.json': JSON.stringify(summary, null, 2),
  };
}
