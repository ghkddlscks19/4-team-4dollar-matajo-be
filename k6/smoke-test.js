import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// =====================================================
// 스모크 테스트 - 기본 기능 확인용 (소규모)
// =====================================================

const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const connectionSuccess = new Rate('connection_success');

export const options = {
  vus: 10,           // 10명의 가상 사용자
  duration: '1m',    // 1분 동안 테스트
  thresholds: {
    'connection_success': ['rate>0.9'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'localhost:8080';
const WS_URL = `ws://${BASE_URL}/ws-chat`;

export default function () {
  const userId = (__VU % 10) + 1;
  const roomId = (__VU % 5) + 1;
  const token = `test-token-${userId}`;

  const url = `${WS_URL}/websocket?userId=${userId}&token=${token}`;

  const res = ws.connect(url, {}, function (socket) {
    connectionSuccess.add(1);

    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    socket.on('message', function (message) {
      messagesReceived.add(1);

      if (message.includes('CONNECTED')) {
        // 채팅방 구독
        socket.send(`SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`);
      }
    });

    socket.on('error', function (e) {
      console.log(`Error: ${e}`);
      connectionSuccess.add(0);
    });

    // 메시지 3개 전송
    for (let i = 0; i < 3; i++) {
      sleep(2);

      const messageContent = JSON.stringify({
        senderId: userId,
        content: `Smoke test message ${i + 1}`,
        messageType: 'TEXT'
      });

      socket.send(`SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`);
      messagesSent.add(1);
    }

    sleep(5);
    socket.send('DISCONNECT\n\n\0');
  });

  check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    connectionSuccess.add(0);
  }
}

export function handleSummary(data) {
  console.log('\n========== SMOKE TEST RESULTS ==========');
  console.log(`Messages Sent: ${data.metrics.messages_sent?.values.count || 0}`);
  console.log(`Messages Received: ${data.metrics.messages_received?.values.count || 0}`);
  console.log(`Connection Success: ${((data.metrics.connection_success?.values.rate || 0) * 100).toFixed(2)}%`);
  console.log('=========================================\n');

  return {
    'stdout': JSON.stringify(data.metrics, null, 2),
  };
}
