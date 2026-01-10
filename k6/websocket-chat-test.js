import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

// =====================================================
// 실시간 채팅 WebSocket 부하 테스트
// 플로우: Keeper가 게시글 → User가 채팅 요청 → 1대1 채팅
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
        { duration: '1m', target: 100 },    // 워밍업
        { duration: '2m', target: 300 },    // 증가
        { duration: '2m', target: 500 },    // 증가
        { duration: '3m', target: 1000 },   // 목표 도달
        { duration: '5m', target: 1000 },   // 안정성 검증 (중요!)
        { duration: '2m', target: 500 },    // 감소
        { duration: '1m', target: 0 },      // 정리
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
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// =====================================================
// 환경 설정
// =====================================================
const BASE_URL = __ENV.BASE_URL || 'localhost:8080';
// SockJS 없는 raw WebSocket 엔드포인트 사용 (부하 테스트용)
const WS_URL = `ws://${BASE_URL}/ws-chat-raw`;
const HTTP_URL = `http://${BASE_URL}`;

// =====================================================
// Setup: 테스트 데이터 생성 (Keeper, User, Post, ChatRoom)
// =====================================================
export function setup() {
  console.log('Creating test data: 100 keepers, 1000 users, 100 posts, 1000 chat rooms...');

  const setupRes = http.post(`${HTTP_URL}/api/test/setup?keeperCount=100&userCount=1000&postCount=100`);
  if (setupRes.status === 200) {
    const data = setupRes.json();
    console.log(`Test data created: ${data.chat_rooms_created} chat rooms ready.`);
    return {
      chatRooms: data.chat_rooms,  // [{room_id, user_id, keeper_id, post_id}, ...]
      keeperTokens: data.keeper_tokens,
      userTokens: data.user_tokens
    };
  } else {
    console.log('Warning: Could not create test data');
    return { chatRooms: [], keeperTokens: {}, userTokens: {} };
  }
}

// =====================================================
// 메인 테스트 함수
// 플로우: 미리 생성된 채팅방에 접속 → 1대1 채팅
// =====================================================
export default function (data) {
  // 1000개의 채팅방 중 하나 선택
  const index = (__VU - 1) % data.chatRooms.length;
  const chatRoom = data.chatRooms[index];

  if (!chatRoom) {
    connectionSuccess.add(0);
    sleep(1);
    return;
  }

  const userId = String(chatRoom.user_id);
  const userToken = data.userTokens[userId];
  const roomId = chatRoom.room_id;

  if (!userToken || !roomId) {
    connectionSuccess.add(0);
    sleep(1);
    return;
  }

  // =====================================================
  // WebSocket 연결 및 1대1 채팅 (setTimeout 사용)
  // =====================================================
  const url = `${WS_URL}?token=${userToken}&userId=${userId}`;
  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    const connectEnd = Date.now();
    connectionTime.add(connectEnd - connectStart);
    activeConnections.add(1);

    let stompConnected = false;

    socket.on('message', function (message) {
      // STOMP CONNECTED 응답
      if (message.startsWith('CONNECTED') && !stompConnected) {
        stompConnected = true;
        // 채팅방 구독
        socket.send(`SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`);
      }

      // MESSAGE 수신 시 레이턴시 계산
      if (message.startsWith('MESSAGE')) {
        messagesReceived.add(1);
        messageSuccess.add(1);
        try {
          const bodyMatch = message.match(/\n\n(.+)\0/);
          if (bodyMatch) {
            const body = JSON.parse(bodyMatch[1]);
            // Jackson SNAKE_CASE 전략으로 send_timestamp로 응답됨
            if (body.send_timestamp) {
              const latency = Date.now() - body.send_timestamp;
              messageLatency.add(latency);
            }
          }
        } catch (e) {
          // 파싱 실패 무시
        }
      }
    });

    socket.on('error', function (e) {
      // 에러 로깅 최소화 (부하 테스트 시)
    });

    socket.on('close', function () {
      activeConnections.add(-1);
    });

    // STOMP CONNECT 전송
    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    // 500ms 후 메시지 전송 시작 (STOMP 연결 대기)
    socket.setTimeout(function () {
      if (!stompConnected) {
        return;
      }

      // User가 메시지 전송 (5개, 1~2초 간격)
      for (let i = 0; i < 5; i++) {
        const delay = 1000 + Math.floor(Math.random() * 1000);  // 1~2초 랜덤
        socket.setTimeout(function () {
          const sendTimestamp = Date.now();
          const messageContent = JSON.stringify({
            sender_id: parseInt(userId),
            content: `User ${userId}: Message ${i + 1}`,
            message_type: 'TEXT',
            send_timestamp: sendTimestamp,
          });
          socket.send(`SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`);
          messagesSent.add(1);
        }, (i + 1) * delay);  // 최소 1000ms (0은 허용 안됨)
      }
    }, 500);

    // 15초 후 연결 종료 (실제 채팅 시뮬레이션)
    socket.setTimeout(function () {
      socket.close();
    }, 15000);
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
      name: 'WebSocket Chat Load Test (1:1 Chat Flow)',
      target_vus: 1000,
      duration_seconds: testDuration,
      timestamp: new Date().toISOString(),
    },
    connection: {
      success_rate: `${((metrics.ws_connection_success?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_time: `${(metrics.ws_connection_time?.values.avg || 0).toFixed(2)}ms`,
      p50_time: `${(metrics.ws_connection_time?.values['p(50)'] || metrics.ws_connection_time?.values.med || 0).toFixed(2)}ms`,
      p95_time: `${(metrics.ws_connection_time?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_time: `${(metrics.ws_connection_time?.values['p(99)'] || 0).toFixed(2)}ms`,
    },
    message: {
      total_sent: metrics.ws_messages_sent?.values.count || 0,
      total_received: metrics.ws_messages_received?.values.count || 0,
      success_rate: `${((metrics.ws_message_success?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_latency: `${(metrics.ws_message_latency?.values.avg || 0).toFixed(2)}ms`,
      p50_latency: `${(metrics.ws_message_latency?.values['p(50)'] || metrics.ws_message_latency?.values.med || 0).toFixed(2)}ms`,
      p95_latency: `${(metrics.ws_message_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_latency: `${(metrics.ws_message_latency?.values['p(99)'] || 0).toFixed(2)}ms`,
      max_latency: `${(metrics.ws_message_latency?.values.max || 0).toFixed(2)}ms`,
    },
    throughput: {
      messages_per_second: ((metrics.ws_messages_sent?.values.count || 0) / parseFloat(testDuration)).toFixed(2),
    },
  };

  console.log('\n' + '='.repeat(60));
  console.log('  WEBSOCKET LOAD TEST RESULTS (1:1 Chat Flow)');
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
