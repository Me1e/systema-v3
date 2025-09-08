# Project SYSTEMA 설치 및 실행 가이드

## 사전 요구사항

1. **Python 3.11 또는 3.12** (3.13은 호환성 문제가 있음)
2. **Node.js 18.17 이상**
3. **pnpm** (Node.js 패키지 매니저)
4. **Neo4j AuraDB** 계정
5. **Supabase** 계정
6. **Google Cloud** 계정 (Gemini API)
7. (옵션) **OpenAI** 계정

## 1. (선택) 백엔드를 로컬에서 직접 실행할 때만

Docker Compose(dev)를 사용하는 경우 이 섹션은 건너뛰세요. 컨테이너 없이 백엔드를 직접 띄워야 할 때만 아래를 실행합니다.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 2. 환경 변수 설정

### 프로젝트 루트에 `.env.local` 파일 생성 (프론트 공개값만)

```bash
# Supabase 설정 (Project Settings > API에서 확인)
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
NEXT_PUBLIC_API_URL=http://localhost:8000

# Neo4j AuraDB 설정 (Connection details에서 확인)
NEO4J_URI=neo4j+s://[your-instance].databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[your-password]

# 백엔드 비밀키는 backend/.env에만 둡니다.
```

### 백엔드용 `.env` 파일 생성 (`backend/.env`)

```bash
# 위와 동일한 내용 복사 (NEXT_PUBLIC_ 접두사 제거)
SUPABASE_URL=https://[your-project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
NEO4J_URI=neo4j+s://[your-instance].databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[your-password]
GOOGLE_API_KEY=[your-google-api-key]
OPENAI_API_KEY=sk-[your-openai-key]

# 추가 설정
LLM_MODEL=gemini-2.5-pro-latest
EMBEDDING_MODEL=models/embedding-001
```

## 3. 데이터베이스 초기화

### Supabase 테이블 생성

1. Supabase 대시보드에서 SQL Editor 열기
2. `backend/scripts/01-init-supabase.sql` 내용 실행

### Neo4j 인덱스 생성

1. Neo4j Browser 또는 Aura Console 열기
2. `backend/scripts/02-init-neo4j.cypher` 내용 실행
   - 주의: Entity 레이블 사용 (이전 버전의 `__Entity__`가 아님)

## 4. 프론트엔드 설정

```bash
# 프로젝트 루트에서
pnpm install
```

## 5. 애플리케이션 실행 (Docker Compose - 권장)

```bash
docker compose -f deploy/docker-compose.dev.yml up
# 또는 백그라운드 실행 후 로그
docker compose -f deploy/docker-compose.dev.yml up -d
docker compose -f deploy/docker-compose.dev.yml logs -f backend-dev next-dev | cat
```

## 6. 애플리케이션 사용

1. 브라우저에서 http://localhost:3000 접속
2. 상단의 "파일 추가" 버튼 클릭
3. 회의록 텍스트 붙여넣기 및 레이블 추가
4. 저장 후 "수집 시작" 버튼 클릭
5. "결과 보기"로 청킹 및 그래프 추출 결과 확인
   - Force 레이아웃으로 자연스러운 네트워크 시각화
   - 연결성 기반 노드 배치 (고립 노드는 가장자리에)
6. 메인 페이지에서 챗봇으로 질문
7. "전체 지식 그래프" 버튼으로 전체 그래프 탐색

## 문제 해결

### Python 패키지 설치 오류

```bash
# requirements.txt 수정 (Python 3.13 사용 시)
# llama-index-vector-stores-neo4j 라인 제거
# 대신 rag_service.py에서 Neo4jVectorStore 직접 구현 사용
```

### CORS 오류

백엔드가 http://localhost:8000 에서 실행 중인지 확인

### Neo4j 연결 오류

- URI가 `neo4j+s://` 로 시작하는지 확인 (AuraDB는 SSL 필수)
- 방화벽/네트워크 설정 확인

## 개발 팁

1. **로그 확인**: Docker Compose 로그를 실시간으로 확인 (`logs -f`)
2. **Neo4j Browser**: 데이터가 제대로 저장되는지 Cypher 쿼리로 확인
3. **Supabase 대시보드**: documents 테이블에서 상태 변화 모니터링

## 프로덕션 배포

1. **인프라**: Hetzner + Docker Compose + Caddy(80/443, `/api/*` → backend:8000)
2. **실행**: `docker compose -f deploy/docker-compose.yml up -d --build`
3. **환경변수**: 서버 루트 `.env`로 관리 (공개/비공개 분리)
