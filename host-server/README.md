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


## v55.0 Random Visitors
- Server-shared cafe atmosphere event rotates every 45 minutes (configurable with `CAFE_EVENT_MS`).
- Weighted states: normal 70%, rain 15%, sunset 8%, special visitor 5%, rare 2%.
- All multiplayer users in the cafe receive the same event.
- Visitor card can be tapped to see the visitor's short introduction.
- 카페의 방문자 카드는 클릭하면 짧은 소개를 표시합니다.


## v55.7 · 정보 퀘스트

- NPC끼리 자동으로 말하는 기능, 대화 생성 타이머, 대화 진행 기록을 제거했습니다.
- 카페의 NPC에게 사용자가 직접 말을 걸면 답하는 기능은 유지합니다.
- 로그인한 사용자는 질문 퀘스트를 올리고 다른 사용자의 질문을 맡아 답할 수 있습니다.
- 질문 작성자가 답변을 확인하면 해결 완료 처리합니다. 퀘스트는 `data/question-quests.json`에 저장됩니다.
- 기존 0–3번 카페 영상, 멀티플레이, 사용자와 NPC의 대화는 유지됩니다.
- 네이버 웹사이트에서 멍사자가 함께 검색하는 기능은 별도의 Chrome 확장 프로그램과 검색 연동이 필요하며, 이 버전에는 포함되지 않습니다.

## v55.7.1 · 네이버 멍사자 검색 도우미 (PC Chrome)

1. 주카페 서버를 `npm start`로 실행합니다. `/api/health`에서 `55.7.1`을 확인합니다.
2. Chrome 주소창에 `chrome://extensions`를 입력하고 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 눌러 이 폴더 안의 `chrome-extension` 폴더를 선택합니다.
4. 주카페에 로그인해 `질문 퀘스트` → `연결 코드 받기`를 누릅니다. 5분 동안 유효한 12자리 코드를 복사합니다.
5. PC 크롬에서 `https://www.naver.com` 또는 `https://search.naver.com`을 열고 오른쪽 아래 멍사자를 눌러 코드를 입력합니다.
6. 검색어를 입력해 네이버 검색으로 이동하거나 현재 화면에 표시된 링크의 제목·주소를 기준으로 멍사자에게 물어볼 수 있습니다.

현재는 로컬 주카페 서버(`localhost:3000`)에 연결합니다. 서버를 재시작하면 확장 프로그램을 다시 연결해야 합니다. Gemini 키가 없거나 호출할 수 없을 때는 링크를 읽었다고 주장하지 않는 기본 안내를 표시합니다. 브라우저에 보이는 링크의 제목과 주소만 사용자가 `멍사자에게 물어보기`를 누른 시점에 서버로 보냅니다. 네이버 검색 API 연결이나 원문 자동 확인은 이 버전에 포함되지 않습니다.

## v55.7.2 · 검색 결과 중심 멍사자

- 네이버 첫 화면에서 `검색하고 멍사자에게 묻기`를 누르면 입력한 질문으로 실제 네이버 검색 결과 페이지로 이동합니다.
- 검색 결과 페이지에서만 질문과 관련된 링크를 골라 제목, 주소, 짧은 화면 미리보기를 표시합니다. 첫 화면의 뉴스·광고를 결과처럼 제시하지 않습니다.
- 원문 전체를 읽는 기능은 없습니다. Gemini 연결 시 화면 미리보기를 근거로 답하고, 연결되지 않은 경우 관련 링크를 안내합니다.
- 설치해 둔 확장 프로그램은 새 압축 폴더의 `chrome-extension`을 로드한 뒤 Chrome 확장 프로그램 페이지에서 새로고침해 주세요. 주카페 서버 버전은 `55.7.2`입니다.

## v55.7.3 · 네이버 화면의 주카페 채팅

- 멍사자 도우미 안에 주카페 계정으로 참여하는 하나의 공용 채팅방을 추가했습니다.
- 네이버 전체 이용자가 아니라 주카페 확장 프로그램을 연결하고 최근 16초 안에 네이버 화면에서 활동 중인 사용자 수를 표시합니다.
- 메시지는 `data/naver-room.json`에 최근 100개를 저장하고, 화면에는 최신 50개를 보여줍니다.
- 서버를 새 버전으로 재시작하고 `chrome://extensions`에서 주카페 확장 프로그램의 새로고침을 누른 뒤 네이버 화면을 새로고침하세요.


## v55.7.4 · 모든 일반 웹사이트의 멍사자

