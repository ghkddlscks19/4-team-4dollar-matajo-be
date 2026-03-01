package org.ktb.matajo.dto.chat;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Schema(description = "채팅 메시지 페이징 응답 DTO")
public class ChatMessagePageResponseDto {
  @Schema(description = "메시지 목록")
  private List<ChatMessageResponseDto> messages;

  @Schema(description = "다음 페이지 cursor (마지막 메시지 ID)", example = "150")
  private Long nextCursor;

  @Schema(description = "다음 페이지 존재 여부", example = "true")
  private boolean hasMore;
}
