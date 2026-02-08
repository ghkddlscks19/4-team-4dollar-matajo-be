package org.ktb.matajo.repository;

import java.util.List;

import org.ktb.matajo.entity.Storage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StorageRepository extends JpaRepository<Storage, Long> {
  List<Storage> findByLocationInfoId(Long locationInfoId);
}
