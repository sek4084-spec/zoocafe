# ZOO:CAFE v52.3 — Free Gemini AI

v52의 `게임 AI + 생성형 AI + 기억` 구조는 유지하고 OpenAI 유료 API 연결을 Gemini API 무료 등급용 연결로 교체했습니다.

## 구성
- 게임 AI: 걷기 / 쉬기 / 플레이어 발견 / 접근 / 대화 대상 선택 — 로컬 로직, API 비용 없음
- 생성형 AI: 실제 유저 채팅이 들어왔을 때만 Gemini 호출
- 기억: NPC별 + 유저별 중요한 기억을 `data/npc-memory.json`에 저장
- 캐릭터 렌더링: v51 Character Engine 유지

## 필요한 설정
Google AI Studio에서 Gemini API 키를 만든 뒤 Render의 Environment에:
`GEMINI_API_KEY = 발급받은 키`
를 추가합니다.

선택:
`ZOO_AI_MODEL = gemini-3.8-flash`

API 키는 브라우저 코드에 들어가지 않고 `server.js`에서만 사용합니다.
키가 없거나 무료 한도를 초과하면 게임은 멈추지 않고 fallback 대화를 사용합니다.

## 무료 등급 주의
Gemini 무료 등급은 모델별 요청/토큰 한도가 있습니다. 한도를 넘으면 일시적으로 AI 자유대화 대신 fallback 대화가 나옵니다.
무료 등급에 제출한 콘텐츠는 Google 제품 개선에 사용될 수 있으므로 NPC 대화창에 비밀번호, 주민번호, 금융정보 같은 민감정보를 입력하지 않는 방향으로 운영하는 것이 좋습니다.

## 기억 저장
현재 기억 파일은 Render의 로컬 파일에 저장됩니다. Render 인스턴스가 재생성되면 영구 보존되지 않을 수 있습니다. 영구 기억은 추후 무료 DB(PostgreSQL 등)로 이동하는 단계가 필요합니다.


## v52.3 hotfix
- syncRoom / broadcastRoom / publicPlayer 복구
- Gemini 기본 모델 gemini-3.8-flash
- /api/ai-status 진단 추가 (API 키 원문은 노출하지 않음)

## v52.3
Gemini가 429/5xx(특히 503 과부하)를 반환하면 짧게 재시도한 뒤 다음 모델로 자동 전환합니다.
순서: gemini-3.8-flash → gemini-3.6-flash → gemini-3.5-flash-lite → gemini-3.1-flash-lite.
직접 대화가 성공한 실제 모델명도 서버 응답에 포함됩니다. 모든 모델이 실패할 때만 기존 fallback 문장을 사용합니다.


## v52.4 Quick Bubble AI
- AI 생각 중: 흰 말풍선 + 검은 `...`만 표시, 채팅 기록에는 남기지 않음
- 답변 길이에 따라 말풍선 폭/높이 자동 조절, 최대 4줄 자동 줄바꿈
- AI 호출 전 인위적 대기시간을 약 0.1~0.3초로 단축
- Gemini 한 모델이 3.5초 이상 지연되면 다음 모델로 빠르게 전환


## v52.5 Clear AI State
- AI 응답 대기 중에는 기존 v52.4의 흰 말풍선 + 검은 `...` 유지
- Gemini 키 없음 / 모든 모델 실패 / 빈 응답 등 생성형 AI를 사용할 수 없는 경우 문구를 `이해하기 쉽게 다시 말해줄래?`로 통일
- 기존 `~에 대해 조금 더 말해줄래?` fallback 패턴 제거
- 다른 UI/말풍선/캐릭터 동작은 변경하지 않음


## v52.6 Growing AI
- NPC growth is stored per user and per NPC in `data/npc-growth.json`.
- Successful AI conversations add XP; meaningful saved memories add bonus XP.
- NPC prompt receives level, relationship stage, talk count, and memory count so behavior can gradually become more familiar.
- 503/5xx/timeouts immediately switch to the next configured Gemini model.
- 429 stops further model requests for that turn to avoid amplifying rate-limit pressure.
- Existing thinking bubble and fallback text remain unchanged.