- Chrome에서 여는 일반 HTTP/HTTPS 페이지에 멍사자 버튼이 표시됩니다. `chrome://` 화면, 확장 프로그램 페이지, Chrome 웹 스토어 등 Chrome 제한 페이지는 제외됩니다.
- 멍사자와 개인 대화는 주카페 계정 연결 후 사용하며 카페 멍사자의 사용자별 대화 기억을 사용합니다. 개인 대화는 공용 채팅에 게시하지 않습니다.
- 네이버 검색 결과 링크 분석은 네이버 검색 결과 화면에서만 수행합니다. 다른 사이트에서 검색 버튼을 누르면 네이버 검색 결과로 이동합니다.
- 새 확장 폴더를 Chrome에서 로드하거나 기존 폴더를 교체하고 `chrome://extensions`에서 새로고침한 다음 웹페이지를 새로고침하세요. 서버도 재시작해야 개인 대화 API가 작동합니다.
- 현재 확장 프로그램은 이 컴퓨터의 `localhost:3000` 서버에 연결합니다.


## v55.9.3 · 현재 유튜브 영상의 개별 링크 찾기

- 유튜브 영상이나 숏츠를 열고 크롬 멍사자의 `이 영상과 비슷한 영상 링크`를 누르거나 개인 대화에서 `이거랑 비슷한 영상 찾아줘`라고 입력하면, 영상 제목을 검색어로 실제 유튜브 검색 결과의 개별 영상 1~5개를 대화 창에 링크로 표시합니다.
- 별도 AI 키가 없어도 작동합니다. 추천은 제목 기반의 유튜브 검색 결과이며 영상 장면·음성의 의미를 분석하거나 취향에 맞는지 검증하는 기능은 아닙니다. 원본 영상과 중복된 결과는 제외합니다.
- 확장 프로그램은 백그라운드 검색 탭을 잠깐 열어 검색 결과를 읽고 닫습니다. 유튜브가 결과를 표시하지 않거나 화면 구조가 달라지면 안내와 직접 검색 링크를 보여줍니다. 이 동작은 PC 크롬 확장 전용입니다.
- `chrome://extensions`에서 확장 0.1.8을 다시 로드하고 유튜브 페이지를 새로고침하세요. 새 권한을 묻는다면 승인해야 검색 탭을 열 수 있습니다.

## v55.9.2 · 건물 채팅과 멍사자 친구 채팅 연결

- 크롬 멍사자 패널의 `친구 채팅`에서 애니 이야기관을 선택하면 게임 애니 이야기관의 현장 채팅이 같은 창에 표시됩니다. 확장 프로그램에서 보낸 말도 게임 안 같은 건물 친구에게 즉시 전달됩니다.
- 게임 길드와 생활 정보관도 방을 선택해 같은 방식으로 대화할 수 있습니다. 예전 전체 공용 대화는 `기존 공용 채팅`을 선택해야 보입니다.
- 건물 현장 채팅 내역은 최대 100개까지 `data/topic-chat.json`에 저장됩니다. 크롬 패널은 열려 있는 동안 약 4초마다 새 메시지를 확인합니다. 멍사자 개인 대화는 이 방으로 공유되지 않습니다.
- ZIP 업데이트 후 서버를 재시작하고 크롬 확장도 `chrome://extensions`에서 새 버전(0.1.7)으로 새로고침한 다음 열린 페이지를 새로고침하세요. 서버 재시작 후 확장 연결이 만료되면 새 연결 코드를 받아 다시 연결해야 합니다.

## v55.9.0 · 웹에서 시작해 분야별 건물로 이어지는 테스트

- PC 크롬 확장에서 현재 페이지를 `찾아보기 / 사람에게 묻기 / 의뢰 만들기`로 주카페에 가져옵니다. 보이는 글 목록에서 질문처럼 보이는 글도 의뢰 **초안 후보**로 보여줍니다. 원문은 자동 게시하지 않습니다.
- 주카페의 `🦁 링크 가져오기`에 링크 또는 관심사를 붙여 넣어도 같은 선택 화면이 나옵니다. `찾아보기`는 멍사자의 답변과 네이버·구글 검색 링크를 보여 줍니다. 영상이나 외부 게시글 본문을 자동으로 읽거나 검색 결과 원문을 검증하는 기능은 아직 없습니다. Gemini 키가 없으면 AI 답변 대신 상태 안내만 표시됩니다.
- `사람에게 묻기`는 관심사 건물을 골라 이동하고 실시간 현장 채팅 또는 남아 있는 질문 카드로 이어집니다. `의뢰 만들기`는 원본 링크가 포함된 초안을 열어 사용자가 검토 후 게시합니다.
- 모바일에서는 브라우저에서 링크를 복사해 `링크 가져오기`에 붙여 넣어 시험할 수 있습니다. Android 공유 목록에 주카페가 나타나려면 주카페를 **HTTPS 주소**로 제공하고 Chrome에서 웹 앱으로 설치해야 합니다. PC의 `localhost` 주소는 휴대전화에서 PC 서버를 가리키지 않습니다. iOS 등 기기에 따라 공유 대상 지원이 다를 수 있습니다.
- 기존 로그인은 브라우저 탭을 넘어 이어지도록 저장됩니다. 서버 자체가 재시작되면 현재 서버의 로그인 세션이 만료되므로 다시 로그인해야 합니다.
- 멍사자 AI를 쓰려면 서버 폴더에 `.env` 파일을 만들고 `GEMINI_API_KEY=발급받은키`를 넣은 다음 서버를 재시작하세요. `.env.example`은 안내 예시 파일이며 실제 키 파일은 ZIP에 포함되지 않습니다.

