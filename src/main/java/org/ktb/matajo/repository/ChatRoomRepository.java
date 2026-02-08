package org.ktb.matajo.repository;

import java.util.Optional;

import org.ktb.matajo.entity.ChatRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {
  // 게시글 ID, 사용자 ID 기준으로 기존 채팅방 조회 - activeStatus 상관없이
  Optional<ChatRoom> findByPostIdAndUserId(Long postId, Long userId);

  // 알림 전송용: ChatRoom + 의뢰인(user) + Post + 보관인(post.user)을 한 번에 조회
  @Query(
      "SELECT cr FROM ChatRoom cr "
          + "JOIN FETCH cr.user "
          + "JOIN FETCH cr.post p "
          + "JOIN FETCH p.user "
          + "WHERE cr.id = :roomId")
  Optional<ChatRoom> findByIdWithUsers(@Param("roomId") Long roomId);
}
