# RAG 시스템 아키텍처 문서

## 목차

1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [Ingestion 프로세스](#ingestion-프로세스)
4. [Query 프로세스](#query-프로세스)
5. [기술적 구현 세부사항](#기술적-구현-세부사항)
6. [최적화 전략](#최적화-전략)
7. [참고 문헌](#참고-문헌)

## 개요

Project SYSTEMA는 한국어 회의록 처리를 위한 지능형 데이터 인터페이스로, 최신 하이브리드 RAG(Retrieval-Augmented Generation) 접근법을 구현합니다. 의미적 벡터 검색과 구조화된 지식 그래프 쿼리를 결합하여 높은 정확도와 맥락 이해를 제공합니다.

### 핵심 특징

- **진정한 하이브리드 검색**: 벡터 유사도와 키워드 매칭의 결합
- **한국어 최적화**: 한국어 문서 특성에 맞춘 청킹 및 인덱싱
- **지식 그래프 통합**: 엔티티와 관계 추출을 통한 구조화된 지식 저장
- **실시간 스트리밍**: SSE를 활용한 빠른 응답 제공

## 시스템 아키텍처

### 기술 스택

- **백엔드**: Python FastAPI, LlamaIndex
- **LLM**: Google Gemini 2.5 Pro Latest
- **임베딩**: Gemini embedding-001 (768 dimensions)
- **데이터베이스**:
  - Neo4j AuraDB (벡터 저장, 풀텍스트 인덱스, 지식 그래프)
  - Supabase PostgreSQL (문서 메타데이터)
- **프론트엔드**: Next.js 15.2.4, React 19

### 데이터 플로우

```
문서 업로드 → Ingestion → Neo4j 저장 → 하이브리드 검색 → LLM 응답 생성
```

## Ingestion 프로세스

### 1. 문서 전처리

```python
# 청킹 설정
node_parser = SentenceSplitter(chunk_size=1024, chunk_overlap=128)
```

- **청크 크기**: 1024 토큰 (한국어 문맥 보존에 최적)
- **오버랩**: 128 토큰 (문맥 단절 방지)

### 2. 임베딩 생성

```python
from llama_index.embeddings.gemini import GeminiEmbedding
embed_model = GeminiEmbedding(
    model_name="models/embedding-001"
)
```

- Gemini 임베딩 사용(기본 768차원)
- 한국어 문서에 대해 비용 효율성과 성능의 균형

### 3. 벡터 저장

```python
neo4j_vector_store = Neo4jVectorStore(
    embedding_dimension=768,
    database="neo4j"
)
```

- Neo4j의 벡터 인덱스 활용
- HNSW 알고리즘으로 빠른 근사 최근접 이웃 검색

### 4. 지식 그래프 추출

```python
kg_index = KnowledgeGraphIndex.from_documents(
    documents,
    max_triplets_per_chunk=10,
    kg_triple_extract_template="한국어 회의록 특화 템플릿"
)
```

- 청크당 최대 10개의 (주체, 관계, 객체) 트리플렛 추출
- 회의록의 의사결정, 역할, 책임 관계에 초점

### 5. 풀텍스트 인덱싱

- Neo4j fulltext 인덱스에 원본 텍스트 저장
- 한국어 형태소 분석 지원

## Query 프로세스

### 하이브리드 검색 구현

#### 1. 벡터 검색 (Semantic Search)

```cypher
CALL db.index.vector.queryNodes('vector', $k, $embedding)
YIELD node, score
WHERE node:Chunk
RETURN node, score
ORDER BY score DESC
```

- 질문을 임베딩으로 변환
- 코사인 유사도 기반 매칭

#### 2. 키워드 검색 (Lexical Search)

```cypher
CALL db.index.fulltext.queryNodes('keyword', $query, {limit: $limit})
YIELD node, score
WHERE node:Chunk
RETURN node, score
ORDER BY score DESC
```

- BM25 알고리즘 기반 텍스트 매칭
- 정확한 용어 매칭에 효과적

#### 3. RRF (Reciprocal Rank Fusion)

```python
def calculate_rrf_score(rank, k=60):
    return 1.0 / (k + rank + 1)

# 두 검색 결과 통합
for rank, (node, score) in enumerate(vector_results):
    rrf_scores[node_id] = rrf_scores.get(node_id, 0) + calculate_rrf_score(rank)

for rank, (node, score) in enumerate(keyword_results):
    rrf_scores[node_id] = rrf_scores.get(node_id, 0) + calculate_rrf_score(rank)
```

### 응답 생성

```python
response = synthesizer.synthesize(
    query=query_bundle,
    nodes=retrieved_nodes
)
```

- 검색된 컨텍스트와 함께 LLM에 전달
- 스트리밍 응답으로 사용자 경험 향상

## 기술적 구현 세부사항

### Neo4j 인덱스 구조

```cypher
// 벡터 인덱스
CREATE VECTOR INDEX vector IF NOT EXISTS
FOR (c:Chunk) ON (c.embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}}

// 풀텍스트 인덱스
CREATE FULLTEXT INDEX keyword IF NOT EXISTS
FOR (c:Chunk)
ON EACH [c.text, c._node_content]
```

### 엔티티 격리

- 각 엔티티에 `document_id` 속성 추가
- 문서별 독립적인 지식 그래프 구성
- 크로스 문서 검색 시 관계 유지

## 최적화 전략

### 1. 한국어 특화 최적화

- **청킹 크기**: 한국어 문장 구조를 고려한 1024 토큰
- **오버랩**: 조사와 어미 변화를 고려한 128 토큰
- **메타데이터 추출**: 날짜, 참석자, 발표자 등 회의록 특화 정보

### 2. 성능 최적화

- **배치 임베딩**: 문서 전체를 한 번에 처리
- **비동기 처리**: FastAPI의 비동기 엔드포인트 활용
- **캐싱**: LRU 캐시로 Neo4j 드라이버 재사용

### 3. 검색 정확도 향상

- **하이브리드 접근**: 의미적 유사성과 정확한 매칭의 균형
- **RRF k값**: 60으로 설정하여 다양한 결과 포함
- **상위 k 조정**: 벡터/키워드 각각 2\*k개 검색 후 RRF 적용

## 참고 문헌

### 실제 구현에 직접 사용된 레퍼런스

#### LlamaIndex 공식 문서

1. **LlamaIndex Core Documentation**

   - https://docs.llamaindex.ai/en/stable/
   - 실제 사용 모듈:
     - `VectorStoreIndex`: 벡터 인덱싱 및 검색 (`from llama_index.core import VectorStoreIndex`)
     - `KnowledgeGraphIndex`: 지식 그래프 추출 (`from llama_index.core import KnowledgeGraphIndex`)
     - `SentenceSplitter`: 문서 청킹 (chunk_size=1024, chunk_overlap=128)
     - `StorageContext`: 저장소 컨텍스트 관리

2. **LlamaIndex OpenAI Integration** <- gemini로 바뀜
   - `llama_index.embeddings.openai.OpenAIEmbedding`
   - `llama_index.llms.gemini.Gemini` (LLM은 Gemini 사용)
   - 실제 설정: `model="gemini.."` (768 dimensions)

#### Neo4j 공식 문서

3. **Neo4j Vector Search**

   - https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/
   - 실제 사용 쿼리:

   ```cypher
   CALL db.index.vector.queryNodes('vector', $k, $embedding)
   YIELD node, score
   ```

4. **Neo4j Full-text Search**
   - https://neo4j.com/docs/cypher-manual/current/indexes-for-full-text-search/
   - 실제 사용 쿼리:
   ```cypher
   CALL db.index.fulltext.queryNodes('keyword', $query, {limit: $limit})
   ```

#### Gemini API

5. **Gemini Embeddings Documentation**
   - https://ai.google.dev/gemini-api/docs/embeddings
   - 실제 사용: `gemini-embedding-001` 모델
   - 차원: 기본 768 (다른 차원도 지원하나 본 프로젝트는 768 고정)

#### FastAPI

6. **FastAPI Streaming Response**
   - https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse
   - SSE (Server-Sent Events) 구현에 사용

### 알고리즘 참고 자료

7. **RRF (Reciprocal Rank Fusion) 알고리즘**
   - 원논문: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods" (2009)
   - 저자: Gordon V. Cormack, Charles L. A. Clarke, Stefan Büttcher
   - 실제 구현:
   ```python
   rrf_score = 1.0 / (k + rank + 1)  # k=60
   ```
   - 참고: 원논문의 알고리즘을 직접 구현했으나, 논문 자체는 직접 참조하지 않음

### 배경 지식 및 베스트 프랙티스

8. **RAG 시스템 설계**

   - "Retrieval-Augmented Generation for Large Language Models: A Survey" (2023)
   - https://arxiv.org/abs/2312.10997
   - 참고: 하이브리드 검색의 중요성과 청킹 전략

9. **하이브리드 검색**
   - "An Analysis of Fusion Functions for Hybrid Retrieval" (2022)
   - https://arxiv.org/abs/2210.11934
   - 참고: 벡터 검색과 키워드 검색의 결합 방법

### 구현 세부사항

본 프로젝트의 구현은 위 레퍼런스들을 기반으로 하여:

- **청킹**: 1024 토큰 (한국어 문맥 보존)
- **오버랩**: 128 토큰 (문맥 단절 방지)
- **RRF k값**: 60 (다양한 결과 포함)
- **하이브리드 검색**: 벡터 + 키워드 검색 후 RRF 적용

### 레퍼런스 검증 노트

이 문서의 모든 레퍼런스는 실제 구현 시 직접 사용했거나 참고한 자료들입니다:

- **"실제 구현에 직접 사용된 레퍼런스"** 섹션은 코드에서 직접 import하거나 호출한 API들입니다
- **"알고리즘 참고 자료"** 섹션은 구현 로직의 기반이 된 알고리즘입니다
- **"배경 지식"** 섹션은 설계 결정을 내릴 때 참고한 자료들입니다

모든 링크는 2025년 1월 기준으로 검증되었습니다.

---

_이 문서는 Project SYSTEMA의 RAG 시스템 구현을 정확히 반영합니다._
