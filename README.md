# Project SYSTEMA: 지능형 한국어 데이터 인터페이스

## 1. 프로젝트 개요

한국어 회의록을 위한 지능형 인터페이스입니다. Python FastAPI + LlamaIndex로 하이브리드 RAG(벡터 + 지식 그래프)를 구현하고, Next.js 프론트에서 실시간 스트리밍(SSE)로 응답을 보여줍니다.

### 주요 기능
- 📚 **Notion 데이터베이스 연동**: Notion 데이터베이스의 모든 페이지를 한 번에 가져오기
- 🔧 **커스텀 프롬프트 관리**: 버전 관리와 Git 스타일 diff 비교를 지원하는 프롬프트 편집기
- 🚀 **일괄 처리**: 여러 문서를 한 번에 수집하고 처리하는 배치 기능
- 🔍 **하이브리드 검색**: 벡터 검색과 키워드 검색을 결합한 정확한 응답

## 2. 아키텍처/기술 스택

- 프론트엔드: Next.js 15, React 19, Tailwind, Radix UI
- 백엔드: Python 3.11+, FastAPI, LlamaIndex
- 상태 관리: Zustand + localStorage (프롬프트 히스토리 영구 저장)
- LLM: Google Gemini 2.5 Pro (모델 ID: `gemini-2.5-pro`)
- 임베딩: Gemini embedding-001(768 차원)
- 데이터베이스: Supabase(PostgreSQL), Neo4j AuraDB
- 실시간: SSE(서버→브라우저)
- 외부 연동: Notion API (데이터베이스 가져오기)
- 인프라(프로덕션): Hetzner VPS + Docker Compose + Caddy(HTTPS, `/api/*`는 FastAPI로 라우팅)

## 3. 환경 변수

