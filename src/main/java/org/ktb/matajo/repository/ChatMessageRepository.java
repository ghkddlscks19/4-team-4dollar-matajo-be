package org.ktb.matajo.repository;

import java.util.List;
import java.util.Optional;

import org.ktb.matajo.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

  /** 채팅방의 메시지 목록 조회 (전체) */
  List<ChatMessage> findByChatRoomId(Long roomId);

  /** Cursor 기반 페이징: 특정 ID 이전 메시지 조회 (역순) */
  @Query(
      value = "SELECT * FROM chat_message "
          + "WHERE room_id = :roomId AND id < :cursorId "
          + "ORDER BY id DESC LIMIT :size",
      nativeQuery = true)
  List<ChatMessage> findByRoomIdWithCursor(
      @Param("roomId") Long roomId,
      @Param("cursorId") Long cursorId,
      @Param("size") int size);

  /** Cursor 기반 페이징: 최신 메시지 조회 (첫 페이지) */
  @Query(
      value = "SELECT * FROM chat_message "
          + "WHERE room_id = :roomId "
          + "ORDER BY id DESC LIMIT :size",
      nativeQuery = true)
  List<ChatMessage> findLatestByRoomId(
      @Param("roomId") Long roomId,
      @Param("size") int size);

  /** 채팅방의 가장 최신 메시지 ID 조회 */
  @Query("SELECT MAX(m.id) FROM ChatMessage m WHERE m.chatRoom.id = :roomId")
  Optional<Long> findMaxIdByRoomId(@Param("roomId") Long roomId);

  /** lastReadMessageId 기반 안 읽은 메시지 수 조회 (자신이 보낸 메시지 제외) */
  @Query(
      "SELECT COUNT(m) FROM ChatMessage m "
          + "WHERE m.chatRoom.id = :roomId "
          + "AND m.user.id != :userId "
          + "AND m.id > :lastReadMessageId")
  long countUnreadByLastReadId(
      @Param("roomId") Long roomId,
      @Param("userId") Long userId,
      @Param("lastReadMessageId") Long lastReadMessageId);

}
