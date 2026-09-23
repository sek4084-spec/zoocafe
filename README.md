# ZOO:CAFE v49.2 — Android GPS Fix

Android에서 `1km ZOO 정원을 준비하는 중…`에 멈추는 문제를 수정했습니다.

원인:
- v49에서 정원 입장 GPS를 `getCurrentPosition + enableHighAccuracy:true` 한 번으로 변경했습니다.
- 일부 Android 브라우저에서는 새 고정밀 GPS fix를 기다리며 정원 초기화가 진행되지 않을 수 있습니다.
- iPhone에서는 같은 코드가 정상 완료되어 기기별 차이가 나타났습니다.

수정:
- 입장 지역 판별에는 고정밀 GPS를 강제하지 않음
- 최근 위치(cached/network location)를 우선 허용
- 동시에 watchPosition으로 위치 획득을 보조
- 첫 위치를 받는 즉시 1km 정원을 만들고 지도 중심은 이후 고정
- 대기 중 정원을 나가면 GPS watcher 정리
- v49.1의 지도/이동/채팅/실루엣 제거 기능 유지
