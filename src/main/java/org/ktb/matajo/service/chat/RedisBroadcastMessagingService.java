package org.ktb.matajo.service.chat;

import org.ktb.matajo.config.RedisMessageBridge;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(name = "broker.type", havingValue = "redis", matchIfMissing = true)
public class RedisBroadcastMessagingService implements BroadcastMessagingService {

  private final SimpMessagingTemplate messagingTemplate;
  private final RedisMessageBridge redisMessageBridge;

  @Override
  public void convertAndSend(String destination, Object payload) {
    // 로컬 구독자에게 전송
    messagingTemplate.convertAndSend(destination, payload);
    // 다른 인스턴스에 Redis Pub/Sub로 전파
    redisMessageBridge.publish(destination, payload, null);
  }

  @Override
  public void convertAndSendToUser(String user, String destination, Object payload) {
    // 로컬 구독자에게 전송
    messagingTemplate.convertAndSendToUser(user, destination, payload);
    // 다른 인스턴스에 Redis Pub/Sub로 전파
    redisMessageBridge.publish(destination, payload, user);
  }
}
