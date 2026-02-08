package org.ktb.matajo.repository;

import java.util.List;
import java.util.Optional;

import org.ktb.matajo.entity.Tag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TagRepository extends JpaRepository<Tag, Long> {
  // 태그 이름으로 태그 찾기
  Optional<Tag> findByTagName(String tagName);

  // 태그 이름 목록으로 태그 정보 조회
  List<Tag> findByTagNameIn(List<String> tagNames);
}
