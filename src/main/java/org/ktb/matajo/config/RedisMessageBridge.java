package org.ktb.matajo.config;

import org.ktb.matajo.dto.chat.BridgeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@ConditionalOnProperty(name = "broker.type", havingValue = "redis", matchIfMissing = true)
public class RedisMessageBridge implements MessageListener {

  private final SimpMessagingTemplate messagingTemplate;
  private final RedisTemplate<String, Object> redisTemplate;
  private final ObjectMapper objectMapper;
  private final String instanceId;

  public static final String CHANNEL = "ws:broadcast";

  public RedisMessageBridge(
      SimpMessagingTemplate messagingTemplate,
      RedisTemplate<String, Object> redisTemplate,
      ObjectMapper objectMapper,
      @Value("${app.instance-id:#{T(java.util.UUID).randomUUID().toString()}}") String instanceId) {
    this.messagingTemplate = messagingTemplate;
    this.redisTemplate = redisTemplate;
    this.objectMapper = objectMapper;
    this.instanceId = instanceId;
    log.info("RedisMessageBridge 초기화: instanceId={}", instanceId);
  }

  /** Redis Pub/Sub로 메시지 발행 */
  public void publish(String destination, Object payload, String targetUser) {
    try {
      String payloadJson = objectMapper.writeValueAsString(payload);
      BridgeMessage msg =
          BridgeMessage.builder()
              .originInstanceId(instanceId)
              .destination(destination)
              .payloadJson(payloadJson)
              .targetUser(targetUser)
              .build();
      redisTemplate.convertAndSend(CHANNEL, msg);
    } catch (Exception e) {
      log.warn("Redis Pub/Sub 발행 실패: {}", e.getMessage());
    }
  }

  /** Redis에서 수신한 메시지를 로컬 STOMP 브로커로 전달 */
  @Override
  public void onMessage(Message message, byte[] pattern) {
    try {
      BridgeMessage msg = objectMapper.readValue(message.getBody(), BridgeMessage.class);

      // 자기 인스턴스에서 보낸 메시지는 무시 (이미 로컬에서 전송됨)
      if (instanceId.equals(msg.getOriginInstanceId())) {
        return;
      }

      // payloadJson을 Object로 역직렬화
      Object payload = objectMapper.readValue(msg.getPayloadJson(), Object.class);

      if (msg.getTargetUser() != null) {
        messagingTemplate.convertAndSendToUser(
            msg.getTargetUser(), msg.getDestination(), payload);
      } else {
        messagingTemplate.convertAndSend(msg.getDestination(), payload);
      }

      if (log.isDebugEnabled()) {
        log.debug(
            "다른 인스턴스 메시지 수신 및 전달: from={}, dest={}",
            msg.getOriginInstanceId(),
            msg.getDestination());
      }
    } catch (Exception e) {
      log.warn("Redis 메시지 수신 처리 실패: {}", e.getMessage());
    }
  }
}
