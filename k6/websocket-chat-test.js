import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import http from 'k6/http';

// =====================================================
// 커스텀 메트릭 정의
// =====================================================
const messagesSent = new Counter('messages_sent');
const messagesReceived = new Counter('messages_received');
const messageLatency = new Trend('message_latency', true);
const connectionTime = new Trend('connection_time', true);
const connectionSuccess = new Rate('connection_success');
const messageSuccess = new Rate('message_success');

// =====================================================
// 테스트 설정
// =====================================================
export const options = {
  scenarios: {
    // 시나리오 1: 점진적 부하 테스트
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // 30초 동안 50명까지 증가
        { duration: '1m', target: 100 },   // 1분 동안 100명까지 증가
        { duration: '2m', target: 100 },   // 2분 동안 100명 유지
        { duration: '30s', target: 200 },  // 30초 동안 200명까지 증가
        { duration: '1m', target: 200 },   // 1분 동안 200명 유지
        { duration: '30s', target: 0 },    // 30초 동안 0명으로 감소
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'connection_success': ['rate>0.95'],       // 연결 성공률 95% 이상
    'message_success': ['rate>0.95'],          // 메시지 성공률 95% 이상
    'message_latency': ['p(95)<500'],          // 95% 메시지 레이턴시 500ms 이하
    'connection_time': ['p(95)<3000'],         // 95% 연결 시간 3초 이하
  },
};

// =====================================================
// 테스트 환경 설정
// =====================================================
const BASE_URL = __ENV.BASE_URL || 'localhost:8080';
const WS_URL = `ws://${BASE_URL}/ws-chat`;
const HTTP_URL = `http://${BASE_URL}`;

// JWT 토큰 생성 (테스트용 - 실제로는 로그인 API 호출 필요)
function getTestToken(userId) {
  // 테스트 환경에서는 간단한 토큰 사용
  // 실제 환경에서는 로그인 API를 호출하여 토큰을 받아야 함
  return `test-token-${userId}`;
}

// =====================================================
// 메인 테스트 함수
// =====================================================
export default function () {
  const userId = (__VU % 100) + 1;  // 1~100 사이의 사용자 ID
  const roomId = (__VU % 10) + 1;   // 1~10 사이의 채팅방 ID
  const token = getTestToken(userId);

  // WebSocket 연결 URL (STOMP over WebSocket)
  const url = `${WS_URL}/websocket?userId=${userId}&token=${token}`;

  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    const connectEnd = Date.now();
    connectionTime.add(connectEnd - connectStart);
    connectionSuccess.add(1);

    // STOMP CONNECT 프레임 전송
    socket.send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n\0');

    socket.on('open', function () {
      console.log(`[VU ${__VU}] WebSocket connected for user ${userId}`);
    });

    socket.on('message', function (message) {
      messagesReceived.add(1);

      // STOMP CONNECTED 응답 확인
      if (message.includes('CONNECTED')) {
        console.log(`[VU ${__VU}] STOMP connected`);

        // 채팅방 구독
        const subscribeFrame = `SUBSCRIBE\nid:sub-${roomId}\ndestination:/topic/chat/${roomId}\n\n\0`;
        socket.send(subscribeFrame);

        // 읽음 상태 토픽 구독
        const subscribeStatusFrame = `SUBSCRIBE\nid:sub-status-${roomId}\ndestination:/topic/chat/${roomId}/status\n\n\0`;
        socket.send(subscribeStatusFrame);
      }

      // MESSAGE 프레임 수신 시 레이턴시 측정
      if (message.includes('MESSAGE')) {
        const receiveTime = Date.now();
        // 메시지에서 타임스탬프 추출하여 레이턴시 계산 (실제 구현 필요)
        messageSuccess.add(1);
      }
    });

    socket.on('error', function (e) {
      console.log(`[VU ${__VU}] WebSocket error: ${e}`);
      connectionSuccess.add(0);
    });

    socket.on('close', function () {
      console.log(`[VU ${__VU}] WebSocket closed`);
    });

    // 메시지 전송 루프
    for (let i = 0; i < 5; i++) {
      sleep(Math.random() * 2 + 1);  // 1~3초 랜덤 대기

      const messageContent = JSON.stringify({
        senderId: userId,
        content: `Test message ${i + 1} from user ${userId} at ${new Date().toISOString()}`,
        messageType: 'TEXT'
      });

      const sendFrame = `SEND\ndestination:/app/${roomId}/message\ncontent-type:application/json\n\n${messageContent}\0`;

      const sendStart = Date.now();
      socket.send(sendFrame);
      messagesSent.add(1);

      console.log(`[VU ${__VU}] Sent message ${i + 1} to room ${roomId}`);
    }

    // 읽음 상태 업데이트
    sleep(1);
    const readFrame = `SEND\ndestination:/app/${roomId}/read\ncontent-type:application/json\n\n{"userId":${userId}}\0`;
    socket.send(readFrame);

    // 연결 유지 (30초)
    sleep(30);

    // STOMP DISCONNECT
    socket.send('DISCONNECT\n\n\0');
  });

  // 연결 실패 처리
  check(res, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    connectionSuccess.add(0);
    console.log(`[VU ${__VU}] Connection failed with status: ${res ? res.status : 'null'}`);
  }
}

// =====================================================
// 테스트 종료 시 요약 출력
// =====================================================
export function handleSummary(data) {
  const summary = {
    'Total Messages Sent': data.metrics.messages_sent ? data.metrics.messages_sent.values.count : 0,
    'Total Messages Received': data.metrics.messages_received ? data.metrics.messages_received.values.count : 0,
    'Connection Success Rate': data.metrics.connection_success ? `${(data.metrics.connection_success.values.rate * 100).toFixed(2)}%` : 'N/A',
    'Message Success Rate': data.metrics.message_success ? `${(data.metrics.message_success.values.rate * 100).toFixed(2)}%` : 'N/A',
    'Avg Message Latency': data.metrics.message_latency ? `${data.metrics.message_latency.values.avg.toFixed(2)}ms` : 'N/A',
    'P95 Message Latency': data.metrics.message_latency ? `${data.metrics.message_latency.values['p(95)'].toFixed(2)}ms` : 'N/A',
    'Avg Connection Time': data.metrics.connection_time ? `${data.metrics.connection_time.values.avg.toFixed(2)}ms` : 'N/A',
    'P95 Connection Time': data.metrics.connection_time ? `${data.metrics.connection_time.values['p(95)'].toFixed(2)}ms` : 'N/A',
  };

  console.log('\n========== TEST SUMMARY ==========');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }
  console.log('==================================\n');

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'results/summary.json': JSON.stringify(data, null, 2),
  };
}
