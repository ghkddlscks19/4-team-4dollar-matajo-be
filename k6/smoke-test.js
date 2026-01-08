import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// =====================================================
// 스모크 테스트 - 기본 기능 확인용
// 본격 부하 테스트 전 시스템 정상 동작 확인
// =====================================================

const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
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
const WS_URL = `ws://${BASE_URL}/ws-chat`;
const HTTP_URL = `http://${BASE_URL}`;

export function setup() {
  // 서버 헬스체크
  const healthCheck = http.get(`${HTTP_URL}/actuator/health`);
  if (healthCheck.status !== 200) {
    throw new Error('Server is not healthy');
  }

  // 테스트용 토큰 미리 생성
  const tokenRes = http.get(`${HTTP_URL}/api/test/tokens?count=10`);
  if (tokenRes.status === 200) {
    console.log('Test tokens generated successfully');
    return tokenRes.json();
  } else {
    console.log('Warning: Could not generate test tokens');
    return { tokens: {} };
  }
}

export default function (data) {
  const userId = (__VU % 10) + 1;
  const roomId = (__VU % 5) + 1;

  // Setup에서 받은 토큰 사용
  const token = data.tokens ? data.tokens[String(userId)] : null;

  if (!token) {
    console.log(`No token for user ${userId}`);
    connectionSuccess.add(0);
    apiSuccess.add(0);
    return;
  }

  // REST API 테스트
  const headers = { 'Authorization': `Bearer ${token}` };
  const apiRes = http.get(`${HTTP_URL}/api/chats`, { headers });

  const apiCheck = check(apiRes, {
    'API status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  apiSuccess.add(apiCheck ? 1 : 0);

  // WebSocket 테스트
  const url = `${WS_URL}/websocket?userId=${userId}&token=${token}`;

  let wsConnected = false;

  const res = ws.connect(url, {}, function (socket) {
    wsConnected = true;

    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    socket.on('message', function (message) {
      messagesReceived.add(1);

      if (message.includes('CONNECTED')) {
        socket.send(`SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`);
      }
    });

    socket.on('error', function (e) {
      console.log(`WebSocket error: ${e.error()}`);
    });

    // 메시지 3개 전송
    for (let i = 0; i < 3; i++) {
      sleep(2);

      const messageContent = JSON.stringify({
        sender_id: userId,
        content: `Smoke test message ${i + 1}`,
        message_type: 'TEXT',
        sendTimestamp: Date.now(),
      });

      socket.send(`SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`);
      messagesSent.add(1);
    }

    sleep(3);
    // STOMP DISCONNECT - 정상 종료 (에러 무시 가능)
    socket.close();
  });

  // 연결 결과 판정 (ws.connect 완료 후)
  const connected = check(res, {
    'WebSocket status is 101': (r) => r && r.status === 101,
  });

  // 메트릭은 한 번만 기록
  connectionSuccess.add(connected ? 1 : 0);
}

export function handleSummary(data) {
  const connRate = data.metrics.connection_success?.values.rate || 0;
  const apiRate = data.metrics.api_success?.values.rate || 0;
  const passed = connRate >= 0.9 && apiRate >= 0.9;

  console.log('\n' + '='.repeat(50));
  console.log('  SMOKE TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`\nStatus: ${passed ? 'PASSED' : 'FAILED'}`);
  console.log(`\nMessages Sent: ${data.metrics.messages_sent?.values.count || 0}`);
  console.log(`Messages Received: ${data.metrics.messages_received?.values.count || 0}`);
  console.log(`WS Connection Success: ${(connRate * 100).toFixed(2)}%`);
  console.log(`API Success: ${(apiRate * 100).toFixed(2)}%`);
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
      connection_success_rate: `${(connRate * 100).toFixed(2)}%`,
      api_success_rate: `${(apiRate * 100).toFixed(2)}%`,
    }, null, 2),
  };
}
