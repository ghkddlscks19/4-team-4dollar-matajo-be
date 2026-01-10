import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// =====================================================
// 스모크 테스트 - 기본 기능 확인용
// 플로우: Keeper가 게시글 → User가 채팅 요청 → 1대1 채팅
// 본격 부하 테스트 전 시스템 정상 동작 확인
// =====================================================

const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const messageLatency = new Trend('message_latency', true);
const connectionSuccess = new Rate('connection_success');
const apiSuccess = new Rate('api_success');

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    'connection_success': ['rate>0.9'],
    'api_success': ['rate>0.9'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'localhost:8080';
// SockJS 없는 raw WebSocket 엔드포인트 사용 (부하 테스트용)
const WS_URL = `ws://${BASE_URL}/ws-chat-raw`;
const HTTP_URL = `http://${BASE_URL}`;

export function setup() {
  // 서버 헬스체크
  const healthCheck = http.get(`${HTTP_URL}/actuator/health`);
  if (healthCheck.status !== 200) {
    throw new Error('Server is not healthy');
  }

  // 테스트용 데이터 생성 (Keeper 5명, User 10명, Post 5개)
  const setupRes = http.post(`${HTTP_URL}/api/test/setup?keeperCount=5&userCount=10&postCount=5`);
  if (setupRes.status === 200) {
    const data = setupRes.json();
    console.log(`Test data created: ${data.chat_rooms_created} chat rooms ready.`);
    return {
      chatRooms: data.chat_rooms,
      keeperTokens: data.keeper_tokens,
      userTokens: data.user_tokens
    };
  } else {
    console.log('Warning: Could not create test data');
    return { chatRooms: [], keeperTokens: {}, userTokens: {} };
  }
}

export default function (data) {
  // 10개의 채팅방 중 하나 선택
  const index = (__VU - 1) % data.chatRooms.length;
  const chatRoom = data.chatRooms[index];

  if (!chatRoom) {
    connectionSuccess.add(0);
    apiSuccess.add(0);
    sleep(1);
    return;
  }

  const userId = String(chatRoom.user_id);
  const userToken = data.userTokens[userId];
  const roomId = chatRoom.room_id;

  if (!userToken || !roomId) {
    connectionSuccess.add(0);
    apiSuccess.add(0);
    sleep(1);
    return;
  }

  // REST API 테스트 - 채팅 목록 조회
  const headers = { 'Authorization': `Bearer ${userToken}` };
  const apiRes = http.get(`${HTTP_URL}/api/chats`, { headers });

  const apiCheck = check(apiRes, {
    'API status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  apiSuccess.add(apiCheck ? 1 : 0);

  // =====================================================
  // WebSocket 연결 및 1대1 채팅 (setTimeout 사용)
  // =====================================================
  const url = `${WS_URL}?token=${userToken}&userId=${userId}`;

  const res = ws.connect(url, {}, function (socket) {
    let connected = false;
    let messagesSentCount = 0;

    socket.on('message', function (message) {
      // STOMP CONNECTED 수신
      if (message.startsWith('CONNECTED')) {
        connected = true;
        // 채팅방 구독
        socket.send(`SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`);
      }
      // MESSAGE 수신 시 레이턴시 계산
      else if (message.startsWith('MESSAGE')) {
        messagesReceived.add(1);
        try {
          const bodyMatch = message.match(/\n\n(.+)\0/);
          if (bodyMatch) {
            const body = JSON.parse(bodyMatch[1]);
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
      console.log(`[${userId}] WebSocket error: ${e.error()}`);
    });

    // STOMP CONNECT 전송
    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    // 1초 후 메시지 전송 시작
    socket.setTimeout(function () {
      if (!connected) {
        return;
      }

      // 메시지 3개 전송 (간격: 500ms)
      for (let i = 0; i < 3; i++) {
        socket.setTimeout(function () {
          const sendTimestamp = Date.now();
          const messageContent = JSON.stringify({
            sender_id: parseInt(userId),
            content: `Smoke test message ${i + 1} from User ${userId}`,
            message_type: 'TEXT',
            send_timestamp: sendTimestamp,
          });
          socket.send(`SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`);
          messagesSent.add(1);
        }, (i + 1) * 500);  // 최소 500ms (0은 허용 안됨)
      }
    }, 500);

    // 5초 후 연결 종료
    socket.setTimeout(function () {
      socket.close();
    }, 5000);
  });

  // 연결 결과 판정
  const connected = check(res, {
    'WebSocket status is 101': (r) => r && r.status === 101,
  });

  connectionSuccess.add(connected ? 1 : 0);
}

export function handleSummary(data) {
  const connRate = data.metrics.connection_success?.values.rate || 0;
  const apiRate = data.metrics.api_success?.values.rate || 0;
  const passed = connRate >= 0.9 && apiRate >= 0.9;

  const avgLatency = data.metrics.message_latency?.values.avg || 0;
  const p95Latency = data.metrics.message_latency?.values['p(95)'] || 0;

  console.log('\n' + '='.repeat(50));
  console.log('  SMOKE TEST RESULTS (1:1 Chat Flow)');
  console.log('='.repeat(50));
  console.log(`\nStatus: ${passed ? 'PASSED' : 'FAILED'}`);
  console.log(`\n[Messages]`);
  console.log(`  Sent: ${data.metrics.messages_sent?.values.count || 0}`);
  console.log(`  Received: ${data.metrics.messages_received?.values.count || 0}`);
  console.log(`\n[Latency]`);
  console.log(`  Avg: ${avgLatency.toFixed(2)}ms`);
  console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
  console.log(`\n[Success Rates]`);
  console.log(`  WS Connection: ${(connRate * 100).toFixed(2)}%`);
  console.log(`  API: ${(apiRate * 100).toFixed(2)}%`);
  console.log('\n' + '='.repeat(50));

  if (passed) {
    console.log('\nSmoke test passed. Ready for load testing.');
  } else {
    console.log('\nSmoke test failed. Check system before load testing.');
  }

  return {
    'stdout': JSON.stringify({
      status: passed ? 'PASSED' : 'FAILED',
      messages_sent: data.metrics.messages_sent?.values.count || 0,
      messages_received: data.metrics.messages_received?.values.count || 0,
      avg_latency_ms: avgLatency.toFixed(2),
      p95_latency_ms: p95Latency.toFixed(2),
      connection_success_rate: `${(connRate * 100).toFixed(2)}%`,
      api_success_rate: `${(apiRate * 100).toFixed(2)}%`,
    }, null, 2),
  };
}