## v52.7 Multiplayer AI + Mobile Render Fix
- NPC thinking/reply events are broadcast to every player in the same multiplayer room.
- NPC memory and growth remain personal to the user who spoke, so one player's memories do not overwrite another player's relationship.
- Mobile world rendering now falls back to a real grass canvas while PNG assets are still loading instead of leaving the transparent canvas over a black mobile stage.
- Mobile canvas/entity visibility is forced on as a final safety rule.


## v52.9 Server Brain
- NPC learns explicit player facts even if Gemini temporarily fails (likes, hobbies, remember-this phrases).
- Memory and relationship growth are per player + per NPC.
- When a returning player enters the cafe, an NPC can proactively greet them using a saved memory.
- 30-minute proactive-greeting cooldown prevents spam.
- Optional durable PostgreSQL persistence: set `DATABASE_URL`. Without it, local JSON remains as fallback and may reset on ephemeral hosts such as Render.
- Render: add a PostgreSQL database, then set the web service `DATABASE_URL` to its internal connection URL.

## v52.9 Server Brain
- Gemini가 정상 응답할 때 `MEMORY:`(플레이어 개인 기억)와 `KNOWLEDGE:`(NPC 공용 지식)를 분리해 추출합니다.
- 개인 기억은 `userId::npcId` 단위로 저장되어 다른 플레이어에게 섞이지 않습니다.
- 공용 지식은 NPC별 `data/npc-knowledge.json` 또는 PostgreSQL `knowledge` 상태에 저장됩니다.
- Gemini가 429/503/timeout/API 키 없음 상태여도 저장된 개인 기억/공용 지식을 검색해 NPC가 자체 응답합니다.
- Gemini가 다시 연결되면 새 지식을 계속 배우고 서버 저장소를 확장합니다.
- Render에서 영구 보존하려면 `DATABASE_URL`을 연결하세요. DB가 없으면 JSON fallback은 배포/재시작 시 유실될 수 있습니다.


## v53 Hybrid Brain
- Gemini 429 circuit breaker: after a 429, Gemini sleeps for 30 minutes by default instead of being called on every chat.
- During sleep, NPCs keep talking through ZOO:CAFE server memory/knowledge and personality fallbacks.
- After the cooldown, the next suitable chat probes Gemini automatically; success returns to Gemini mode.
- Explicit personal-memory teaching still works without Gemini (e.g. `내 취미는 그림 그리기야`, `아메리카노라고 기억해줘`).
- Explicit public-knowledge teaching works without Gemini for testing: `배워둬: 주카페의 대표 메뉴는 별빛라떼야`. This is stored in the NPC knowledge store/PostgreSQL.
- `/api/health` reports Gemini sleep state and whether the NPC DB is connected.
- `GEMINI_QUOTA_SLEEP_MS` can override the default 30-minute cooldown.


## v53.1 Shared Ears
- 대답한 NPC는 기존처럼 개인 기억을 직접 저장합니다.
- 같은 카페에 있는 다른 NPC도 플레이어가 직접 밝힌 기억/AI가 추출한 장기 기억을 `같은 자리에서 들음`으로 별도 저장합니다.
- 공용 지식은 이제 `__shared_world__` 저장소에 기록되어 멍사자와 쥐무는토끼가 함께 사용할 수 있습니다.
- NPC별 개인 경험/관계 성장 데이터는 계속 분리됩니다.
- PostgreSQL 연결 시 이 기억/공용 지식도 재배포 후 유지됩니다.


## v54 · Illustrated Cafe
- Café interior visual replaced with the approved illustrated seaside-cave café artwork.
- The illustrated left menu and bottom chat area now have real clickable HTML hotspots.
- Cafe/menu, story/chat, map, friends/profile, bag, settings, chat input, and quest areas are clickable.
- Existing multiplayer, AI memory, PostgreSQL persistence, movement and NPC logic are preserved.
- Outside world remains unchanged.

## v54.3 · Living Video Cafe
- 카페 정지 이미지를 사용자가 만든 10초 Flow MP4(`video/cafe-living-v54.mp4`)로 교체했습니다.
- 카페에서는 영상이 자동 재생/무한 반복되고, 캔버스는 AI 말풍선만 그립니다.
- 브라우저 자동재생 정책 때문에 최초 재생은 음소거로 시작하며, 카페에서 첫 클릭/터치/키 입력 후 영상 자체 오디오가 활성화됩니다.
- 영상 오디오가 활성화되면 기존 카페 BGM은 중지되어 파도/환경음과 겹치지 않습니다.
- 기존 Gemini/서버 두뇌/PostgreSQL/Shared Ears/클릭 UI/채팅 입력 기능은 유지합니다.


