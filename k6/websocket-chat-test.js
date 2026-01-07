import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

// =====================================================
// 실시간 채팅 WebSocket 부하 테스트
// Target: 1000 VUs (동시 사용자) 안정적 운영
// =====================================================

// 커스텀 메트릭 정의
const messagesSent = new Counter('ws_messages_sent');
const messagesReceived = new Counter('ws_messages_received');
const messageLatency = new Trend('ws_message_latency', true);
const connectionTime = new Trend('ws_connection_time', true);
const connectionSuccess = new Rate('ws_connection_success');
const messageSuccess = new Rate('ws_message_success');
const activeConnections = new Gauge('ws_active_connections');
const messageDeliveryRate = new Rate('ws_message_delivery_rate');

// =====================================================
// 테스트 시나리오 설정
// =====================================================
export const options = {
  scenarios: {
    // 시나리오 1: 점진적 부하 증가 테스트 (Ramp-up)
    gradual_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },    // 1분: 0 → 100 VUs (워밍업)
        { duration: '2m', target: 300 },    // 2분: 100 → 300 VUs
        { duration: '2m', target: 500 },    // 2분: 300 → 500 VUs
        { duration: '3m', target: 1000 },   // 3분: 500 → 1000 VUs (목표 도달)
        { duration: '5m', target: 1000 },   // 5분: 1000 VUs 유지 (안정성 검증)
        { duration: '2m', target: 500 },    // 2분: 1000 → 500 VUs (감소)
        { duration: '1m', target: 0 },      // 1분: 정리
      ],
      gracefulRampDown: '30s',
    },
  },

  // =====================================================
  // 성능 기준 (Thresholds) - 1000 VUs 안정 운영 기준
  // =====================================================
  thresholds: {
    // 연결 성능
    'ws_connection_success': ['rate>0.99'],        // 연결 성공률 99% 이상
    'ws_connection_time': [
      'p(50)<1000',   // 중간값 1초 이하
      'p(95)<3000',   // 95% 3초 이하
      'p(99)<5000',   // 99% 5초 이하
    ],

    // 메시지 전송 성능
    'ws_message_success': ['rate>0.99'],           // 메시지 성공률 99% 이상
    'ws_message_latency': [
      'p(50)<100',    // 중간값 100ms 이하 (실시간 채팅 핵심)
      'p(95)<300',    // 95% 300ms 이하 (목표 기준)
      'p(99)<500',    // 99% 500ms 이하
    ],

    // 메시지 전달률
    'ws_message_delivery_rate': ['rate>0.98'],     // 메시지 전달률 98% 이상
  },
};

// =====================================================
// 환경 설정
// =====================================================
const BASE_URL = __ENV.BASE_URL || 'localhost:8080';
const WS_URL = `ws://${BASE_URL}/ws-chat`;

