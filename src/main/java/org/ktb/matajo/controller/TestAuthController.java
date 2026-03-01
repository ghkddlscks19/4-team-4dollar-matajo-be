package org.ktb.matajo.controller;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.ktb.matajo.entity.*;
import org.ktb.matajo.repository.*;
import org.ktb.matajo.security.JwtUtil;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** 부하 테스트용 인증 컨트롤러 Docker 프로파일에서만 활성화됩니다. */
@Slf4j
@RestController
@RequestMapping("/api/test")
@Profile("docker")
@RequiredArgsConstructor
public class TestAuthController {

  private final JwtUtil jwtUtil;
  private final UserRepository userRepository;
  private final LocationInfoRepository locationInfoRepository;
  private final AddressRepository addressRepository;
  private final PostRepository postRepository;
  private final ChatRoomRepository chatRoomRepository;
  private final ChatUserRepository chatUserRepository;
  private final ChatMessageRepository chatMessageRepository;

  /**
   * 테스트용 JWT 토큰 생성
   *
   * @param userId 사용자 ID
   * @return 액세스 토큰
   */
  @GetMapping("/token/{userId}")
  public ResponseEntity<Map<String, String>> generateTestToken(@PathVariable Long userId) {
    String accessToken = jwtUtil.createAccessToken(userId, "USER", "TestUser" + userId, null);

    Map<String, String> response = new HashMap<>();
    response.put("accessToken", accessToken);
    response.put("userId", userId.toString());

    return ResponseEntity.ok(response);
  }

  /**
   * 여러 사용자의 토큰을 한 번에 생성
   *
   * @param count 생성할 토큰 수
   * @return 토큰 목록
   */
  @GetMapping("/tokens")
  public ResponseEntity<Map<String, Object>> generateMultipleTokens(
      @RequestParam(defaultValue = "100") int count) {

    Map<String, String> tokens = new HashMap<>();
    for (int i = 1; i <= count; i++) {
      String token = jwtUtil.createAccessToken((long) i, "USER", "TestUser" + i, null);
      tokens.put(String.valueOf(i), token);
    }

    Map<String, Object> response = new HashMap<>();
    response.put("count", count);
    response.put("tokens", tokens);

    return ResponseEntity.ok(response);
  }

