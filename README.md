# 마타조(Matajo)
<img width="1278" height="719" alt="image" src="https://github.com/user-attachments/assets/eba2e379-11e7-48fe-af68-bdf51663bca3" />

## 프로젝트 개요
여행이나 이사, 계절 변화로 인해 짐 둘 곳이 마땅치 않은 순간, 비싼 호텔이나 먼 트렁크룸은 부담스럽게 느껴집니다. <br>
마타조(Matajo)는 그런 사용자들을 위해 만들어진 **“내 주변 빈 공간을 활용한 이웃 기반 짐 보관 서비스”**입니다.
- **기간**: 25.03 - 25.05
- **인원**: 6명 (FE 2, BE 4)
- **역할**: 실시간 채팅 서비스 및 이미지 처리 파이프라인 개발

## 기술 스택

### Frontend
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

### Backend
![Java](https://img.shields.io/badge/Java-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)

### Database
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)

### Infra
![AWS](https://img.shields.io/badge/AWS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)

### Monitoring & Analysis
![Grafana](https://img.shields.io/badge/Grafana-F46800?style=for-the-badge&logo=grafana&logoColor=white)
![Loki](https://img.shields.io/badge/Loki-FFFFFF?style=for-the-badge&logo=grafanaloki&logoColor=black)
![Sentry](https://img.shields.io/badge/Sentry-362D59?style=for-the-badge&logo=sentry&logoColor=white)
![Google Analytics](https://img.shields.io/badge/Google_Analytics-E37400?style=for-the-badge&logo=googleanalytics&logoColor=white)

## 담당 기능
### 1. 채팅 및 알림 기능
- Websocket + STOMP를 활용해 의뢰인과 보관인이 실시간으로 소통할 수 있도록 기능 구현
- FCM을 활용해 크로스 플랫폼에서 푸시 알림을 받을 수 있도록 기능 구현
### 2. 이미치 처리 파이프라인
- S3 Presigned URL을 도입해 서버를 거치지 않고 직접 업로드 할 수 있도록 기능 구현
- AWS Lambda와 Sharp 라이브러리를 활용해 자동 리사이징 및 CloudFront 연동을 톡해 전역 이미지 서빙 속도를 높였습니다.
### 3. 거래 정보 기능
- 채팅방 참여자 여부 검증 후 거래 정보 생성 및 저장
- 거래 확정 시 시스템 메시지를 자동 전송하고 WebSocket으로 실시간 브로드캐스트
- 내 거래 내역 조회 및 지역 기반 최근 거래 조회 구현
