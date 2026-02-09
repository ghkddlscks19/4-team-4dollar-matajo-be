package org.ktb.matajo.repository;

import java.util.List;

import org.ktb.matajo.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

  /** 채팅방의 메시지 목록 조회 (페이지네이션 적용) */
  List<ChatMessage> findByChatRoomId(Long roomId);

  /** 읽지 않은 메시지를 벌크 update로 읽음 */
  @Modifying
  @Query(
      "UPDATE ChatMessage m SET m.readStatus = true "
          + "WHERE m.chatRoom.id = :roomId "
          + "AND m.user.id != :userId "
          + "AND m.readStatus = false "
  )
  int bulkMarkAsRead (@Param("roomId") Long roomId, @Param("userId") Long userId);

  /** 채팅방의 읽지 않은 메시지 수 조회 */
  @Query(
      "SELECT COUNT(m) FROM ChatMessage m "
          + "WHERE m.chatRoom.id = :roomId "
          + "AND m.user.id != :userId "
          + "AND m.readStatus = false")
  long countUnreadMessages(@Param("roomId") Long roomId, @Param("userId") Long userId);
}
