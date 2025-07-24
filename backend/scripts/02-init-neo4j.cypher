// ===== Neo4j 완전 초기화 스크립트 =====
// 주의: 각 섹션을 개별적으로 실행하세요. 에러가 발생해도 다음 섹션을 계속 실행하세요.

// ===== 1단계: 기존 인덱스 먼저 삭제 =====
// 각 DROP INDEX 명령을 개별적으로 실행하세요
// 인덱스가 없어서 에러가 나도 무시하고 다음 명령을 실행하세요
DROP INDEX vector IF EXISTS;
DROP INDEX keyword IF EXISTS;
DROP INDEX document_id IF EXISTS;
DROP INDEX document_theme IF EXISTS;
DROP INDEX chunk_document_id IF EXISTS;
DROP INDEX entity_text_index IF EXISTS;

// ===== 2단계: 모든 데이터 삭제 =====
// 이 명령은 모든 노드와 관계를 삭제합니다
MATCH (n) DETACH DELETE n;

// ===== 3단계: 삭제 확인 =====
// 이 쿼리는 0을 반환해야 합니다. 0이 아니면 데이터가 남아있는 것입니다.
MATCH (n) RETURN count(n) as remaining_nodes;

// ===== 4단계: 제약조건 삭제 (있는 경우) =====
// 제약조건이 있으면 삭제합니다
DROP CONSTRAINT entity_unique IF EXISTS;

// ===== 5단계: 새로운 인덱스 생성 =====
// 새로운 벡터 인덱스 생성
CREATE VECTOR INDEX `vector` IF NOT EXISTS
FOR (c:Chunk) ON (c.embedding)
OPTIONS { indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

CREATE FULLTEXT INDEX `keyword` IF NOT EXISTS
FOR (c:Chunk) ON EACH [c.text];

CREATE INDEX document_id IF NOT EXISTS FOR (d:Document) ON (d.id);
CREATE INDEX document_theme IF NOT EXISTS FOR (d:Document) ON (d.theme);

CREATE INDEX chunk_document_id IF NOT EXISTS FOR (c:Chunk) ON (c.document_id);

CREATE FULLTEXT INDEX entity_text_index IF NOT EXISTS FOR (n:Entity) ON EACH [n.id];

// Document 노드용 벡터 인덱스 (3072 차원)
CREATE VECTOR INDEX `document_embeddings` IF NOT EXISTS
FOR (d:Document) ON (d.embedding) 
OPTIONS { indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

// ===== 6단계: 인덱스 확인 =====
SHOW INDEXES;

// ===== 6.5단계: Document 노드 예제 구조 =====
// Document 노드는 다음과 같은 속성을 가져야 합니다:
// CREATE (d:Document {
//   id: 'document_uuid',
//   title: '문서 제목',
//   theme: '개발',
//   created_at: datetime(),
//   reference_urls: []
// });

// ===== 7단계: 디버깅 쿼리 (인덱싱 후 사용) =====
// Document 노드 구조 확인 (title 속성 포함)
MATCH (d:Document)
RETURN d.id, d.title, d.theme, d.created_at
LIMIT 5;

// Chunk-Document 관계 확인
MATCH (c:Chunk)-[:BELONGS_TO]->(d:Document)
RETURN c.id as chunk_id, d.id as doc_id, d.title as doc_title
LIMIT 10;

// 문서별 엔티티 수 확인
MATCH (d:Document {id: 'your_document_id'})
MATCH (e:Entity)
WHERE e.document_id = d.id OR 
      EXISTS {
        MATCH (e)-[r]-(other)
        WHERE other.document_id = d.id
      }
RETURN d.id, d.title, count(DISTINCT e) as entity_count;

// 모든 엔티티와 연결 정보 확인
MATCH (e:Entity)
WITH e, 
     CASE WHEN e.document_id IS NOT NULL THEN [e.document_id] ELSE [] END as direct_docs
OPTIONAL MATCH (e)-[r]-(other)
WHERE other.document_id IS NOT NULL
WITH e, direct_docs + collect(DISTINCT other.document_id) as all_docs
RETURN e.id, e.name, all_docs as documents; 