package org.ktb.matajo.service.chat;

/** 다중 인스턴스 환경에서 WebSocket 메시지 브로드캐스트를 위한 추상화 */
public interface BroadcastMessagingService {

  void convertAndSend(String destination, Object payload);

  void convertAndSendToUser(String user, String destination, Object payload);
}
