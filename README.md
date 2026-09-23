# ZOO:CAFE v43 — Google Maps Garden Test

카페 밖 공간을 **정원**으로 바꾸고 Google Maps JavaScript API 지도를 배경으로 사용하는 테스트 버전입니다.

## Demo Key 넣기
1. `map_config.js` 파일을 메모장으로 엽니다.
2. `PASTE_YOUR_MAPS_DEMO_KEY_HERE` 부분만 발급받은 Maps Demo Key로 교체합니다.
3. 저장한 뒤 기존 Git 연결 폴더에 v43 파일들을 덮어씁니다.
4. `git add .` → `git commit` → `git push` 합니다.

Demo Key는 테스트/프로토타입 전용입니다. 실제 서비스 전환 시 표준 API 키와 도메인/API 제한을 설정하세요.

## v43 동작
- 카페에서 나가면 `정원 = Google 지도`
- GPS 현재 위치가 지도 중심이 되고 빨간 점 대신 내 동물 캐릭터가 표시됨
- 기존 가상 잔디/도로/나무/분수는 정원에서 표시하지 않음
- 500m 이내 친구는 실제 캐릭터, 501~1000m 친구는 실루엣
- 다른 유저의 지도 좌표는 약 0.001도 단위로 흐려서 전달(정확한 GPS 좌표 직접 공개 방지)
- 정원에서는 조이스틱 이동 대신 실제 GPS가 위치를 결정
- E 버튼으로 카페 내부로 돌아감
