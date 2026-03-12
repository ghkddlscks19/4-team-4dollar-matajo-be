package org.ktb.matajo.service.storage;

import java.util.List;

import org.ktb.matajo.dto.storage.StorageResponseDto;

public interface StorageService {
  List<StorageResponseDto> getStoragesByLocation(Long locationInfoId);
}
