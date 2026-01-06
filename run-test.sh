#!/bin/bash

# =====================================================
# Matajo 부하 테스트 실행 스크립트
# =====================================================

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수 정의
print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 결과 디렉토리 생성
mkdir -p k6/results

# 메뉴 선택
show_menu() {
    echo ""
    echo "========================================"
    echo "  Matajo 부하 테스트 도구"
    echo "========================================"
    echo ""
    echo "1) Docker 환경 시작 (MySQL, Redis, App)"
    echo "2) Docker 환경 중지"
    echo "3) 스모크 테스트 실행 (기본 기능 확인)"
    echo "4) WebSocket 부하 테스트 실행"
    echo "5) REST API 부하 테스트 실행"
    echo "6) 전체 테스트 실행"
    echo "7) 로그 확인"
    echo "8) Grafana 대시보드 열기"
    echo "9) 테스트 결과 확인"
    echo "0) 종료"
    echo ""
    read -p "선택: " choice
}

# Docker 환경 시작
start_docker() {
    print_header "Docker 환경 시작"

    # Gradle 빌드
    print_warning "Gradle 빌드 중..."
    ./gradlew bootJar -x test

    # Docker Compose 시작
    print_warning "Docker Compose 시작 중..."
    docker-compose up -d --build

    # 서비스 상태 확인
    print_warning "서비스 시작 대기 중 (최대 60초)..."
    for i in {1..60}; do
        if curl -s http://localhost:8080/actuator/health > /dev/null 2>&1; then
            print_success "서비스가 정상적으로 시작되었습니다!"
            echo ""
            echo "서비스 URL:"
            echo "  - API: http://localhost:8080"
            echo "  - Prometheus: http://localhost:9090"
            echo "  - Grafana: http://localhost:3001 (admin/admin)"
            return 0
        fi
        sleep 1
        echo -n "."
    done

    print_error "서비스 시작 시간 초과"
    echo "로그 확인: docker-compose logs -f app"
    return 1
}

# Docker 환경 중지
stop_docker() {
    print_header "Docker 환경 중지"
    docker-compose down
    print_success "Docker 환경이 중지되었습니다."
}

# 스모크 테스트
run_smoke_test() {
    print_header "스모크 테스트 실행"

    if ! command -v k6 &> /dev/null; then
        print_error "k6가 설치되어 있지 않습니다."
        echo "설치 방법: brew install k6"
        return 1
    fi

    k6 run k6/smoke-test.js
}

# WebSocket 부하 테스트
run_websocket_test() {
    print_header "WebSocket 부하 테스트 실행"

    if ! command -v k6 &> /dev/null; then
        print_error "k6가 설치되어 있지 않습니다."
        echo "설치 방법: brew install k6"
        return 1
    fi

    k6 run --out json=k6/results/websocket-results.json k6/websocket-chat-test.js
}

# REST API 부하 테스트
run_api_test() {
    print_header "REST API 부하 테스트 실행"

    if ! command -v k6 &> /dev/null; then
        print_error "k6가 설치되어 있지 않습니다."
        echo "설치 방법: brew install k6"
        return 1
    fi

    k6 run --out json=k6/results/api-results.json k6/rest-api-test.js
}

# 전체 테스트
run_all_tests() {
    print_header "전체 테스트 실행"

    echo "1. 스모크 테스트"
    run_smoke_test

    echo ""
    echo "2. REST API 테스트"
    run_api_test

    echo ""
    echo "3. WebSocket 테스트"
    run_websocket_test

    print_success "모든 테스트가 완료되었습니다."
    echo "결과 파일: k6/results/"
}

# 로그 확인
show_logs() {
    print_header "Docker 로그"
    docker-compose logs -f --tail=100 app
}

# Grafana 열기
open_grafana() {
    print_header "Grafana 대시보드"
    echo "URL: http://localhost:3001"
    echo "로그인: admin / admin"

    if command -v open &> /dev/null; then
        open http://localhost:3001
    elif command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3001
    fi
}

# 테스트 결과 확인
show_results() {
    print_header "테스트 결과"

    if [ -d "k6/results" ]; then
        echo "결과 파일 목록:"
        ls -la k6/results/

        echo ""
        echo "최근 결과 요약:"
        if [ -f "k6/results/summary.json" ]; then
            cat k6/results/summary.json | head -50
        else
            echo "결과 파일이 없습니다. 테스트를 먼저 실행하세요."
        fi
    else
        echo "결과 디렉토리가 없습니다."
    fi
}

# 메인 루프
main() {
    while true; do
        show_menu
        case $choice in
            1) start_docker ;;
            2) stop_docker ;;
            3) run_smoke_test ;;
            4) run_websocket_test ;;
            5) run_api_test ;;
            6) run_all_tests ;;
            7) show_logs ;;
            8) open_grafana ;;
            9) show_results ;;
            0) echo "종료합니다."; exit 0 ;;
            *) print_error "잘못된 선택입니다." ;;
        esac
    done
}

# 인자가 있으면 직접 실행
if [ $# -gt 0 ]; then
    case $1 in
        "start") start_docker ;;
        "stop") stop_docker ;;
        "smoke") run_smoke_test ;;
        "websocket") run_websocket_test ;;
        "api") run_api_test ;;
        "all") run_all_tests ;;
        "logs") show_logs ;;
        *) echo "사용법: $0 {start|stop|smoke|websocket|api|all|logs}" ;;
    esac
else
    main
fi
