# ZOO:CAFE v47 — ZOO Garden World

v46 테마를 유지하면서 2차 게임 레이어를 추가했습니다.
- Google 기본 POI 클릭 비활성화 + 일반 POI/상점 라벨 숨김
- ZOO:CAFE 전용 가상 장소: 멍사자 숲, 주카페 쉼터, 친구 광장, 바람 벤치, 별빛 정원
- GPS 주변에 게임 장소 아이콘/이름을 오버레이
- 내 캐릭터/주변 유저는 DOM OverlayView로 표시
- 500m/1km 거리 규칙 유지
- Google Maps 인증 실패 시 게임 내부 안내문 표시

중요: Google이 띄우는 '이 페이지에서 Google 지도를 제대로 로드할 수 없습니다' 인증 팝업은 코드로 숨길 수 있는 UI가 아닙니다.
그 팝업이 뜨면 Demo/API Key 프로젝트의 Maps JavaScript API 활성화, 결제 연결, HTTP referrer 허용 설정을 확인해야 합니다.