- 프론트(로컬 `./.env.local`)

  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY (서버 액션용)
  - NEXT_PUBLIC_API_URL(기본 http://localhost:8000)

- 백엔드(로컬 `backend/.env`)

  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
  - GOOGLE_API_KEY
  - LLM_MODEL(기본 gemini-2.5-pro)
  - NOTION_API_KEY (선택사항, Notion 가져오기 기능 사용 시)

- 서버(프로덕션 `/<프로젝트경로>/.env` 예: `/systema-v3/.env`)
  - 위 공개/비공개 키 모두 + APP_DOMAIN, ACME_EMAIL
  - GitHub Actions에서 `ENV_FILE` 시크릿으로 전체 내용을 업로드할 수도 있습니다.

## 4. 데이터베이스 초기화

- Supabase: `backend/scripts/01-init-supabase.sql` 실행(문서/레이블 테이블과 RLS/정책 포함)
- Neo4j: `backend/scripts/02-init-neo4j.cypher` 실행(벡터 인덱스 768, 풀텍스트 인덱스 포함)

## 5. Notion 연동 설정 (선택사항)

Notion 데이터베이스에서 문서를 가져오려면:

1. **Notion Integration 생성**
   - https://www.notion.so/my-integrations 접속
   - "New integration" 클릭
   - 이름 설정 후 "Submit"
   - "Read content" 권한 활성화
   - Secret Token 복사

2. **환경 변수 설정**
   ```bash
   # backend/.env
   NOTION_API_KEY="secret_xxxxx"  # 복사한 Secret Token
   ```

3. **Notion 데이터베이스 공유**
   - 가져올 데이터베이스 페이지로 이동
   - 우측 상단 "..." 메뉴 클릭
   - "Connections" 선택
   - 생성한 Integration 추가

## 6. 로컬 개발(권장: Docker Compose)

동시 실행

```bash
docker compose -f deploy/docker-compose.dev.yml up
```

백그라운드 실행 + 로그 보기

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
docker compose -f deploy/docker-compose.dev.yml logs -f backend-dev next-dev
```

주의

- SSR에서 백엔드 호출은 컨테이너 내부 호스트(`backend-dev:8000`) 기준입니다.
- 코드 저장 시 백엔드는 자동 리로드(uvicorn --reload), 프론트는 Next dev 서버가 핫 리로드합니다.
- 개발용 `.env.local`에 `NEXT_PUBLIC_API_URL=http://localhost:8000`이 기본이며, dev compose가 프록시를 설정합니다.

## 7. 프로덕션 실행(Hetzner)

서버에 루트 `.env` 준비 후 실행 (Caddy/ACME용 `APP_DOMAIN`, `ACME_EMAIL` 포함)

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f backend next caddy | cat
```

Caddy가 자동으로 TLS(ACME)를 발급합니다. 도메인의 A 레코드를 서버 IP로 지정하세요.

## 8. CI/CD(GitHub Actions)

- CI: `.github/workflows/ci.yml` — PR/메인 푸시 시 프론트/백 빌드 확인(캐시 적용)
- Deploy: `.github/workflows/deploy.yml` — 메인 푸시/수동 실행 시 서버로 rsync → 서버에서 `docker compose up -d --build --force-recreate`

필수 Secrets(리포지토리 Settings → Actions → Secrets)

- HETZNER_SSH_KEY: 배포 전용 개인키(패스프레이즈 없음 권장)
- HOST: 서버 호스트/IP(예: 5.78.x.x)
- USER: ssh 유저(예: root)
- REMOTE_PATH: 예 `/systema-v3`
- (선택) ENV_FILE: 서버에 쓸 전체 `.env` 내용(멀티라인). 제공 시 서버에 `.env`로 저장됨

배포 흐름(간단): main에 push → Actions의 `Deploy`가 서버로 rsync → 서버에서 `--env-file .env`로 compose 빌드/재시작

## 9. RAG 플로우(개요)

- 문서 인제스트

  - 프론트에서 문서/메타데이터(레이블, 선택적 출처 링크)를 저장하면 Supabase에 기록됩니다.
  - 백엔드가 문서를 청킹합니다(한국어 최적화: 1024/128).
  - 각 청크를 임베딩(768차원)으로 변환하고 Neo4j 벡터 인덱스에 저장합니다.
  - 문서별 엔티티/관계를 추출해 지식 그래프에 기록합니다.
  - 문서 요약/테마를 생성해 Supabase에 업데이트합니다.

- 쿼리/응답

  - 사용자의 질문을 임베딩으로 변환해 벡터 검색을 수행합니다.
  - 동시에 풀텍스트 인덱스를 이용해 키워드 검색을 수행합니다.
  - 두 결과를 RRF(Reciprocal Rank Fusion)와 time-decay 가중치로 결합해 상위 컨텍스트를 선정합니다.
    - RRF 점수: `1/(60 + rank + 1)` (벡터 검색), `1.5/(60 + rank + 1)` (키워드 검색, 1.5배 가중치)
    - Time-decay: `exp(-0.05 * days_old)` (최신 문서에 더 높은 가중치)
    - 검색 임계값: 벡터 0.7, 키워드 0.5
  - LLM(Gemini)로 응답을 생성하며, 브라우저로 토큰 단위 스트리밍(SSE)합니다.
  - 응답 하단에 참조 문서를 문서 단위로 묶어 노출하며, 각 문서에는 출처 링크가 포함됩니다.

- 데이터 모델/인덱스 핵심
  - 벡터 차원은 768로 통일(임베딩·인덱스 일관성 유지)
  - 풀텍스트 인덱스는 청크 텍스트 필드를 대상으로 구성
  - 문서/청크/엔티티 간 관계를 유지해 문서별 그래프 탐색과 전체 그래프 조회를 모두 지원

- 문서 관리(CRUD)
  - **생성(Create)**: `/app/files/new` 페이지에서 문서 및 메타데이터(레이블, 출처 링크) 추가
  - **조회(Read)**: `/app/files` 페이지에서 문서 목록 확인, 상태별 필터링
  - **업데이트(Update)**: Rechunk 기능으로 청킹 파라미터 변경 후 재처리
  - **삭제(Delete)**: 문서 및 관련 데이터를 Neo4j와 Supabase에서 완전히 제거
  - 문서 상태 추적: PENDING → INGESTING → INGESTED (또는 FAILED)

## 10. API 엔드포인트

### 10.1. 채팅 및 검색

- `POST /api/chat` - 하이브리드 RAG 쿼리 처리 (SSE 스트리밍)

### 10.2. 문서 인제스트

- `POST /api/ingest` - 문서 수집 및 임베딩 시작
- `GET /api/ingest/{id}/details` - 청킹 결과 및 상세 정보 조회
- `GET /api/ingest/{id}/graph` - 문서별 지식 그래프 데이터 조회
- `POST /api/ingest/{id}/rechunk` - 문서 재처리 (청킹 파라미터 변경 시)
- `DELETE /api/ingest/{id}` - 문서 완전 삭제 (Neo4j 청크/엔티티 + Supabase 레코드)

### 10.3. Notion 가져오기

- `POST /api/ingest_from_notion` - Notion 데이터베이스에서 모든 페이지 가져오기
  - Body: `{ url: "https://notion.so/..." }` - 데이터베이스 URL
  - 모든 페이지를 PENDING 상태로 저장
- `POST /api/ingest_all_pending` - 대기 중인 모든 문서 일괄 처리
  - PENDING 상태의 모든 문서를 순차적으로 처리

### 10.4. 대시보드 및 그래프

- `GET /api/dashboard` - 대시보드 통계 (문서 수, 테마별 요약 등)
- `GET /api/graph/all` - 전체 지식 그래프 데이터 (노드/엣지 제한 옵션 가능)

## 11. 사용법

### 11.1. Notion에서 문서 가져오기

1. **파일 추가 페이지로 이동**
   - `/files/new` 페이지 접속
   - "Notion Database URL" 입력란 확인

2. **Notion URL 입력**
   - Notion 데이터베이스 페이지 URL 복사
   - 예: `https://notion.so/workspace/xxxxx`
   - URL 입력 후 "가져오기" 버튼 클릭

3. **일괄 처리**
   - `/files` 페이지로 이동
   - "모두 수집하기" 버튼 클릭
   - 모든 PENDING 상태 문서가 자동으로 처리됨

### 11.2. 커스텀 프롬프트 설정

1. **프롬프트 편집기 열기**
   - 채팅 패널 우측 상단 편집(✏️) 버튼 클릭
   - 프롬프트 관리 모달 창 열림

2. **프롬프트 작성 및 저장**
   - 원하는 시스템 프롬프트 입력
   - "저장하기" 버튼 클릭
   - 자동으로 버전 히스토리에 추가

3. **버전 관리**
   - 왼쪽 히스토리 패널에서 이전 버전 확인
   - 버전 클릭 시 이전 버전과의 차이점 확인
   - "이 버전으로 돌아가기" 버튼으로 복구 가능
   - 히스토리 항목 이름 변경 가능 (편집 아이콘 클릭)

4. **프롬프트 적용**
   - 저장된 프롬프트는 모든 질문에 자동으로 적용
   - 형식: `[저장된 프롬프트]\n\n질문: [사용자 입력]`

## 12. 운영 팁/문제 해결

- SSE가 작동하지 않을 때: 백엔드 포트/도메인, CORS, 브라우저 네트워크 탭 확인
- Neo4j 차원 불일치: 인덱스(768)와 임베딩(768) 일치 여부 확인
- 키워드 검색 오류: 풀텍스트 인덱스(`keyword`) 존재 및 대상 필드 확인
- 로그 보기: `docker compose ... logs -f`로 팔로우하면 Ctrl+C로 로그만 종료되고 컨테이너는 계속 동작합니다.

## 13. 보안/운영 권장

- 공개 레포의 Actions 로그는 공개됩니다. 시크릿은 마스킹되지만, 로그에 민감값을 출력하지 마세요.
- 배포는 전용 SSH 키(패스프레이즈 없음) 사용을 권장합니다.
- 운영 도메인에 대해서는 CORS/Origins를 필요한 도메인으로 제한하세요.
