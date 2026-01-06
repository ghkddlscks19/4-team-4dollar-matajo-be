-- Matajo 테스트용 초기 데이터
-- JPA 엔티티 기반 테이블 구조

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 1. location_info 테이블
CREATE TABLE IF NOT EXISTS location_info (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    original_name VARCHAR(10),
    formatted_address VARCHAR(255),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    display_name TEXT,
    class VARCHAR(20),
    type VARCHAR(20),
    city_district VARCHAR(50),
    INDEX idx_location_original_name (original_name),
    INDEX idx_location_city_district (city_district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. users 테이블
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kakao_id BIGINT NOT NULL,
    username VARCHAR(255),
    phone_number VARCHAR(255),
    nickname VARCHAR(255) NOT NULL,
    role TINYINT NOT NULL,
    keeper_agreement TINYINT(1) NOT NULL DEFAULT 0,
    deleted_at DATETIME,
    fcm_token VARCHAR(512),
    created_at DATETIME,
    updated_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. address 테이블
CREATE TABLE IF NOT EXISTS address (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    postcode VARCHAR(10),
    postcode1 VARCHAR(10),
    postcode2 VARCHAR(10),
    postcode_seq VARCHAR(10),
    zonecode VARCHAR(10),
    address VARCHAR(200),
    address_english VARCHAR(200),
    address_type VARCHAR(10),
    bcode VARCHAR(20),
    bname VARCHAR(100),
    bname_english VARCHAR(100),
    bname1 VARCHAR(100),
    bname1_english VARCHAR(100),
    bname2 VARCHAR(100),
    bname2_english VARCHAR(100),
    sido VARCHAR(50),
    sido_english VARCHAR(50),
    sigungu VARCHAR(50),
    sigungu_english VARCHAR(50),
    sigungu_code VARCHAR(20),
    user_language_type VARCHAR(10),
    query VARCHAR(100),
    building_name VARCHAR(100),
    building_code VARCHAR(50),
    apartment VARCHAR(5),
    jibun_address VARCHAR(200),
    jibun_address_english VARCHAR(200),
    road_address VARCHAR(200),
    road_address_english VARCHAR(200),
    auto_road_address VARCHAR(200),
    auto_road_address_english VARCHAR(200),
    auto_jibun_address VARCHAR(200),
    auto_jibun_address_english VARCHAR(200),
    user_selected_type VARCHAR(10),
    no_selected VARCHAR(5),
    hname VARCHAR(100),
    roadname_code VARCHAR(20),
    roadname VARCHAR(50),
    roadname_english VARCHAR(50),
    location_info_id BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. tag 테이블
CREATE TABLE IF NOT EXISTS tag (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tag_name VARCHAR(20) NOT NULL UNIQUE,
    tag_category_id BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. post 테이블
CREATE TABLE IF NOT EXISTS post (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    keeper_id BIGINT NOT NULL,
    title VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    prefer_price INT NOT NULL,
    hidden_status TINYINT(1) NOT NULL DEFAULT 0,
    discount_rate FLOAT NOT NULL DEFAULT 0,
    address_id BIGINT NOT NULL,
    deleted_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_post_address_id (address_id),
    INDEX idx_post_keeper_id (keeper_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. image 테이블
CREATE TABLE IF NOT EXISTS image (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    image_url VARCHAR(255) NOT NULL,
    thumbnail_status TINYINT(1) NOT NULL DEFAULT 0,
    post_id BIGINT NOT NULL,
    INDEX idx_image_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. post_tag 테이블
CREATE TABLE IF NOT EXISTS post_tag (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    INDEX idx_post_tag_post_id (post_id),
    INDEX idx_post_tag_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. chat_room 테이블
CREATE TABLE IF NOT EXISTS chat_room (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_chat_room_user_id (user_id),
    INDEX idx_chat_room_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. chat_user 테이블
CREATE TABLE IF NOT EXISTS chat_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    active_status TINYINT(1) NOT NULL DEFAULT 1,
    joined_at DATETIME NOT NULL,
    left_at DATETIME,
    INDEX idx_chat_user_room_id (room_id),
    INDEX idx_chat_user_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. chat_message 테이블
CREATE TABLE IF NOT EXISTS chat_message (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    content TEXT NOT NULL,
    message_type TINYINT NOT NULL DEFAULT 1,
    read_status TINYINT(1) NOT NULL DEFAULT 0,
    room_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_chat_message_room_id (room_id),
    INDEX idx_chat_message_sender_id (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. trade_info 테이블
CREATE TABLE IF NOT EXISTS trade_info (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL,
    trade_date DATETIME NOT NULL,
    start_date DATE NOT NULL,
    storage_period INT NOT NULL,
    trade_price INT NOT NULL,
    room_id BIGINT NOT NULL,
    INDEX idx_trade_info_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. refresh_token 테이블
CREATE TABLE IF NOT EXISTS refresh_token (
    user_id BIGINT PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME,
    updated_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. storage 테이블
CREATE TABLE IF NOT EXISTS storage (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    address TEXT,
    x DOUBLE,
    y DOUBLE,
    category VARCHAR(255),
    keyword VARCHAR(255),
    region VARCHAR(100),
    phone VARCHAR(50),
    place_id BIGINT,
    kakao_map_link TEXT,
    zonecode INT,
    bname2 VARCHAR(100),
    sigungu VARCHAR(100),
    sido VARCHAR(100),
    location_info_id BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 테스트 데이터 삽입
-- =====================================================

-- location_info 테스트 데이터
INSERT INTO location_info (original_name, formatted_address, latitude, longitude, display_name, city_district) VALUES
('역삼동', '서울특별시 강남구 역삼동', 37.500000, 127.036000, '역삼동', '강남구'),
('서교동', '서울특별시 마포구 서교동', 37.556300, 126.922000, '서교동', '마포구'),
('창천동', '서울특별시 서대문구 창천동', 37.559600, 126.942900, '창천동', '서대문구'),
('잠실동', '서울특별시 송파구 잠실동', 37.513200, 127.100100, '잠실동', '송파구'),
('화양동', '서울특별시 광진구 화양동', 37.540400, 127.069500, '화양동', '광진구');

-- users 테스트 데이터 (부하 테스트용 100명)
INSERT INTO users (kakao_id, username, nickname, role, keeper_agreement, created_at, updated_at) VALUES
(1001, 'user1', 'testuser1', 2, 1, NOW(), NOW()),
(1002, 'user2', 'testuser2', 2, 1, NOW(), NOW()),
(1003, 'user3', 'testuser3', 2, 1, NOW(), NOW()),
(1004, 'user4', 'testuser4', 2, 1, NOW(), NOW()),
(1005, 'user5', 'testuser5', 2, 1, NOW(), NOW()),
(1006, 'user6', 'testuser6', 1, 0, NOW(), NOW()),
(1007, 'user7', 'testuser7', 1, 0, NOW(), NOW()),
(1008, 'user8', 'testuser8', 1, 0, NOW(), NOW()),
(1009, 'user9', 'testuser9', 1, 0, NOW(), NOW()),
(1010, 'user10', 'testuser10', 1, 0, NOW(), NOW());

-- 추가 사용자 (11~100번)
INSERT INTO users (kakao_id, username, nickname, role, keeper_agreement, created_at, updated_at)
SELECT
    1000 + nums.n,
    CONCAT('user', nums.n),
    CONCAT('testuser', nums.n),
    IF(nums.n <= 20, 2, 1),
    IF(nums.n <= 20, 1, 0),
    NOW(),
    NOW()
FROM (
    SELECT (a.N + b.N * 10 + 11) as n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8) b
    WHERE (a.N + b.N * 10 + 11) <= 100
) nums;

-- address 테스트 데이터
INSERT INTO address (zonecode, address, sido, sigungu, bname, bname2, road_address, location_info_id) VALUES
('06241', '서울특별시 강남구 역삼동', '서울특별시', '강남구', '역삼동', '역삼동', '서울특별시 강남구 테헤란로', 1),
('04038', '서울특별시 마포구 서교동', '서울특별시', '마포구', '서교동', '서교동', '서울특별시 마포구 양화로', 2),
('03738', '서울특별시 서대문구 창천동', '서울특별시', '서대문구', '창천동', '창천동', '서울특별시 서대문구 연세로', 3),
('05510', '서울특별시 송파구 잠실동', '서울특별시', '송파구', '잠실동', '잠실동', '서울특별시 송파구 올림픽로', 4),
('05006', '서울특별시 광진구 화양동', '서울특별시', '광진구', '화양동', '화양동', '서울특별시 광진구 능동로', 5);

-- 추가 주소 (6~50번)
INSERT INTO address (zonecode, address, sido, sigungu, bname, bname2, road_address, location_info_id)
SELECT
    CONCAT('0', 5000 + nums.n),
    CONCAT('서울특별시 테스트구 테스트동', nums.n),
    '서울특별시',
    '테스트구',
    CONCAT('테스트동', nums.n),
    CONCAT('테스트동', nums.n),
    CONCAT('서울특별시 테스트구 테스트로', nums.n),
    (nums.n % 5) + 1
FROM (
    SELECT (a.N + b.N * 10 + 6) as n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) b
    WHERE (a.N + b.N * 10 + 6) <= 50
) nums;

-- tag 테스트 데이터
INSERT INTO tag (tag_name, tag_category_id) VALUES
('캐리어', 1),
('박스', 1),
('의류', 1),
('전자기기', 1),
('스포츠용품', 1),
('냉장보관', 2),
('실온보관', 2),
('대형물품', 2),
('소형물품', 2),
('장기보관', 2);

-- post 테스트 데이터
INSERT INTO post (keeper_id, title, content, prefer_price, hidden_status, discount_rate, address_id, created_at, updated_at) VALUES
(1, '강남역 근처 보관 가능', '안전하게 보관해드립니다. 24시간 CCTV 운영중입니다.', 30000, 0, 0, 1, NOW(), NOW()),
(2, '홍대 물품 보관', '24시간 보관 가능합니다. 깨끗하고 안전합니다.', 25000, 0, 0, 2, NOW(), NOW()),
(3, '신촌 보관소', '깨끗하고 안전한 보관소입니다. 역에서 도보 5분.', 20000, 0, 0, 3, NOW(), NOW()),
(4, '잠실 역세권 보관', '잠실역 도보 5분거리입니다. 대형물품 보관 가능.', 35000, 0, 0, 4, NOW(), NOW()),
(5, '건대입구 보관소', '건대입구역 바로 앞입니다. 소형물품 전문.', 28000, 0, 0, 5, NOW(), NOW());

-- 추가 게시글 (6~50개)
INSERT INTO post (keeper_id, title, content, prefer_price, hidden_status, discount_rate, address_id, created_at, updated_at)
SELECT
    (nums.n % 20) + 1,
    CONCAT('테스트 보관소 ', nums.n),
    CONCAT('테스트용 보관소 설명입니다. 안전하고 깨끗한 보관 서비스를 제공합니다. 번호: ', nums.n),
    20000 + (nums.n * 500),
    0,
    0,
    (nums.n % 50) + 1,
    NOW(),
    NOW()
FROM (
    SELECT (a.N + b.N * 10 + 6) as n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) b
    WHERE (a.N + b.N * 10 + 6) <= 50
) nums;

-- image 테스트 데이터
INSERT INTO image (image_url, thumbnail_status, post_id) VALUES
('https://matajo-image.s3.amazonaws.com/post/main/test1.jpg', 1, 1),
('https://matajo-image.s3.amazonaws.com/post/sub/test1-2.jpg', 0, 1),
('https://matajo-image.s3.amazonaws.com/post/main/test2.jpg', 1, 2),
('https://matajo-image.s3.amazonaws.com/post/main/test3.jpg', 1, 3),
('https://matajo-image.s3.amazonaws.com/post/main/test4.jpg', 1, 4),
('https://matajo-image.s3.amazonaws.com/post/main/test5.jpg', 1, 5);

-- post_tag 테스트 데이터
INSERT INTO post_tag (post_id, tag_id) VALUES
(1, 1), (1, 7),
(2, 2), (2, 7),
(3, 3), (3, 9),
(4, 4), (4, 8),
(5, 5), (5, 9);

-- chat_room 테스트 데이터
INSERT INTO chat_room (user_id, post_id, created_at, updated_at) VALUES
(6, 1, NOW(), NOW()),   -- user6(의뢰인)이 user1의 게시글1에 대해 채팅
(7, 1, NOW(), NOW()),   -- user7이 user1의 게시글1에 대해 채팅
(8, 2, NOW(), NOW()),   -- user8이 user2의 게시글2에 대해 채팅
(9, 3, NOW(), NOW()),   -- user9가 user3의 게시글3에 대해 채팅
(10, 4, NOW(), NOW()),  -- user10이 user4의 게시글4에 대해 채팅
(11, 5, NOW(), NOW()),
(12, 1, NOW(), NOW()),
(13, 2, NOW(), NOW()),
(14, 3, NOW(), NOW()),
(15, 4, NOW(), NOW());

-- chat_user 테스트 데이터 (채팅방당 2명: 의뢰인 + 보관인)
INSERT INTO chat_user (room_id, user_id, active_status, joined_at) VALUES
(1, 6, 1, NOW()), (1, 1, 1, NOW()),   -- 채팅방1: user6(의뢰인), user1(보관인)
(2, 7, 1, NOW()), (2, 1, 1, NOW()),   -- 채팅방2: user7(의뢰인), user1(보관인)
(3, 8, 1, NOW()), (3, 2, 1, NOW()),   -- 채팅방3: user8(의뢰인), user2(보관인)
(4, 9, 1, NOW()), (4, 3, 1, NOW()),   -- 채팅방4: user9(의뢰인), user3(보관인)
(5, 10, 1, NOW()), (5, 4, 1, NOW()),  -- 채팅방5: user10(의뢰인), user4(보관인)
(6, 11, 1, NOW()), (6, 5, 1, NOW()),
(7, 12, 1, NOW()), (7, 1, 1, NOW()),
(8, 13, 1, NOW()), (8, 2, 1, NOW()),
(9, 14, 1, NOW()), (9, 3, 1, NOW()),
(10, 15, 1, NOW()), (10, 4, 1, NOW());

-- chat_message 테스트 데이터
INSERT INTO chat_message (room_id, sender_id, content, message_type, read_status, created_at) VALUES
(1, 6, '안녕하세요! 보관 문의드립니다.', 1, 1, NOW()),
(1, 1, '네, 안녕하세요! 어떤 물건을 보관하실 건가요?', 1, 1, NOW()),
(1, 6, '캐리어 하나 보관하려고 합니다.', 1, 0, NOW()),
(2, 7, '보관 가능한가요?', 1, 1, NOW()),
(2, 1, '네, 가능합니다!', 1, 0, NOW()),
(3, 8, '가격 협의 가능할까요?', 1, 1, NOW()),
(3, 2, '어느 정도 생각하시나요?', 1, 0, NOW()),
(4, 9, '언제부터 보관 가능한가요?', 1, 0, NOW()),
(5, 10, '보관소 위치가 어디인가요?', 1, 1, NOW()),
(5, 4, '잠실역 8번출구 바로 앞입니다.', 1, 0, NOW());

-- 추가 메시지 (부하 테스트용 100개)
INSERT INTO chat_message (room_id, sender_id, content, message_type, read_status, created_at)
SELECT
    (nums.n % 10) + 1,
    CASE
        WHEN nums.n % 2 = 0 THEN (SELECT user_id FROM chat_user WHERE room_id = (nums.n % 10) + 1 LIMIT 1)
        ELSE (SELECT user_id FROM chat_user WHERE room_id = (nums.n % 10) + 1 LIMIT 1 OFFSET 1)
    END,
    CONCAT('테스트 메시지입니다. 안녕하세요! 번호: ', nums.n),
    1,
    nums.n % 2,
    DATE_ADD(NOW(), INTERVAL nums.n SECOND)
FROM (
    SELECT (a.N + b.N * 10 + 1) as n
    FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
         (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
    WHERE (a.N + b.N * 10 + 1) <= 100
) nums;

-- trade_info 테스트 데이터
INSERT INTO trade_info (product_name, category, trade_date, start_date, storage_period, trade_price, room_id) VALUES
('캐리어', '여행용품', NOW(), CURDATE(), 7, 30000, 1),
('박스 3개', '일반물품', NOW(), CURDATE(), 14, 25000, 3);
