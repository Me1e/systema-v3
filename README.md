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

\`\`\`.env.local

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

# (옵션) OpenAI API 키

# OPENAI_API_KEY="sk-..."

# API URL (백엔드 서버 주소)

NEXT_PUBLIC_API_URL=http://localhost:8000
\`\`\`

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

1. **백엔드 서버 실행** (먼저 실행):

   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

2. **프론트엔드 서버 실행** (별도 터미널):

   ```bash
   pnpm install
   pnpm dev
   ```

3. 브라우저에서 http://localhost:3000 접속

### 3.4. 프로덕션 인프라 개요 (Hetzner)

- Caddy(80/443) → path 기반 라우팅: `/api/*` → FastAPI(backend:8000), 그 외 → Next(next:3000)
- Docker Compose 서비스: `next`, `backend`, `caddy`
- 환경: 서버 루트 `.env`에 공개/비밀키 분리 관리 (예: `APP_DOMAIN`, `ACME_EMAIL`, `SUPABASE_*`, `NEO4J_*`, `GOOGLE_API_KEY`)
- 빌드: `deploy/Dockerfile.next`, `deploy/Dockerfile.backend`
- 실행: `docker compose -f deploy/docker-compose.yml up -d --build`

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