## v55.8.0 · 분야별 건물과 질문 카드 테스트

- 마을의 세 건물은 애니 이야기관, 게임 길드, 생활 정보관입니다. 선술집은 기존 카페 장면을 그대로 사용합니다.
- 건물에 들어가 `채팅 / 질문` 버튼을 누르면 같은 건물의 친구와 실시간 채팅하거나 질문을 남길 수 있습니다.
- 질문은 건물을 나가도 남고, 다른 사용자가 답할 수 있습니다. 질문 작성자가 답변을 받은 뒤 `해결 완료`를 누릅니다.
- 테스트는 서로 다른 계정으로 브라우저 두 창에 로그인한 뒤 같은 건물에 입장해 확인하세요. 서버를 재시작하고 두 창 모두 새로고침해야 새 버전이 적용됩니다.
- 질문 카드는 서버 `data/building-questions.json`에 저장됩니다. 별도 데이터베이스 없는 테스트용 저장 방식입니다.
- 기존 프로젝트에 덮어쓸 때는 기존 `data` 폴더를 유지하세요. 배포 ZIP에는 계정과 기존 질문 데이터가 들어 있지 않습니다.

## v55.7.5 · 멍사자 대화·검색·친구 채팅 탭과 질문 초안

- 세 기능을 탭으로 나눠 한 번에 하나만 표시합니다. 개인 대화는 카페의 멍사자와 같은 계정별 기억을 사용하며 최근 대화는 서버가 실행 중인 동안 다시 볼 수 있습니다.
- 네이버 검색 결과 화면에서 제목과 링크를 가져와 질문 퀘스트 초안을 저장합니다. 카페 화면에서 사용자가 질문과 참고 링크를 직접 확인하고 게시합니다.
- 친구 채팅의 각 메시지는 `멍사자에게 전달`을 누르면 개인 대화 입력칸에만 복사됩니다. 사용자가 다시 전송할 때만 멍사자에게 전달합니다.
- 기존 `data` 폴더에는 계정, 멍사자 기억, 채팅, 질문 초안이 저장됩니다. 업데이트할 때 이 폴더를 보존하세요.

## v55.9.4 · 연결 유지 및 영상 주제 확인

- 확장 연결 정보는 서버 `data/extension-sessions.json`에 해시 형태로 저장합니다. 기존 55.9.3 연결은 새 연결 코드를 한 번 발급받아 다시 연결해야 합니다. 이후 같은 `data` 폴더에서 서버를 재시작해도 연결은 유지됩니다(유효기간 30일).
- 확장이 실제 서버 연결 상태를 확인하고 만료되었다면 연결 코드 입력 화면을 보여줍니다. 웹과 확장은 반드시 같은 PC의 `localhost:3000` 서버를 바라봐야 합니다.
- 유튜브 페이지의 영상 제목·메타 정보에서 주제를 찾은 다음 검색 결과의 제목에도 해당 주제가 있는 링크만 표시합니다. 제목과 정보에서 주제를 판단할 수 없거나 일치하는 링크가 없으면 임의의 영상을 추천하지 않습니다. 영상의 실제 화면·오디오 분석은 지원하지 않습니다.
- 압축을 풀어 기존 프로젝트에 덮어쓸 때 `data`와 `.env`는 지우지 마세요. 서버를 재시작하고 `chrome://extensions`에서 확장 0.1.9를 새로고침한 뒤 유튜브 페이지도 다시 열어 주세요.

## v55.9.5 · 윈도우 펫, 공개 서버와 채팅 연동 테스트

- `MungSaja_Pet_Multiplayer_Test` 펫은 도트 시안 4컷을 잘라 표시하고, 카페 서버를 자동으로 열고, 연결 코드로 멍사자 개인 대화 및 건물 채팅을 사용합니다.
- 다른 PC도 같은 공개 HTTPS 서버에 접속해야 채팅과 멀티가 공유됩니다. localhost는 해당 PC 자신을 뜻합니다.
- 크롬 확장 0.2.0도 연결 화면에서 공개 HTTPS 서버 주소를 입력할 수 있습니다. 주소를 바꾸면 해당 서버에서 코드를 다시 발급받으세요.
- 공개 접속 시 서버 `data` 디렉터리와 서버 소스 및 설정 파일을 정적 파일로 제공하지 않도록 차단했습니다.