  /**
   * 부하 테스트용 데이터 생성 (채팅방 미리 생성) - 1000 Users, 100 Keepers, 100 Posts, 1000 ChatRooms - 각 User당 1개의
   * 채팅방 (10명의 User가 같은 Keeper/Post와 채팅)
   *
   * @param keeperCount 생성할 Keeper 수 (기본 100)
   * @param userCount 생성할 User 수 (기본 1000)
   * @param postCount 생성할 게시글 수 (기본 100)
   */
  @PostMapping("/setup")
  @Transactional
  public ResponseEntity<Map<String, Object>> setupTestData(
      @RequestParam(defaultValue = "100") int keeperCount,
      @RequestParam(defaultValue = "1000") int userCount,
      @RequestParam(defaultValue = "100") int postCount) {

    log.info("테스트 데이터 생성 시작: keepers={}, users={}, posts={}", keeperCount, userCount, postCount);
    long startTime = System.currentTimeMillis();

    // 1. 테스트용 LocationInfo 생성
    LocationInfo locationInfo =
        locationInfoRepository.save(
            LocationInfo.builder()
                .originalName("테스트동")
                .formattedAddress("서울특별시 강남구 테스트동")
                .latitude(new BigDecimal("37.5665"))
                .longitude(new BigDecimal("126.9780"))
                .displayName("테스트 위치")
                .clazz("place")
                .type("suburb")
                .cityDistrict("강남구")
                .build());
    log.info("LocationInfo 생성 완료: id={}", locationInfo.getId());

    // 2. Keeper 사용자 생성
    List<User> keepers = new ArrayList<>();
    for (int i = 1; i <= keeperCount; i++) {
      User keeper =
          User.builder()
              .kakaoId(2000000L + i)
              .nickname("Keeper" + i)
              .role(UserType.KEEPER)
              .keeperAgreement(true)
              .build();
      keepers.add(keeper);
    }
    userRepository.saveAll(keepers);
    log.info("Keeper {} 명 생성 완료", keepers.size());

    // 3. 일반 User 생성
    List<User> users = new ArrayList<>();
    for (int i = 1; i <= userCount; i++) {
      User user =
          User.builder()
              .kakaoId(3000000L + i)
              .nickname("User" + i)
              .role(UserType.USER)
              .keeperAgreement(false)
              .build();
      users.add(user);
    }
    userRepository.saveAll(users);
    log.info("User {} 명 생성 완료", users.size());

    // 4. Keeper가 Post(보관소 게시글) 생성
    List<Post> postList = new ArrayList<>();
    for (int i = 0; i < postCount; i++) {
      User keeper = keepers.get(i % keeperCount);

      // Address 생성
      Address address =
          addressRepository.save(
              Address.builder()
                  .zonecode("0600" + (i % 10))
                  .address("서울특별시 강남구 테스트로 " + (i + 1))
                  .addressType("R")
                  .sido("서울특별시")
                  .sigungu("강남구")
                  .bname("테스트동")
                  .roadAddress("서울특별시 강남구 테스트로 " + (i + 1))
                  .locationInfo(locationInfo)
                  .build());

      // Post 생성
      Post post =
          postRepository.save(
              Post.builder()
                  .user(keeper)
                  .title("테스트 보관소 " + (i + 1))
                  .content("부하 테스트용 보관소입니다.")
                  .preferPrice(10000 + (i * 100))
                  .discountRate(0.1f)
                  .hiddenStatus(false)
                  .address(address)
                  .build());

      postList.add(post);
    }
    log.info("Post {} 개 생성 완료", postList.size());

    // 5. 각 User에 대해 ChatRoom 미리 생성 (10명의 User가 같은 Post/Keeper와 채팅)
    List<Map<String, Object>> chatRooms = new ArrayList<>();
    int usersPerPost = userCount / postCount; // 1000 / 100 = 10

    for (int i = 0; i < userCount; i++) {
      User user = users.get(i);
      int postIndex = i / usersPerPost; // 0-9 → Post 0, 10-19 → Post 1, ...
      if (postIndex >= postList.size()) {
        postIndex = postList.size() - 1;
      }
      Post post = postList.get(postIndex);
      User keeper = post.getUser();

      // ChatRoom 생성 (User가 의뢰인)
      ChatRoom chatRoom = chatRoomRepository.save(ChatRoom.builder().user(user).post(post).build());

      // ChatUser 생성 (의뢰인)
      chatUserRepository.save(
          ChatUser.builder().chatRoom(chatRoom).user(user).activeStatus(true).build());

      // ChatUser 생성 (보관인)
      chatUserRepository.save(
          ChatUser.builder().chatRoom(chatRoom).user(keeper).activeStatus(true).build());

      Map<String, Object> roomInfo = new HashMap<>();
      roomInfo.put("room_id", chatRoom.getId());
      roomInfo.put("user_id", user.getId());
      roomInfo.put("keeper_id", keeper.getId());
      roomInfo.put("post_id", post.getId());
      chatRooms.add(roomInfo);
    }
    log.info("ChatRoom {} 개 생성 완료", chatRooms.size());

    long elapsed = System.currentTimeMillis() - startTime;
    log.info("테스트 데이터 생성 완료: {}ms", elapsed);

    // Keeper 토큰 생성
    Map<String, String> keeperTokens = new HashMap<>();
    for (User keeper : keepers) {
      String token =
          jwtUtil.createAccessToken(
              keeper.getId(), keeper.getRole().name(), keeper.getNickname(), null);
      keeperTokens.put(String.valueOf(keeper.getId()), token);
    }

    // User 토큰 생성
    Map<String, String> userTokens = new HashMap<>();
    for (User user : users) {
      String token =
          jwtUtil.createAccessToken(user.getId(), user.getRole().name(), user.getNickname(), null);
      userTokens.put(String.valueOf(user.getId()), token);
    }

    Map<String, Object> response = new HashMap<>();
    response.put("keepers_created", keeperCount);
    response.put("users_created", userCount);
    response.put("posts_created", postCount);
    response.put("chat_rooms_created", chatRooms.size());
    response.put("chat_rooms", chatRooms); // [{room_id, user_id, keeper_id, post_id}, ...]
    response.put("keeper_tokens", keeperTokens);
    response.put("user_tokens", userTokens);
    response.put("elapsed_ms", elapsed);

    return ResponseEntity.ok(response);
  }

