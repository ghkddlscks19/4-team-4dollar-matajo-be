package org.ktb.matajo.service.chat;

import java.util.List;

import org.ktb.matajo.dto.chat.ChatMessagePageResponseDto;
import org.ktb.matajo.dto.chat.ChatMessageRequestDto;
import org.ktb.matajo.dto.chat.ChatMessageResponseDto;

public interface ChatMessageService {
  /**
   * 채팅 메시지 저장
   *
   * @param roomId 채팅방 ID
   * @param messageDto 메시지 정보
   * @return 저장된 메시지 응답 DTO
   */
  ChatMessageResponseDto saveMessage(Long roomId, ChatMessageRequestDto messageDto);

  /**
   * 채팅방의 메시지 목록 조회 (cursor 기반 페이징)
   *
   * @param roomId 채팅방 ID
   * @param cursorId 마지막으로 받은 메시지 ID (null이면 최신부터)
   * @param size 조회 개수
   * @return 페이징된 메시지 목록
   */
  ChatMessagePageResponseDto getChatMessages(Long roomId, Long cursorId, int size);

  /**
   * 메시지 읽음 상태 업데이트
   *
   * @param roomId 채팅방 ID
   * @param userId 사용자 ID
   */
  void markMessagesAsRead(Long roomId, Long userId);
}
