package org.ktb.matajo.service.notification;

import org.ktb.matajo.dto.chat.ChatMessageResponseDto;
import org.ktb.matajo.entity.ChatRoom;
import org.ktb.matajo.entity.User;
import org.ktb.matajo.repository.ChatRoomRepository;
import org.ktb.matajo.repository.UserRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {
  private final ChatRoomRepository chatRoomRepository;
  private final UserRepository userRepository;
  private final FirebaseNotificationService firebaseNotificationService;

  @Async("notificationExecutor")
  @Override
  public void sendChatNotification(ChatMessageResponseDto messageDto, Long currentUserId) {
    if (messageDto == null || currentUserId == null) {
      log.warn("알림 전송 실패: 메시지 또는 사용자 ID가 null입니다.");
      return;
    }

    try {
      // FETCH JOIN으로 ChatRoom + 의뢰인 + Post + 보관인을 한 번에 조회
      ChatRoom chatRoom =
          chatRoomRepository
              .findByIdWithUsers(messageDto.getRoomId())
              .orElse(null);

      if (chatRoom == null) {
        log.warn("알림 전송 실패: 채팅방을 찾을 수 없습니다. roomId={}", messageDto.getRoomId());
        return;
      }

      // 수신자 결정: chatRoom.user = 의뢰인, chatRoom.post.user = 보관인
      Long clientId = chatRoom.getUser().getId();
      Long keeperId = chatRoom.getPost().getUser().getId();
      Long receiverId = currentUserId.equals(keeperId) ? clientId : keeperId;

      // 자기 자신에게 알림 전송 방지
      if (receiverId.equals(currentUserId)) {
        return;
      }

      // 수신자 조회 (FCM 토큰 필요)
      User receiverUser =
          userRepository
              .findById(receiverId)
              .orElse(null);

      if (receiverUser == null) {
        log.warn("알림 전송 실패: 수신자를 찾을 수 없습니다. userId={}", receiverId);
        return;
      }

      // FCM 토큰 유효성 확인
      if (receiverUser.getFcmToken() == null || receiverUser.getFcmToken().isBlank()) {
        log.debug("FCM 알림 전송 생략: 유효한 FCM 토큰 없음. receiverId={}", receiverId);
        return;
      }

      // FCM 알림 전송
      log.info(
          "FCM 알림 전송 시도: receiverId={}, senderNickname={}",
          receiverUser.getId(),
          messageDto.getSenderNickname());

      firebaseNotificationService.sendMessageNotification(
          messageDto.getSenderNickname(),
          messageDto,
          receiverUser.getFcmToken(),
          receiverUser.getId());

    } catch (Exception e) {
      log.error("알림 전송 중 오류 발생: {}", e.getMessage(), e);
    }
  }
}
