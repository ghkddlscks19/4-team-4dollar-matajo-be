package org.ktb.matajo.service.chat;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.ktb.matajo.dto.chat.ChatMessagePageResponseDto;
import org.ktb.matajo.dto.chat.ChatMessageRequestDto;
import org.ktb.matajo.dto.chat.ChatMessageResponseDto;
import org.ktb.matajo.entity.*;
import org.ktb.matajo.global.error.code.ErrorCode;
import org.ktb.matajo.global.error.exception.BusinessException;
import org.ktb.matajo.repository.ChatMessageRepository;
import org.ktb.matajo.repository.ChatRoomRepository;
import org.ktb.matajo.repository.ChatUserRepository;
import org.ktb.matajo.repository.UserRepository;
import org.ktb.matajo.service.chat.ChatCacheService.UserCacheInfo;
import org.ktb.matajo.service.chat.BroadcastMessagingService;
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
  private final ChatUserRepository chatUserRepository;
  private final UserRepository userRepository;
  private final ChatCacheService chatCacheService;
  private final BroadcastMessagingService broadcastMessagingService;

  /** 채팅 메시지 저장 */
  @Override
  @Transactional
  public ChatMessageResponseDto saveMessage(Long roomId, ChatMessageRequestDto messageDto) {
    // 입력 유효성 검사
    validateMessageInput(roomId, messageDto);

    // 채팅방 존재 검증 (캐시 활용 - DB 조회 없음)
    chatCacheService.findChatRoom(roomId);

    // 발신자 조회 (캐시 활용 - 닉네임 등 DTO용 데이터)
    UserCacheInfo cachedSender = chatCacheService.findUser(messageDto.getSenderId());

    // JPA 참조로 메시지 생성 (DB SELECT 없이 INSERT만 실행)
    ChatRoom chatRoomRef = chatRoomRepository.getReferenceById(roomId);
    User senderRef = userRepository.getReferenceById(messageDto.getSenderId());
    ChatMessage chatMessage = createAndSaveChatMessage(chatRoomRef, senderRef, messageDto);

    // 응답 DTO 생성 (캐시된 발신자 정보 사용)
    return ChatMessageResponseDto.builder()
        .messageId(chatMessage.getId())
        .roomId(roomId)
        .senderId(cachedSender.id())
        .senderNickname(cachedSender.nickname())
        .content(chatMessage.getContent())
        .messageType(chatMessage.getMessageType())
        .createdAt(chatMessage.getCreatedAt())
        .sendTimestamp(messageDto.getSendTimestamp())
        .build();
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

  /** 채팅 메시지 생성 및 저장 */
  private ChatMessage createAndSaveChatMessage(
      ChatRoom chatRoom, User sender, ChatMessageRequestDto messageDto) {
    ChatMessage chatMessage =
        ChatMessage.builder()
            .chatRoom(chatRoom)
            .user(sender)
            .content(messageDto.getContent())
            .messageType(messageDto.getMessageType())
            .createdAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")))
            .build();

    return chatMessageRepository.save(chatMessage);
  }

  /** 채팅방의 메시지 목록 조회 (cursor 기반 페이징) */
  @Override
  public ChatMessagePageResponseDto getChatMessages(Long roomId, Long cursorId, int size) {
    validateRoomId(roomId);

    // size + 1개를 조회하여 다음 페이지 존재 여부 판단
    int fetchSize = size + 1;

    List<ChatMessage> messages;
    if (cursorId == null) {
      // 첫 페이지: 최신 메시지부터
      messages = chatMessageRepository.findLatestByRoomId(roomId, fetchSize);
    } else {
      // 이후 페이지: cursor 이전 메시지
      messages = chatMessageRepository.findByRoomIdWithCursor(roomId, cursorId, fetchSize);
    }

    boolean hasMore = messages.size() > size;
    if (hasMore) {
      messages = messages.subList(0, size);
    }

    // 역순으로 조회했으므로 시간순으로 다시 정렬
    Collections.reverse(messages);

    List<ChatMessageResponseDto> messageDtos =
        messages.stream().map(this::convertToChatMessageResponseDto).collect(Collectors.toList());

    // 다음 페이지 cursor: 조회된 메시지 중 가장 오래된 메시지 ID
    Long nextCursor = null;
    if (hasMore && !messages.isEmpty()) {
      nextCursor = messages.get(0).getId();
    }

    return ChatMessagePageResponseDto.builder()
        .messages(messageDtos)
        .nextCursor(nextCursor)
        .hasMore(hasMore)
        .build();
  }

  /** 메시지 읽음 상태 업데이트 (lastReadMessageId 방식) */
  @Override
  @Transactional
  public void markMessagesAsRead(Long roomId, Long userId) {
    validateRoomId(roomId);

    // 파라미터 검증
    if (userId == null || userId <= 0) {
      log.error("유효하지 않은 userId 값입니다: {}", userId);
      throw new BusinessException(ErrorCode.INVALID_USER_ID);
    }

    // 채팅방의 최신 메시지 ID 조회
    Long latestMessageId = chatMessageRepository.findMaxIdByRoomId(roomId).orElse(null);
    if (latestMessageId == null) {
      return; // 메시지가 없으면 처리할 것 없음
    }

    // ChatUser의 lastReadMessageId 갱신
    ChatUser chatUser =
        chatUserRepository
            .findByChatRoomIdAndUserId(roomId, userId)
            .orElse(null);

    if (chatUser == null) {
      return;
    }

    Long previousLastReadId = chatUser.getLastReadMessageId();
    chatUser.updateLastReadMessageId(latestMessageId);

    // 실제로 갱신된 경우에만 브로드캐스트
    if (latestMessageId > previousLastReadId) {
      Map<String, Object> readStatusUpdate = new HashMap<>();
      readStatusUpdate.put("type", "READ_STATUS_UPDATE");
      readStatusUpdate.put("roomId", roomId);
      readStatusUpdate.put("readBy", userId);
      readStatusUpdate.put("lastReadMessageId", latestMessageId);

      broadcastMessagingService.convertAndSend("/topic/chat/" + roomId + "/status", readStatusUpdate);
    }
  }

  /** ChatMessage 엔티티를 ChatMessageResponseDto로 변환 */
  private ChatMessageResponseDto convertToChatMessageResponseDto(ChatMessage message) {
    return ChatMessageResponseDto.builder()
        .messageId(message.getId())
        .roomId(message.getChatRoom().getId())
        .senderId(message.getUser().getId())
        .senderNickname(message.getUser().getNickname())
        .content(message.getContent())
        .messageType(message.getMessageType())
        .createdAt(message.getCreatedAt())
        .build();
  }

  private void validateRoomId(Long roomId) {
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
