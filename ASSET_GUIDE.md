# ZOO:CAFE Asset System v1

게임 그래픽을 코드 도형에서 PNG 에셋 중심으로 교체하기 위한 첫 구조입니다.

## 기본 규격
- 기본 타일: 32x32 PNG, 투명 배경 허용
- 큰 오브젝트: 32px 배수 권장 (64/96/128...)
- 픽셀아트: 브라우저 보간 OFF (`imageSmoothingEnabled=false`)

## 폴더
- `assets/terrain`: 잔디/길/지형 타일
- `assets/water`: 물/폭포 애니메이션 프레임
- `assets/nature`: 나무/덤불/바위/꽃
- `assets/animals`: 오리 등 환경 동물
- `assets/buildings`: 카페/상점 등 건물 (다음 제작 단계)
- `assets/props`: 벤치/가로등/간판/화분 등 (다음 제작 단계)

## 교체 방법
같은 파일명으로 PNG를 교체하면 `game.js`의 배치 코드를 다시 만들 필요가 없습니다.
예: `assets/nature/tree_01.png`를 새 완성본 나무 도트로 덮어쓰기.

`assets.js`가 파일 목록과 로딩을 담당하고 `game.js`는 배치/애니메이션/게임 로직을 담당합니다.

## v17 Nature Pass
- Grass tiles: 32x32, 3 variants, subtle non-flat texture.
- Trees: 96x128, 3 foliage variants with transparent backgrounds.
- Bush: 64x48. Rock: 48x36.
- Flowers: 32x32, cream/pink/purple variants.
- Grass tufts: 32x32, 2 variants; renderer adds gentle wind sway.
- Keep nearest-neighbor / pixelated rendering. Do not upscale with smoothing.

### v18 added
- `assets/props/bridge_01.png` — main wooden bridge
- `assets/props/stepping_stones_01.png` — stepping-stone prop for later placement
- `assets/water/lilypad_01.png`, `lilypad_02.png`
- `assets/water/reeds_01.png`, `reeds_02.png`
- `assets/nature/shore_rocks_01.png`

## v19 cafe exterior assets
- `assets/buildings/cafe_exterior_01.png` — entire outside café facade
- `assets/props/cafe_table_01.png` — terrace table/chairs
- `assets/props/umbrella_01.png` — terrace parasol
- `assets/props/planter_01.png` — flower planter
- `assets/props/chalkboard_01.png` — café menu board
- `assets/props/barrel_planter_01.png` — barrel flower planter

These are intentionally separate. Replacing any PNG changes that part of the scene without rewriting map drawing code.
