package org.ktb.matajo.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class RedisConfig {

  private final ObjectMapper objectMapper;

  public RedisConfig(ObjectMapper objectMapper) {
    // 🔥 기존 ObjectMapper 복사 후 ESCAPE_NON_ASCII 비활성화
    this.objectMapper = objectMapper;
  }

  @Bean
  public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    template.setConnectionFactory(connectionFactory);

    // JacksonConfig에서 설정된 objectMapper를 사용하여 Jackson2JsonRedisSerializer 생성
    Jackson2JsonRedisSerializer<Object> jackson2JsonRedisSerializer =
        new Jackson2JsonRedisSerializer<>(objectMapper, Object.class);

    // 문자열 키 / Jackson JSON 값 설정
    template.setKeySerializer(new StringRedisSerializer());
    template.setValueSerializer(jackson2JsonRedisSerializer);
    template.setHashKeySerializer(new StringRedisSerializer());
    template.setHashValueSerializer(jackson2JsonRedisSerializer);

    // 기본 직렬화 도구 설정 (명시적으로 설정하지 않은 작업에 사용됨)
    template.setDefaultSerializer(jackson2JsonRedisSerializer);

    // 모든 설정을 템플릿에 적용
    template.afterPropertiesSet();

    return template;
  }

  @Bean
  public RedisMessageListenerContainer redisMessageListenerContainer(
      RedisConnectionFactory connectionFactory) {
    RedisMessageListenerContainer container = new RedisMessageListenerContainer();
    container.setConnectionFactory(connectionFactory);
    return container;
  }

  /** Redis Pub/Sub 브로커 모드일 때 ws:broadcast 채널 리스너 등록 */
  @Bean
  @ConditionalOnProperty(name = "broker.type", havingValue = "redis", matchIfMissing = true)
  public ChannelTopic wsBroadcastTopic(
      RedisMessageListenerContainer container, RedisMessageBridge bridge) {
    ChannelTopic topic = new ChannelTopic(RedisMessageBridge.CHANNEL);
    container.addMessageListener(bridge, topic);
    return topic;
  }
}
