# Project SYSTEMA 설치 및 실행 가이드

## 사전 요구사항

1. **Python 3.11 또는 3.12** (3.13은 호환성 문제가 있음)
2. **Node.js 18.17 이상**
3. **pnpm** (Node.js 패키지 매니저)
4. **Neo4j AuraDB** 계정
5. **Supabase** 계정
6. **Google Cloud** 계정 (Gemini API)
7. (옵션) **OpenAI** 계정

## 1. Python 환경 설정

Python 3.11 또는 3.12 버전이 필요합니다. 가상환경(`venv`)은 특정 버전의 Python을 새로 설치하는 도구가 아니므로, 먼저 시스템에 원하는 버전의 Python 인터프리터를 설치해야 합니다.

`pyenv`를 사용하면 시스템의 기본 Python 설정을 변경하지 않고 여러 Python 버전을 손쉽게 관리할 수 있어 권장됩니다.

### 1.1. `pyenv`를 사용한 Python 설치 및 가상환경 설정 (권장)

```bash
# 1. pyenv 설치 (아직 설치하지 않은 경우)
brew install pyenv

# 2. pyenv를 통해 Python 3.11.9 설치
pyenv install 3.11.9

# 3. backend 디렉토리로 이동
cd backend

# 4. 해당 디렉토리에서 사용할 Python 버전을 3.11.9로 지정
pyenv local 3.11.9

# 5. 가상환경 생성 (pyenv local로 버전이 지정되었으므로 'python' 사용)
python -m venv venv

# 6. 가상환경 활성화
source venv/bin/activate  # macOS/Linux
# Windows: venv\Scripts\activate
```

### 1.2. `Homebrew`를 사용한 설치 (대안)

`pyenv`를 사용하지 않고 Homebrew로 직접 Python 3.11을 설치할 수도 있습니다.

```bash
# 1. Homebrew로 Python 3.11 설치
brew install python@3.11

# 2. backend 디렉토리로 이동
cd backend

# 3. 설치된 python3.11을 이용해 가상환경 생성
python3.11 -m venv venv

# 4. 가상환경 활성화
source venv/bin/activate  # macOS/Linux
# Windows: venv\Scripts\activate
```

### 1.3. Python 의존성 설치

가상환경이 활성화된 상태에서 아래 명령어를 실행하여 필요한 패키지를 설치합니다.

```bash
pip install --upgrade pip
pip install -r requirements.txt
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

### 주요 프론트엔드 의존성

- **React Flow**: 지식 그래프 시각화를 위한 노드 기반 UI 라이브러리
- **@dagrejs/dagre**: 계층적 그래프 레이아웃 알고리즘
- **d3-force**: 물리 시뮬레이션 기반 그래프 레이아웃
- **d3-scale**: D3.js의 스케일 유틸리티

## 5. 애플리케이션 실행

### 터미널 1: 백엔드 실행

```bash
cd backend
source venv/bin/activate  # 가상환경 활성화
uvicorn app.main:app --reload --port 8000
```

### 터미널 2: 프론트엔드 실행

```bash
# 프로젝트 루트에서
pnpm dev
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

1. **로그 확인**: 백엔드 터미널에서 상세 로그 확인 가능
2. **Neo4j Browser**: 데이터가 제대로 저장되는지 Cypher 쿼리로 확인
3. **Supabase 대시보드**: documents 테이블에서 상태 변화 모니터링

## 프로덕션 배포

1. **프론트엔드**: Vercel에 배포 (자동)
2. **백엔드**:
   - Docker 컨테이너화 권장
   - Cloud Run, AWS Lambda, 또는 전용 서버 사용
   - 환경변수는 각 플랫폼의 시크릿 관리 기능 사용
