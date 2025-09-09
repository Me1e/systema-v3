# Project SYSTEMA: 지능형 한국어 데이터 인터페이스

## 1. 프로젝트 개요

한국어 회의록을 위한 지능형 인터페이스입니다. Python FastAPI + LlamaIndex로 하이브리드 RAG(벡터 + 지식 그래프)를 구현하고, Next.js 프론트에서 실시간 스트리밍(SSE)로 응답을 보여줍니다.

## 2. 아키텍처/기술 스택

- 프론트엔드: Next.js 15, React 19, Tailwind, Radix UI
- 백엔드: FastAPI, LlamaIndex
- LLM: Google Gemini 2.5 Pro Latest
- 임베딩: Gemini embedding-001(768 차원)
- 데이터베이스: Supabase(PostgreSQL), Neo4j AuraDB
- 실시간: SSE(서버→브라우저)
- 인프라(프로덕션): Hetzner VPS + Docker Compose + Caddy(HTTPS, `/api/*`는 FastAPI로 라우팅)

## 3. 환경 변수

- 프론트(로컬 `./.env.local`)

  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - NEXT_PUBLIC_API_URL(기본 http://localhost:8000)

- 백엔드(로컬 `backend/.env`)

  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
  - GOOGLE_API_KEY
  - LLM_MODEL(기본 gemini-2.5-pro)

- 서버(프로덕션 `/<프로젝트경로>/.env` 예: `/systema-v3/.env`)
  - 위 공개/비공개 키 모두 + APP_DOMAIN, ACME_EMAIL
  - GitHub Actions에서 `ENV_FILE` 시크릿으로 전체 내용을 업로드할 수도 있습니다.

## 4. 데이터베이스 초기화

- Supabase: `backend/scripts/01-init-supabase.sql` 실행(문서/레이블 테이블과 RLS/정책 포함)
- Neo4j: `backend/scripts/02-init-neo4j.cypher` 실행(벡터 인덱스 768, 풀텍스트 인덱스 포함)

## 5. 로컬 개발(권장: Docker Compose)

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

## 6. 프로덕션 실행(Hetzner)

서버에 루트 `.env` 준비 후 실행 (Caddy/ACME용 `APP_DOMAIN`, `ACME_EMAIL` 포함)

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f backend next caddy | cat
```

Caddy가 자동으로 TLS(ACME)를 발급합니다. 도메인의 A 레코드를 서버 IP로 지정하세요.

## 7. CI/CD(GitHub Actions)

- CI: `.github/workflows/ci.yml` — PR/메인 푸시 시 프론트/백 빌드 확인(캐시 적용)
- Deploy: `.github/workflows/deploy.yml` — 메인 푸시/수동 실행 시 서버로 rsync → 서버에서 `docker compose up -d --build --force-recreate`

필수 Secrets(리포지토리 Settings → Actions → Secrets)

- HETZNER_SSH_KEY: 배포 전용 개인키(패스프레이즈 없음 권장)
- HOST: 서버 호스트/IP(예: 5.78.x.x)
- USER: ssh 유저(예: root)
- REMOTE_PATH: 예 `/systema-v3`
- (선택) ENV_FILE: 서버에 쓸 전체 `.env` 내용(멀티라인). 제공 시 서버에 `.env`로 저장됨

배포 흐름(간단): main에 push → Actions의 `Deploy`가 서버로 rsync → 서버에서 `--env-file .env`로 compose 빌드/재시작

## 8. RAG 플로우(개요)

- 문서 인제스트

  - 프론트에서 문서/메타데이터(레이블, 선택적 출처 링크)를 저장하면 Supabase에 기록됩니다.
  - 백엔드가 문서를 청킹합니다(한국어 최적화: 1024/128).
  - 각 청크를 임베딩(768차원)으로 변환하고 Neo4j 벡터 인덱스에 저장합니다.
  - 문서별 엔티티/관계를 추출해 지식 그래프에 기록합니다.
  - 문서 요약/테마를 생성해 Supabase에 업데이트합니다.

- 쿼리/응답

  - 사용자의 질문을 임베딩으로 변환해 벡터 검색을 수행합니다.
  - 동시에 풀텍스트 인덱스를 이용해 키워드 검색을 수행합니다.
  - 두 결과를 RRF로 결합해 상위 컨텍스트를 선정합니다.
  - LLM(Gemini)로 응답을 생성하며, 브라우저로 토큰 단위 스트리밍(SSE)합니다.
  - 응답 하단에 참조 문서를 문서 단위로 묶어 노출하며, 각 문서에는 출처 링크가 포함됩니다.

- 데이터 모델/인덱스 핵심
  - 벡터 차원은 768로 통일(임베딩·인덱스 일관성 유지)
  - 풀텍스트 인덱스는 청크 텍스트 필드를 대상으로 구성
  - 문서/청크/엔티티 간 관계를 유지해 문서별 그래프 탐색과 전체 그래프 조회를 모두 지원

## 9. 운영 팁/문제 해결

- SSE가 작동하지 않을 때: 백엔드 포트/도메인, CORS, 브라우저 네트워크 탭 확인
- Neo4j 차원 불일치: 인덱스(768)와 임베딩(768) 일치 여부 확인
- 키워드 검색 오류: 풀텍스트 인덱스(`keyword`) 존재 및 대상 필드 확인
- 로그 보기: `docker compose ... logs -f`로 팔로우하면 Ctrl+C로 로그만 종료되고 컨테이너는 계속 동작합니다.

## 10. 보안/운영 권장

- 공개 레포의 Actions 로그는 공개됩니다. 시크릿은 마스킹되지만, 로그에 민감값을 출력하지 마세요.
- 배포는 전용 SSH 키(패스프레이즈 없음) 사용을 권장합니다.
- 운영 도메인에 대해서는 CORS/Origins를 필요한 도메인으로 제한하세요.

# Project SYSTEMA: 지능형 한국어 데이터 인터페이스

## 1. 프로젝트 개요

Project SYSTEMA는 한국어 회의록을 위한 지능형 인터페이스를 제공하는 풀스택 애플리케이션입니다. 이 시스템의 핵심은 Python 백엔드와 `llama-index`로 조율된 하이브리드 RAG(Retrieval-Augmented Generation) 챗봇으로, 시맨틱 벡터 검색과 구조화된 지식 그래프 쿼리를 결합하여 매우 정확하고 맥락에 맞는 답변을 제공합니다.

## 2. 기술 스택

- **웹 프레임워크 (프론트엔드)**: Next.js 15.2.4, React 19
- **백엔드 API**: Python (FastAPI)
- **오케스트레이션**: LlamaIndex
- **UI 및 스타일링**: React & Tailwind CSS, Radix UI
- **LLM (생성 및 추출)**: Google Gemini 2.5 Pro Latest
- **LLM (임베딩)**: Google Gemini `embedding-001` (768 dimensions)
- **애플리케이션 DB**: Supabase (PostgreSQL)
- **벡터 & 그래프 DB**: Neo4j AuraDB
- **실시간 통신**: Server-Sent Events (SSE)
- **그래프 시각화**: React Flow, Dagre.js, D3-force

## 3. 실행 및 테스트 방법

### 3.1. 환경 변수 설정

프로젝트를 실행하려면 **Supabase**, **Neo4j**, **Google (Gemini)**의 접속 정보 및 API 키가 필요합니다. 프로젝트 루트에 `.env.local` 파일을 생성하고 아래 내용을 **실제 유효한 값으로** 채워주세요.

**중요**: `TypeError: fetch failed` 와 같은 에러는 대부분 아래 환경 변수가 잘못 설정되었을 때 발생합니다.

```.env.local

# Supabase 접속 정보 (Project Settings > API > Project URL and Service Role Key)

NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-supabase-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<your-supabase-service-role-key>"

# Neo4j 접속 정보 (AuraDB Console > Connect > Connection details)

NEO4J_URI="neo4j+s://<your-db-id>.databases.neo4j.io"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="<your-neo4j-password>"

# Google Gemini API 키 (Google AI Studio에서 생성)

GOOGLE_API_KEY="your-google-api-key"

# API URL (백엔드 서버 주소)

NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3.2. 데이터베이스 초기화

1. **Supabase 테이블 생성**:

   ```bash
   # backend/scripts/01-init-supabase.sql 파일을 Supabase SQL Editor에서 실행
   ```

2. **Neo4j 인덱스 생성**:
   ```bash
   # backend/scripts/02-init-neo4j.cypher 파일을 Neo4j Browser에서 실행
   ```

### 3.3. 서비스 실행 (개발)

- Docker Compose(dev)로 동시 실행/로그 워치

```bash
docker compose -f deploy/docker-compose.dev.yml up
# 또는 백그라운드 실행 + 로그 보기
docker compose -f deploy/docker-compose.dev.yml up -d
docker compose -f deploy/docker-compose.dev.yml logs -f backend-dev next-dev | cat
```

### 3.4. 프로덕션 인프라 개요 (Hetzner)

- Caddy(80/443) → path 기반 라우팅: `/api/*` → FastAPI(backend:8000), 그 외 → Next(next:3000)
- Docker Compose 서비스: `next`, `backend`, `caddy`
- 환경: 서버 루트 `.env`에 공개/비밀키 분리 관리 (예: `APP_DOMAIN`, `ACME_EMAIL`, `SUPABASE_*`, `NEO4J_*`, `GOOGLE_API_KEY`)
- 빌드: `deploy/Dockerfile.next`, `deploy/Dockerfile.backend`
- 실행: `docker compose --env-file .env -f deploy/docker-compose.yml up -d --build`

## 4. 주요 기능

### 4.1. 문서 관리

- 회의록 문서 추가 및 메타데이터(레이블) 관리
- 문서 상태 추적: PENDING → INGESTING → INGESTED

### 4.2. 지능형 검색

- **하이브리드 RAG**: 벡터 검색 + 지식 그래프 쿼리 결합
- **소스 인용**: 모든 답변에 참조 문서 표시
- **실시간 스트리밍**: SSE를 통한 실시간 응답 생성

### 4.3. 시각화

- **대시보드**: 타임라인 및 테마별 작업 요약
- **청킹 시각화**: 문서가 어떻게 분할되었는지 확인
- **지식 그래프**: 추출된 엔티티와 관계 시각화
  - **전체 그래프 보기**: 시스템 전체의 지식 그래프 탐색
  - **레이아웃 옵션**: Force (자연스러운 네트워크) / Dagre (계층적)
  - **연결성 기반 배치**: 고립 노드는 가장자리, 연결 많은 노드는 중심부

## 5. 아키텍처 특징

### 5.1. 직접 API 연결

- Next.js 프록시를 거치지 않고 클라이언트에서 FastAPI 서버로 직접 연결
- 실시간 SSE 스트리밍이 버퍼링 없이 작동
- CORS 설정으로 크로스 오리진 요청 허용

### 5.2. 스트리밍 응답

- 질문 분석 → 검색 → 생성 단계를 실시간으로 표시
- Gemini, Claude와 같은 타이핑 효과로 응답 표시
- 상태별 애니메이션 아이콘 표시

### 5.3. API 엔드포인트

- `/api/chat` - 채팅 쿼리 처리 (SSE 스트리밍)
- `/api/ingest` - 문서 인덱싱
- `/api/ingest/{id}/details` - 청킹 결과 시각화
- `/api/ingest/{id}/graph` - 문서별 지식 그래프
- `/api/dashboard` - 대시보드 통계
- `/api/graph/all` - 전체 지식 그래프 (제한 옵션 포함)

## 6. 문제 해결

### 6.1. SSE 스트리밍이 작동하지 않을 때

- 백엔드 서버가 실행 중인지 확인 (http://localhost:8000)
- 브라우저 개발자 도구에서 네트워크 탭 확인
- CORS 에러가 있는지 콘솔 확인

### 6.2. 데이터베이스 연결 실패

- 환경 변수가 올바르게 설정되었는지 확인
- Neo4j와 Supabase 서비스가 활성화되어 있는지 확인
- 네트워크 연결 상태 확인

## 7. 향후 개선 사항

- 청킹/쿼리 성능 최적화
- 작업 단위 명확화 및 요약 형태 개선
- 프로덕션을 위한 보안 강화 (CORS 제한 등)
