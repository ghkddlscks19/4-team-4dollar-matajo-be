package org.ktb.matajo.dto.chat;

import java.time.LocalDateTime;

import org.ktb.matajo.entity.MessageType;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Schema(description = "채팅 메시지 응답 DTO")
public class ChatMessageResponseDto {
  @Schema(description = "메시지 고유 ID", example = "1")
  private Long messageId;

  @Schema(description = "채팅방 ID", example = "1")
  private Long roomId;

  @Schema(description = "발신자 ID", example = "2")
  private Long senderId;

  @Schema(description = "메시지 내용", example = "안녕하세요!")
  private String content;

  @Schema(description = "메시지 타입 (TEXT, IMAGE, SYSTEM)", example = "TEXT")
  private MessageType messageType;

  @Schema(description = "생성 시간", example = "2023-09-15T14:30:45")
  private LocalDateTime createdAt;

  @Schema(description = "발신자 닉네임", example = "사용자1")
  private String senderNickname;

  @Schema(description = "클라이언트 전송 타임스탬프 (레이턴시 측정용)", example = "1704672000000")
  private Long sendTimestamp;
}