## v54.4 Social Video Cafe
- NPC speech bubbles moved above faces.
- Clickable left/right cafe sidebars added.
- Cafe BGM now plays together with the uploaded video ambience after browser audio unlock.
- Existing WebSocket multiplayer, Gemini hybrid brain and PostgreSQL memory are unchanged.


## v54.5 Full View Social Cafe
- Mobile cafe video uses contain instead of cover so the full 16:9 Flow scene is visible without cropping.
- Chat mode slightly zooms the scene out on portrait phones.
- Cafe Chat opens the real conversation history plus input; player, Mungsaja, rabbit and multiplayer messages share the same log.
- NPC display names are now 멍사자 / 쥐무는토끼 (no AI prefix).
- Existing multiplayer, Gemini hybrid brain, Shared Ears and PostgreSQL persistence are preserved.


## v54.6 Mobile Lounge UI
- 모바일 세로 화면을 기준으로 좌/우 기능 바 + 하단 상시 대화 기록 패널을 배치했습니다.
- 원본 16:9 Flow 영상은 자르지 않고 중앙에 유지하고, 남는 세로 공간은 같은 영상을 블러 확장하여 검은 여백 대신 살아있는 배경처럼 보이게 합니다.
- 채팅 기록에는 플레이어/NPC/멀티플레이 대화가 함께 표시되며 채팅 버튼을 누르면 하단 입력창이 열립니다.
- PC 화면, WebSocket 멀티, Gemini/서버 기억/PostgreSQL 구조는 유지합니다.


## v54.8 New Cafe Art
- Replaced the cafe background with the user-supplied ZOO:CAFE illustration.
- Existing mobile rails, chat composer, multiplayer, AI NPC, Gemini hybrid brain, and PostgreSQL memory remain intact.
- On portrait phones the full artwork is kept visible with a soft same-image fill behind it.


## v54.10 · New Living Cafe Video
- Replaced the cafe background with the newly supplied MP4.
- Restored the animated cafe video layer while preserving AI, multiplayer, sidebars, chat, Gemini and PostgreSQL systems.
- Existing desktop NPC bubble positioning remains in place.


## v54.12 NPC Conversation Focus
- Mobile video focal point moved left so Mungsaja and Rabbit stay together in the portrait frame.
- Mobile NPC speech uses stable DOM bubbles above each character and remains visible while typing.
- Conversation dock reduced to preserve more of the character area.
- Desktop v54.11 bubble layout and multiplayer/Gemini/PostgreSQL systems remain intact.


## v54.13 Drag Camera
- 카페 배경을 손가락/마우스로 누른 채 드래그해 시점을 이동할 수 있습니다.
- 좌우 메뉴, 채팅창, 설정 등 HUD/UI는 화면에 고정됩니다.
- 모바일 NPC 말풍선은 배경 속 NPC를 따라 함께 이동합니다.
- 버튼/채팅 입력 영역에서는 카메라 드래그가 시작되지 않아 기존 조작을 방해하지 않습니다.
- 멀티플레이, Gemini AI, PostgreSQL 기억 구조는 변경하지 않았습니다.


## v54.14 · NPC Focus UI
- 모바일에서 중복되던 작은 캔버스 NPC 말풍선을 제거하고 큰 말풍선 하나만 표시합니다.
- 멍사자/쥐무는토끼 이름표를 말풍선에 고정해 누가 말하는지 명확히 표시합니다.
- 좌우 세로 메뉴를 상단 한 줄 5개 버튼(메뉴/채팅/친구/BGM/설정)으로 통합했습니다.
- 드래그 카메라와 멀티플레이/AI/서버 기억 로직은 유지합니다.


## v54.15 Fixed NPC Bubbles
- Mobile NPC speech bubbles are fixed HUD elements and no longer follow drag-camera pan.
- Mungsaja and Jwimuneun-tokki each have a separate fixed speech zone above their on-screen character area.
- Existing top toolbar, chat, multiplayer, Gemini and PostgreSQL memory remain intact.
