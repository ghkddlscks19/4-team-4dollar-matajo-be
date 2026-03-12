package org.ktb.matajo.dto.chat;

import java.io.Serializable;

import lombok.*;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BridgeMessage implements Serializable {
  private String originInstanceId;
  private String destination;
  private String payloadJson;
  private String targetUser; // convertAndSendToUser용 (null이면 일반 broadcast)
}