  /**
   * 특정 채팅방에 대량 메시지 생성 (페이징 성능 테스트용)
   *
   * @param roomId 채팅방 ID
   * @param count 생성할 메시지 수 (기본 100000)
   * @param batchSize 배치 크기 (기본 1000)
   */
  @PostMapping("/messages/bulk")
  @Transactional
  public ResponseEntity<Map<String, Object>> createBulkMessages(
      @RequestParam Long roomId,
      @RequestParam(defaultValue = "100000") int count,
      @RequestParam(defaultValue = "1000") int batchSize) {

    log.info("대량 메시지 생성 시작: roomId={}, count={}", roomId, count);
    long startTime = System.currentTimeMillis();

    ChatRoom chatRoom =
        chatRoomRepository
            .findById(roomId)
            .orElseThrow(() -> new RuntimeException("채팅방이 존재하지 않습니다: " + roomId));

    // 채팅방 참여자 조회
    List<ChatUser> chatUsers = chatUserRepository.findByUserIdAndActiveStatusIsTrue(
        chatRoom.getUser().getId());

    // 채팅방에 속한 사용자 2명 (의뢰인 + 보관인)
    User sender1 = chatRoom.getUser();
    User sender2 = chatRoom.getPost().getUser();

    LocalDateTime baseTime = LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusDays(30);

    List<ChatMessage> batch = new ArrayList<>(batchSize);
    for (int i = 0; i < count; i++) {
      User sender = (i % 2 == 0) ? sender1 : sender2;
      ChatMessage message =
          ChatMessage.builder()
              .chatRoom(chatRoom)
              .user(sender)
              .content("테스트 메시지 #" + (i + 1) + " - 성능 테스트용 메시지입니다.")
              .messageType(MessageType.TEXT)
              .createdAt(baseTime.plusSeconds(i))
              .build();
      batch.add(message);

      if (batch.size() >= batchSize) {
        chatMessageRepository.saveAll(batch);
        batch.clear();
        if ((i + 1) % 10000 == 0) {
          log.info("메시지 생성 진행: {}/{}", i + 1, count);
        }
      }
    }
    if (!batch.isEmpty()) {
      chatMessageRepository.saveAll(batch);
    }

    long elapsed = System.currentTimeMillis() - startTime;
    log.info("대량 메시지 생성 완료: {}건, {}ms", count, elapsed);

    Map<String, Object> response = new HashMap<>();
    response.put("room_id", roomId);
    response.put("messages_created", count);
    response.put("elapsed_ms", elapsed);

    return ResponseEntity.ok(response);
  }

  /** 테스트 데이터 삭제 */
  @DeleteMapping("/cleanup")
  @Transactional
  public ResponseEntity<Map<String, Object>> cleanupTestData() {
    log.info("테스트 데이터 삭제 시작");

    // 역순으로 삭제 (FK 제약 고려)
    long chatUserCount = chatUserRepository.count();
    chatUserRepository.deleteAll();

    long chatRoomCount = chatRoomRepository.count();
    chatRoomRepository.deleteAll();

    long postCount = postRepository.count();
    postRepository.deleteAll();

    long addressCount = addressRepository.count();
    addressRepository.deleteAll();

    long userCount = userRepository.count();
    userRepository.deleteAll();

    long locationCount = locationInfoRepository.count();
    locationInfoRepository.deleteAll();

    log.info("테스트 데이터 삭제 완료");

    Map<String, Object> response = new HashMap<>();
    response.put("deleted_chat_users", chatUserCount);
    response.put("deleted_chat_rooms", chatRoomCount);
    response.put("deleted_posts", postCount);
    response.put("deleted_addresses", addressCount);
    response.put("deleted_users", userCount);
    response.put("deleted_locations", locationCount);

    return ResponseEntity.ok(response);
  }
}
