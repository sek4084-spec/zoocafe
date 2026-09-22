# ZOO:CAFE v31 — Cafe Art Direction Pass

이번 버전은 카페 내부를 목표 이미지의 따뜻한 고밀도 픽셀아트 방향으로 교체한 첫 실제 아트 패스입니다.

## 교체 가능한 핵심 PNG
- `assets/cafe/interior/cafe-background.png` — 960x540 카페 내부 전체 아트
- `images/npc/cafe-owner.png` — 카페지기 NPC

게임 로직과 그림을 분리했습니다. 카페 배경 PNG를 같은 크기/이름으로 교체하면 이동, 멀티플레이, 대화 코드는 그대로 유지됩니다.

`assets/cafe/editable/`에는 바닥/벽/카운터/러그/좌우 테이블의 편집 참고용 PNG 조각도 넣었습니다. 다음 패스에서 이 요소들을 완전한 투명 개별 오브젝트 에셋으로 분리할 수 있습니다.

## 충돌
충돌은 `game.js`의 `cafeSolids` 배열이 담당합니다. 그림 자체는 충돌 판정을 하지 않습니다.
