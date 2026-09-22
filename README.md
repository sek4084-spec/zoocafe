# ZOO:CAFE v21 — Grand Plaza

# ZOO:CAFE Online v13 — 인터넷 배포 준비 버전

## 로컬 실행
1. Node.js 18 이상 설치
2. 이 폴더에서 `npm install`
3. `npm start`
4. 브라우저에서 `http://localhost:3000`

## Render에 공개하기
이 프로젝트는 Render Web Service에서 실행되도록 PORT 환경변수와 0.0.0.0 바인딩, `/api/health` 상태 확인 주소, `render.yaml`을 포함합니다.

1. 이 폴더 전체를 GitHub 저장소에 업로드합니다.
2. Render에서 New > Web Service를 선택하고 GitHub 저장소를 연결합니다.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Free 인스턴스로 먼저 테스트할 수 있습니다.
6. 배포 완료 후 `https://...onrender.com` 주소를 친구에게 보내면 접속할 수 있습니다.

## 매우 중요한 계정 데이터 주의
현재 회원 계정은 `data/users.json`에 저장됩니다. Render 무료 Web Service의 로컬 파일 시스템은 영구 저장소가 아니므로 재시작/재배포/슬립 이후 가입 계정이 사라질 수 있습니다. 멀티플레이 기능 테스트에는 사용할 수 있지만, 실제 운영 전에는 PostgreSQL 같은 영구 DB로 계정 저장소를 옮겨야 합니다.

## 무료 Render 테스트 시
무료 Web Service는 일정 시간 요청이 없으면 잠들 수 있으며, 다음 접속 때 다시 시작되는 데 시간이 걸릴 수 있습니다. WebSocket은 지원하지만 무료 인스턴스의 운영 제한이 있습니다.

## v18 Water Garden Pass
- Water-edge rock cluster asset
- Animated reed assets
- Lily-pad assets
- Replaceable wooden bridge PNG asset
- River/waterfall area now uses more layered environmental props
- Existing login, multiplayer, chat, rooms, and BGM remain intact


## v21 변경사항
- 월드 크기 1920×1120 → 2880×1800 확장
- 캐릭터를 따라가는 기존 카메라 시스템을 대형 맵에 적용
- 폭포 → 개울 → 하단 연못/강으로 이어지는 물 공간
- 개울을 건너는 나무다리
- 중앙 ZOO:CAFE 광장/정원/테라스
- 오른쪽 숲길과 터널형 입구
- 바람에 흔들리는 나무·풀, 움직이는 물·폭포·오리 유지
- 기존 로그인/채팅/WebSocket 멀티플레이 구조 유지