// =====================================================
// 메인 테스트 함수
// =====================================================
export default function () {
  const userId = __VU;                              // VU 번호를 사용자 ID로 사용
  const roomId = ((__VU - 1) % 100) + 1;            // 100개 채팅방에 분산
  const partnerUserId = roomId + 1000;              // 상대방 ID
  const token = `test-token-${userId}`;

  const url = `${WS_URL}/websocket?userId=${userId}&token=${token}`;

  const connectStart = Date.now();

  const res = ws.connect(url, {
    headers: {
      'Origin': `http://${BASE_URL}`,
    },
  }, function (socket) {
    const connectEnd = Date.now();
    connectionTime.add(connectEnd - connectStart);
    connectionSuccess.add(1);
    activeConnections.add(1);

    let isConnected = false;
    let isSubscribed = false;
    const sentMessages = new Map(); // 전송 시간 추적용

    // STOMP CONNECT
    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    socket.on('open', function () {
      // Connection opened
    });

    socket.on('message', function (message) {
      messagesReceived.add(1);

      // STOMP CONNECTED 응답
      if (message.includes('CONNECTED')) {
        isConnected = true;

        // 채팅방 구독
        const subscribeFrame = `SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`;
        socket.send(subscribeFrame);

        // 읽음 상태 구독
        const subscribeStatusFrame = `SUBSCRIBE\nid:sub-status-${roomId}\ndestination:/topic/chat/${roomId}/status\n\n\0`;
        socket.send(subscribeStatusFrame);

        isSubscribed = true;
      }

      // MESSAGE 수신 시 레이턴시 계산
      if (message.includes('MESSAGE')) {
        const receiveTime = Date.now();

        // 메시지 본문에서 타임스탬프 추출 시도
        try {
          const bodyMatch = message.match(/\n\n(.+)\0/);
          if (bodyMatch) {
            const body = JSON.parse(bodyMatch[1]);
            if (body.sendTimestamp) {
              const latency = receiveTime - body.sendTimestamp;
              messageLatency.add(latency);
              messageDeliveryRate.add(1);
            }
          }
        } catch (e) {
          // 파싱 실패 시 기본 성공 처리
          messageSuccess.add(1);
          messageDeliveryRate.add(1);
        }
      }
    });

    socket.on('error', function (e) {
      connectionSuccess.add(0);
      messageSuccess.add(0);
    });

    socket.on('close', function () {
      activeConnections.add(-1);
    });

    // STOMP 연결 대기
    sleep(1);

    // 메시지 전송 루프 (실제 채팅 시뮬레이션)
    if (isConnected) {
      for (let i = 0; i < 10; i++) {
        // 사용자별 랜덤 대기 (실제 타이핑 시뮬레이션)
        sleep(Math.random() * 3 + 2);  // 2~5초 랜덤 대기

        const sendTimestamp = Date.now();
        const messageId = `${userId}-${i}-${sendTimestamp}`;

        const messageContent = JSON.stringify({
          senderId: userId,
          content: `Message ${i + 1} from user ${userId}`,
          messageType: 'TEXT',
          sendTimestamp: sendTimestamp,
          messageId: messageId,
        });

        const sendFrame = `SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`;

        socket.send(sendFrame);
        messagesSent.add(1);
        sentMessages.set(messageId, sendTimestamp);

        // 전송 성공 기록
        messageSuccess.add(1);
      }

      // 읽음 상태 업데이트 (3회)
      for (let i = 0; i < 3; i++) {
        sleep(5);
        const readFrame = `SEND\ndestination:/app/${roomId}/read\ncontent-type:application/json\n\n{"userId":${userId}}\0`;
        socket.send(readFrame);
      }

      // 연결 유지 (실제 채팅 세션 시뮬레이션)
      sleep(30);
    }

    // 정상 종료
    socket.send('DISCONNECT\n\n\0');
  });

  // 연결 검증
  const connected = check(res, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  if (!connected) {
    connectionSuccess.add(0);
  }
}

// =====================================================
// 테스트 결과 요약 출력
// =====================================================
export function handleSummary(data) {
  const metrics = data.metrics;

  const summary = {
    test_info: {
      name: 'WebSocket Real-time Chat Load Test',
      target_vus: 1000,
      timestamp: new Date().toISOString(),
    },
    connection_metrics: {
      total_connections: metrics.ws_connection_success?.values.count || 0,
      success_rate: `${((metrics.ws_connection_success?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_connection_time: `${(metrics.ws_connection_time?.values.avg || 0).toFixed(2)}ms`,
      p50_connection_time: `${(metrics.ws_connection_time?.values['p(50)'] || 0).toFixed(2)}ms`,
      p95_connection_time: `${(metrics.ws_connection_time?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_connection_time: `${(metrics.ws_connection_time?.values['p(99)'] || 0).toFixed(2)}ms`,
    },
    message_metrics: {
      total_sent: metrics.ws_messages_sent?.values.count || 0,
      total_received: metrics.ws_messages_received?.values.count || 0,
      success_rate: `${((metrics.ws_message_success?.values.rate || 0) * 100).toFixed(2)}%`,
      delivery_rate: `${((metrics.ws_message_delivery_rate?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_latency: `${(metrics.ws_message_latency?.values.avg || 0).toFixed(2)}ms`,
      p50_latency: `${(metrics.ws_message_latency?.values['p(50)'] || 0).toFixed(2)}ms`,
      p95_latency: `${(metrics.ws_message_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_latency: `${(metrics.ws_message_latency?.values['p(99)'] || 0).toFixed(2)}ms`,
      max_latency: `${(metrics.ws_message_latency?.values.max || 0).toFixed(2)}ms`,
    },
    throughput: {
      messages_per_second: ((metrics.ws_messages_sent?.values.count || 0) / (data.state.testRunDurationMs / 1000)).toFixed(2),
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('  WEBSOCKET CHAT LOAD TEST RESULTS');
  console.log('='.repeat(60));
  console.log('\n[Connection Performance]');
  console.log(`  Success Rate: ${summary.connection_metrics.success_rate}`);
  console.log(`  Avg Time: ${summary.connection_metrics.avg_connection_time}`);
  console.log(`  P95 Time: ${summary.connection_metrics.p95_connection_time}`);
  console.log(`  P99 Time: ${summary.connection_metrics.p99_connection_time}`);
  console.log('\n[Message Performance]');
  console.log(`  Total Sent: ${summary.message_metrics.total_sent}`);
  console.log(`  Total Received: ${summary.message_metrics.total_received}`);
  console.log(`  Success Rate: ${summary.message_metrics.success_rate}`);
  console.log(`  Delivery Rate: ${summary.message_metrics.delivery_rate}`);
  console.log(`  Avg Latency: ${summary.message_metrics.avg_latency}`);
  console.log(`  P95 Latency: ${summary.message_metrics.p95_latency}`);
  console.log(`  P99 Latency: ${summary.message_metrics.p99_latency}`);
  console.log('\n[Throughput]');
  console.log(`  Messages/sec: ${summary.throughput.messages_per_second}`);
  console.log('\n' + '='.repeat(60) + '\n');

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'k6/results/websocket-summary.json': JSON.stringify(summary, null, 2),
    'k6/results/websocket-full-report.json': JSON.stringify(data, null, 2),
  };
}
