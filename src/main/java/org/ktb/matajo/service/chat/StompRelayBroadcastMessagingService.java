package org.ktb.matajo.service.chat;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(name = "broker.type", havingValue = "rabbitmq")
public class StompRelayBroadcastMessagingService implements BroadcastMessagingService {

  private final SimpMessagingTemplate messagingTemplate;

  /**
   * RabbitMQ STOMP는 destination에서 슬래시(/)를 허용하지 않으므로
   * /topic/chat/{roomId} → /topic/chat.{roomId} 로 변환
   */
  private String convertDestination(String destination) {
    if (destination != null && destination.startsWith("/topic/chat/")) {
      String converted = destination.replaceFirst("/topic/chat/", "/topic/chat.");
      log.debug("RabbitMQ destination 변환: {} -> {}", destination, converted);
      return converted;
    }
    return destination;
  }

  @Override
  public void convertAndSend(String destination, Object payload) {
    // RabbitMQ STOMP relay가 자동으로 모든 인스턴스에 전달
    messagingTemplate.convertAndSend(convertDestination(destination), payload);
  }

  @Override
  public void convertAndSendToUser(String user, String destination, Object payload) {
    messagingTemplate.convertAndSendToUser(user, convertDestination(destination), payload);
  }
}
