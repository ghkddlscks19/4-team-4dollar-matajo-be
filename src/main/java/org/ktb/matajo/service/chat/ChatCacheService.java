package org.ktb.matajo.service.chat;

import org.ktb.matajo.entity.User;
import org.ktb.matajo.global.error.code.ErrorCode;
import org.ktb.matajo.global.error.exception.BusinessException;
import org.ktb.matajo.repository.ChatRoomRepository;
import org.ktb.matajo.repository.UserRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatCacheService {

  private final ChatRoomRepository chatRoomRepository;
  private final UserRepository userRepository;

  /** 채팅방 존재 여부 검증 (캐시 적용) */
  @Cacheable(value = "chatRoomCache", key = "#roomId")
  public boolean findChatRoom(Long roomId) {
    if (!chatRoomRepository.existsById(roomId)) {
      log.error("채팅방을 찾을 수 없습니다: {}", roomId);
      throw new BusinessException(ErrorCode.CHAT_ROOM_NOT_FOUND);
    }
    log.info("채팅방 캐시 MISS - DB 조회: roomId={}", roomId);
    return true;
  }

  /** 사용자 조회 (캐시 적용) - id, nickname 반환 */
  @Cacheable(value = "userCache", key = "#userId")
  public UserCacheInfo findUser(Long userId) {
    User user =
        userRepository
            .findById(userId)
            .orElseThrow(
                () -> {
                  log.error("사용자를 찾을 수 없습니다: {}", userId);
                  return new BusinessException(ErrorCode.USER_NOT_FOUND);
                });
    log.info("유저 캐시 MISS - DB 조회: userId={}", userId);
    return new UserCacheInfo(user.getId(), user.getNickname());
  }

  /** 사용자 캐시 무효화 (닉네임 변경 시 호출) */
  @CacheEvict(value = "userCache", key = "#userId")
  public void evictUser(Long userId) {
    log.info("유저 캐시 삭제: userId={}", userId);
  }

  /** 캐시에 저장할 사용자 정보 */
  public record UserCacheInfo(Long id, String nickname) {}
}
