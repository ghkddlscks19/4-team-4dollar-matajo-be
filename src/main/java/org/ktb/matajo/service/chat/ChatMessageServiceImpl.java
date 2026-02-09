package org.ktb.matajo.service.chat;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.ktb.matajo.dto.chat.ChatMessageRequestDto;
import org.ktb.matajo.dto.chat.ChatMessageResponseDto;
import org.ktb.matajo.entity.*;
import org.ktb.matajo.global.error.code.ErrorCode;
import org.ktb.matajo.global.error.exception.BusinessException;
import org.ktb.matajo.repository.ChatMessageRepository;
import org.ktb.matajo.repository.ChatRoomRepository;
import org.ktb.matajo.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatMessageServiceImpl implements ChatMessageService {

  private final ChatMessageRepository chatMessageRepository;
  private final ChatRoomRepository chatRoomRepository;
  private final UserRepository userRepository;
  //    private final RedisChatMessageService redisChatMessageService;
  private final SimpMessagingTemplate messagingTemplate;

  /** 채팅 메시지 저장 */
  @Override
  @Transactional
  public ChatMessageResponseDto saveMessage(Long roomId, ChatMessageRequestDto messageDto) {
    // 입력 유효성 검사
    validateMessageInput(roomId, messageDto);

    // 채팅방 조회
    ChatRoom chatRoom = findChatRoom(roomId);

    // 발신자 조회
    User sender = findSender(messageDto.getSenderId());

    log.info("메시지 생성 전 readStatus 설정: false");

    // 메시지 생성 및 저장
    ChatMessage chatMessage = createAndSaveChatMessage(chatRoom, sender, messageDto);

    // 저장 후 상태 확인
    log.info("메시지 ID: {}, 저장 후 readStatus: {}", chatMessage.getId(), chatMessage.isReadStatus());

    // 응답 DTO 생성 (sendTimestamp 포함 - 레이턴시 측정용)
    ChatMessageResponseDto responseDto =
        convertToChatMessageResponseDto(chatMessage, messageDto.getSendTimestamp());

    return responseDto;
  }

  /** 입력 유효성 검사 */
  private void validateMessageInput(Long roomId, ChatMessageRequestDto messageDto) {
    validateRoomId(roomId);

    // 이미지 타입 메시지 검증
    if (messageDto.isImageTypeWithEmptyContent()) {
      log.error("이미지 타입 메시지의 내용이 비어있습니다");
      throw new BusinessException(ErrorCode.INVALID_IMAGE_CONTENT);
    }
  }

  /** 채팅방 조회 */
  private ChatRoom findChatRoom(Long roomId) {
    return chatRoomRepository
        .findById(roomId)
        .orElseThrow(
            () -> {
              log.error("채팅방을 찾을 수 없습니다");
              return new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
            });
  }

  /** 발신자 조회 */
  private User findSender(Long senderId) {
    return userRepository
        .findById(senderId)
        .orElseThrow(
            () -> {
              log.error("사용자를 찾을 수 없습니다");
              return new BusinessException(ErrorCode.USER_NOT_FOUND);
            });
  }

  /** 채팅 메시지 생성 및 저장 */
  private ChatMessage createAndSaveChatMessage(
      ChatRoom chatRoom, User sender, ChatMessageRequestDto messageDto) {
    ChatMessage chatMessage =
        ChatMessage.builder()
            .chatRoom(chatRoom)
            .user(sender)
            .content(messageDto.getContent())
            .messageType(messageDto.getMessageType())
            .readStatus(false)
            .createdAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")))
            .build();

    return chatMessageRepository.save(chatMessage);
  }

  /** 채팅방의 메시지 목록 조회 */
  @Override
  public List<ChatMessageResponseDto> getChatMessages(Long roomId) {

    validateRoomId(roomId);

    // 첫 페이지이면 캐시에서 먼저 조회 시도
    //        if (page == 0) {
    //            List<ChatMessageResponseDto> cachedMessages =
    // redisChatMessageService.getCachedMessages(roomId, size);
    //
    //            if (!cachedMessages.isEmpty()) {
    //                log.info("Redis 캐시에서 메시지 조회: roomId={}, cachedCount={}", roomId,
    // cachedMessages.size());
    //                return cachedMessages;
    //            }
    //        }

    // 메시지 조회
    List<ChatMessage> messages = chatMessageRepository.findByChatRoomId(roomId);

    List<ChatMessageResponseDto> messageDtos =
        messages.stream().map(this::convertToChatMessageResponseDto).collect(Collectors.toList());

    // 첫 페이지 결과를 Redis에 캐싱 - 예외 처리 추가
    //        if (page == 0 && !messageDtos.isEmpty()) {
    //            try {
    //                redisChatMessageService.cacheMessages(roomId, messageDtos);
    //            } catch (Exception e) {
    //                log.warn("메시지 목록 캐싱 실패 (무시됨): {}", e.getMessage());
    //            }
    //        }

    return messageDtos;
  }

  /** 메시지 읽음 상태 업데이트 */
  @Override
  @Transactional
  public void markMessagesAsRead(Long roomId, Long userId) {

    validateRoomId(roomId);

    // 파라미터 검증
    if (userId == null || userId <= 0) {
      log.error("유효하지 않은 userId 값입니다: {}", userId);
      throw new BusinessException(ErrorCode.INVALID_USER_ID);
    }

    // 벌크 UPDATE로 읽음 처리 (쿼리 N번 → 1번)
    int updatedCount = chatMessageRepository.bulkMarkAsRead(roomId, userId);

    // 읽음 처리된 메시지가 있으면 WebSocket으로 브로드캐스트
    if (updatedCount > 0) {
      Map<String, Object> readStatusUpdate = new HashMap<>();
      readStatusUpdate.put("type", "READ_STATUS_UPDATE");
      readStatusUpdate.put("roomId", roomId);
      readStatusUpdate.put("readBy", userId);
      readStatusUpdate.put("updatedCount", updatedCount);

      messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/status", readStatusUpdate);
    }
  }

  /** ChatMessage 엔티티를 ChatMessageResponseDto로 변환 */
  private ChatMessageResponseDto convertToChatMessageResponseDto(ChatMessage message) {
    return convertToChatMessageResponseDto(message, null);
  }

  /**
   * ChatMessage 엔티티를 ChatMessageResponseDto로 변환 (sendTimestamp 포함)
   *
   * @param message 채팅 메시지 엔티티
   * @param sendTimestamp 클라이언트 전송 타임스탬프 (레이턴시 측정용)
   */
  private ChatMessageResponseDto convertToChatMessageResponseDto(
      ChatMessage message, Long sendTimestamp) {
    return ChatMessageResponseDto.builder()
        .messageId(message.getId())
        .roomId(message.getChatRoom().getId())
        .senderId(message.getUser().getId())
        .senderNickname(message.getUser().getNickname())
        .content(message.getContent())
        .messageType(message.getMessageType())
        .readStatus(message.isReadStatus())
        .createdAt(message.getCreatedAt())
        .sendTimestamp(sendTimestamp)
        .build();
  }

  private void validateRoomId(Long roomId) {
    // 간단한 파라미터 검증
    if (roomId == null) {
      log.error("roomId가 null입니다");
      throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
    }

    if (roomId <= 0) {
      log.error("유효하지 않은 roomId 값입니다: {}", roomId);
      throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
    }
  }
}
