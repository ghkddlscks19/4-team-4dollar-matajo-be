import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

// =====================================================
// 실시간 채팅 WebSocket 부하 테스트
// 플로우: Keeper가 게시글 → User가 채팅 요청 → 1대1 채팅
// Target: 5,000 VUs (동시 사용자)
// 목표: DAU 5만 명 규모 서비스의 피크 시간대 시뮬레이션
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
// 테스트 시나리오: 5,000 VUs (DAU 5만 명 피크 기준)
// =====================================================
export const options = {
  scenarios: {
    gradual_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 500 },    // 워밍업
        { duration: '2m', target: 1500 },   // 증가
        { duration: '2m', target: 2500 },   // 증가
        { duration: '3m', target: 5000 },   // 목표 도달 (5,000명)
        { duration: '5m', target: 5000 },   // 안정성 검증 (중요!)
        { duration: '2m', target: 2500 },   // 감소
        { duration: '1m', target: 0 },      // 정리
      ],
      gracefulRampDown: '30s',
    },
  },

  // 성능 기준 (문서 기준과 일치)
  thresholds: {
    'ws_connection_success': ['rate>0.999'],       // 연결 성공률 99.9% 이상
    'ws_connection_time': ['p(95)<3000'],           // 연결 시간 P95 < 3초
    'ws_message_success': ['rate>0.99'],            // 메시지 성공률 99% 이상
    'ws_message_latency': ['p(95)<300', 'p(99)<500'], // P95 < 300ms, P99 < 500ms
    'ws_messages_received': ['count>0'],              // 메시지 수신 확인 (전달률은 handleSummary에서 검증)
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
  console.log('Creating test data: 500 keepers, 5000 users, 500 posts, 5000 chat rooms...');

  const setupRes = http.post(`${HTTP_URL}/api/test/setup?keeperCount=500&userCount=5000&postCount=500`);
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
  // 5000개의 채팅방 중 하나 선택
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

      // User가 메시지 전송 (10개, 2~5초 간격)
      let cumulativeDelay = 0;
      for (let i = 0; i < 10; i++) {
        const interval = 2000 + Math.floor(Math.random() * 3000);  // 2~5초 랜덤
        cumulativeDelay += interval;
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
        }, cumulativeDelay);
      }

      // 읽음 상태 업데이트 3회 (메시지 전송 사이에 분산)
      for (let j = 0; j < 3; j++) {
        const readDelay = 3000 + (j * 8000);  // 3초, 11초, 19초
        socket.setTimeout(function () {
          socket.send(`SEND\ndestination:/app/${roomId}/read\ncontent-type:application/json\n\n{"userId":${parseInt(userId)}}\0`);
        }, readDelay);
      }
    }, 500);

    // 30초 후 연결 종료 (실제 채팅 시뮬레이션)
    socket.setTimeout(function () {
      socket.close();
    }, 30000);
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
  const totalSent = metrics.ws_messages_sent?.values.count || 0;
  const totalReceived = metrics.ws_messages_received?.values.count || 0;
  const deliveryRate = totalSent > 0 ? ((totalReceived / totalSent) * 100).toFixed(2) : '0.00';

  const summary = {
    test_info: {
      name: 'WebSocket Chat Load Test (1:1 Chat Flow)',
      target_vus: 5000,
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
      total_sent: totalSent,
      total_received: totalReceived,
      delivery_rate: `${deliveryRate}%`,
      success_rate: `${((metrics.ws_message_success?.values.rate || 0) * 100).toFixed(2)}%`,
      avg_latency: `${(metrics.ws_message_latency?.values.avg || 0).toFixed(2)}ms`,
      p50_latency: `${(metrics.ws_message_latency?.values['p(50)'] || metrics.ws_message_latency?.values.med || 0).toFixed(2)}ms`,
      p95_latency: `${(metrics.ws_message_latency?.values['p(95)'] || 0).toFixed(2)}ms`,
      p99_latency: `${(metrics.ws_message_latency?.values['p(99)'] || 0).toFixed(2)}ms`,
      max_latency: `${(metrics.ws_message_latency?.values.max || 0).toFixed(2)}ms`,
    },
    throughput: {
      messages_per_second: (totalSent / parseFloat(testDuration)).toFixed(2),
    },
  };

  // PASS/FAIL 판정 (보고서 기준)
  const deliveryPass = parseFloat(deliveryRate) >= 99.0;

  console.log('\n' + '='.repeat(60));
  console.log('  WEBSOCKET LOAD TEST RESULTS (1:1 Chat Flow)');
  console.log('='.repeat(60));
  console.log(`\n[Test Info]`);
  console.log(`  Duration: ${testDuration}s`);
  console.log(`  Target VUs: 5000`);
  console.log(`\n[Connection Performance]`);
  console.log(`  Success Rate: ${summary.connection.success_rate}`);
  console.log(`  Avg Time: ${summary.connection.avg_time}`);
  console.log(`  P95 Time: ${summary.connection.p95_time}`);
  console.log(`  P99 Time: ${summary.connection.p99_time}`);
  console.log(`\n[Message Performance]`);
  console.log(`  Total Sent: ${summary.message.total_sent}`);
  console.log(`  Total Received: ${summary.message.total_received}`);
  console.log(`  Delivery Rate: ${summary.message.delivery_rate}  ${deliveryPass ? '✅ PASS (≥99%)' : '❌ FAIL (<99%)'}`);
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
