package org.ktb.matajo.entity;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.ktb.matajo.util.MessageTypeConverter;

import jakarta.persistence.*;
import lombok.*;

@Entity
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@Getter
@Table(
    indexes = {
      @Index(name = "idx_chat_message_room_id", columnList = "room_id"),
      @Index(name = "idx_chat_message_sender_id", columnList = "sender_id")
    })
public class ChatMessage {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(nullable = false)
  private Long id;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String content;

  @Convert(converter = MessageTypeConverter.class)
  @Column(nullable = false)
  private MessageType messageType;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(
      name = "room_id",
      foreignKey = @ForeignKey(ConstraintMode.NO_CONSTRAINT),
      nullable = false)
  private ChatRoom chatRoom;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(
      name = "sender_id",
      foreignKey = @ForeignKey(ConstraintMode.NO_CONSTRAINT),
      nullable = false)
  private User user;

  @CreationTimestamp
  @Column(nullable = false, updatable = false)
  private LocalDateTime createdAt;

}
