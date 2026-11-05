# jikgwan-app

야구 직관 기록 웹앱 프로젝트.

## 대화 기록 규칙
- 사용자와의 모든 대화를 `chat.txt`에 계속 기록한다.
- 매 턴마다 날짜 헤더(`## YYYY-MM-DD`) 아래에 `[사용자]` 메시지 원문과 `[Claude]` 응답 요약(한 일, 결과)을 덧붙인다(append). 기존 내용은 지우지 않는다.

## 배포
- GitHub Pages (main 브랜치 루트): https://seo00224.github.io/jikgwan-app/
- main에 push하면 1~2분 뒤 자동 반영된다.
