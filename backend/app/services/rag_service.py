import os
import logging
import json
from functools import lru_cache
from datetime import datetime
import math

from llama_index.core import (
    VectorStoreIndex,
    StorageContext,
    SimpleDirectoryReader,
    Document,
    Settings as LlamaSettings,
    KnowledgeGraphIndex, # 추가
)
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.gemini import GeminiEmbedding
from llama_index.llms.gemini import Gemini
try:
    # 2025 라이브러리: genai.configure 필요시 대비
    import google.generativeai as genai
    _HAS_GOOGLE_GENAI = True
except Exception:
    _HAS_GOOGLE_GENAI = False
from llama_index.vector_stores.neo4jvector import Neo4jVectorStore
from llama_index.graph_stores.neo4j import Neo4jGraphStore # 추가

from supabase import create_client, Client
from neo4j import GraphDatabase

from app.core.config import settings

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ---- 클라이언트 초기화 ----
try:
    # Supabase 클라이언트 초기화
    supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    # logging.info("Supabase 클라이언트 초기화 성공")
except Exception as e:
    logging.error(f"Supabase 클라이언트 초기화 실패: {e}")
    supabase_client = None

# Neo4j 드라이버는 Neo4jVectorStore가 내부적으로 생성하므로, 여기서 미리 만들 필요가 없습니다.
# 하지만 대시보드 등 다른 서비스에서 직접 쿼리를 위해 드라이버가 필요할 수 있습니다.
@lru_cache(maxsize=None)
def get_neo4j_driver():
    """
    Neo4j 드라이버 인스턴스를 생성하고 반환합니다.
    @lru_cache를 사용하여 드라이버가 애플리케이션 수명 동안 한 번만 생성되도록 합니다.
    """
    # logging.info("Neo4j 드라이버 생성 시도...")
    try:
        driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
        )
        # 연결 확인
        driver.verify_connectivity()
        # logging.info("Neo4j 드라이버 생성 및 연결 확인 완료")
        return driver
    except Exception as e:
        logging.error(f"Neo4j 드라이버 생성 실패: {e}", exc_info=True)
        return None

# ---- LlamaIndex 전역 설정 ----
@lru_cache(maxsize=None)
def initialize_rag_settings():
    """
    RAG 파이프라인에 필요한 LLM, 임베딩 모델, 청크 파서, 벡터/그래프 저장소를 초기화하고
    LlamaIndex의 전역 설정으로 지정합니다.
    """
    # logging.info("RAG 설정 초기화 시작...")
    
    # 보강: 일부 환경에서 GOOGLE_API_KEY 인식 문제 대비하여 사전 구성
    if _HAS_GOOGLE_GENAI and settings.GOOGLE_API_KEY:
        try:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
        except Exception:
            pass
    llm = Gemini(model_name=settings.LLM_MODEL, api_key=settings.GOOGLE_API_KEY)

    # Gemini 임베딩(기본 768차원) 사용 - 초기화 시 외부 호출 없음
    embed_model = GeminiEmbedding(
        model_name="models/embedding-001",
        api_key=settings.GOOGLE_API_KEY,
    )
    logging.info("Embedding model configured: Gemini embedding-001 (768 dims)")
    node_parser = SentenceSplitter(chunk_size=1024, chunk_overlap=128)  # 청크 사이즈 최적화 (한국어 회의록용)

    LlamaSettings.llm = llm
    LlamaSettings.embed_model = embed_model
    LlamaSettings.node_parser = node_parser
    
    # logging.info("LlamaIndex 전역 LLM, 임베딩 모델, 노드 파서 설정 완료")

    # 벡터 저장을 위한 Neo4jVectorStore
    neo4j_vector_store = Neo4jVectorStore(
        url=settings.NEO4J_URI,
        username=settings.NEO4J_USERNAME,
        password=settings.NEO4J_PASSWORD,
        embedding_dimension=768,  # Gemini embedding-001 차원과 일치
        database="neo4j"
    )
    # logging.info("Neo4j 벡터 저장소 초기화 완료")
    
    # 그래프 저장을 위한 Neo4jGraphStore
    neo4j_graph_store = Neo4jGraphStore(
        url=settings.NEO4J_URI,
        username=settings.NEO4J_USERNAME,
        password=settings.NEO4J_PASSWORD,
        database="neo4j"
    )
    # logging.info("Neo4j 그래프 저장소 초기화 완료")
    
    # 두 저장소를 포함하는 StorageContext 생성
    storage_context = StorageContext.from_defaults(
        vector_store=neo4j_vector_store,
        graph_store=neo4j_graph_store
    )
    
    return llm, embed_model, storage_context

# 애플리케이션 시작 시 RAG 설정 초기화 실행
LLM, EMBED_MODEL, STORAGE_CONTEXT = initialize_rag_settings()

# ---- 서비스 함수 ----

def update_document_status(document_id: str, status: str):
    """Supabase에서 문서 상태를 업데이트하는 헬퍼 함수"""
    try:
        supabase_client.from_("documents").update({"status": status}).eq("id", document_id).execute()
        # logging.info(f"문서 ID {document_id}의 상태를 {status}로 업데이트했습니다.")
    except Exception as e:
        logging.error(f"문서 ID {document_id}의 상태 업데이트 실패: {e}")

def extract_meeting_metadata(content: str) -> dict:
    """
    회의록 내용에서 메타데이터를 추출합니다.
    참석자, 날짜, 시간, 장소, 안건 등을 파싱합니다.
    """
    import re
    metadata = {}
    
    # 날짜 패턴 매칭
    date_patterns = [
        r'(\d{4})[-./](\d{1,2})[-./](\d{1,2})',
        r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일',
    ]
    for pattern in date_patterns:
        match = re.search(pattern, content[:500])  # 문서 상단에서만 검색
        if match:
            metadata['meeting_date'] = f"{match.group(1)}-{match.group(2).zfill(2)}-{match.group(3).zfill(2)}"
            break
    
    # 참석자 추출
    attendee_patterns = [
        r'참석자[:\s]*([^\n]+)',
        r'참여자[:\s]*([^\n]+)',
        r'출석[:\s]*([^\n]+)',
    ]
    for pattern in attendee_patterns:
        match = re.search(pattern, content[:1000])
        if match:
            attendees = [name.strip() for name in re.split(r'[,，、]', match.group(1)) if name.strip()]
            metadata['attendees'] = attendees
            break
    
    # 장소 추출
    location_patterns = [
        r'장소[:\s]*([^\n]+)',
        r'회의실[:\s]*([^\n]+)',
        r'위치[:\s]*([^\n]+)',
    ]
    for pattern in location_patterns:
        match = re.search(pattern, content[:1000])
        if match:
            metadata['location'] = match.group(1).strip()
            break
    
    # 안건/주제 추출
    agenda_patterns = [
        r'안건[:\s]*([^\n]+)',
        r'주제[:\s]*([^\n]+)',
        r'의제[:\s]*([^\n]+)',
    ]
    for pattern in agenda_patterns:
        match = re.search(pattern, content[:1000])
        if match:
            metadata['agenda'] = match.group(1).strip()
            break
    
    return metadata

def extract_speaker_from_chunk(text: str) -> dict:
    """
    청크 텍스트에서 발언자 정보를 추출합니다.
    """
    import re
    
    # 발언자 패턴 매칭 (예: "홍길동:", "[홍길동]", "홍길동>")
    speaker_patterns = [
        r'^([가-힣\w]+)[:\]>]\s*',
        r'^\[([가-힣\w]+)\]\s*',
        r'^<([가-힣\w]+)>\s*',
    ]
    
    for pattern in speaker_patterns:
        match = re.match(pattern, text.strip())
        if match:
            return {'speaker': match.group(1).strip()}
    
    return {}

def perform_hybrid_search(question: str, top_k: int = 10) -> list:
    """
    하이브리드 검색 수행 (벡터 + 키워드 검색 결합)
    Reciprocal Rank Fusion (RRF) 알고리즘을 사용하여 결과 병합
    """
    from llama_index.core.schema import NodeWithScore, TextNode
    import numpy as np
    
    driver = get_neo4j_driver()
    if not driver:
        logging.error("Neo4j 드라이버를 가져올 수 없습니다.")
        return []
    
    try:
        # 질문을 임베딩으로 변환
        query_embedding = EMBED_MODEL.get_query_embedding(question)
        logging.info(f"Query embedding dimension: {len(query_embedding)}")
        
        with driver.session() as session:
            # 1. 벡터 검색
            vector_query = """
            CALL db.index.vector.queryNodes('vector', $k, $embedding) 
            YIELD node, score
            WHERE node:Chunk
            RETURN node, score
            ORDER BY score DESC
            """
            vector_results = session.run(
                vector_query, 
                k=top_k * 2,  # 더 많이 가져와서 나중에 필터링
                embedding=query_embedding
            ).values()
            
            # 2. 키워드 검색
            keyword_search_query = """
            CALL db.index.fulltext.queryNodes('keyword', $q, {limit: $limit}) 
            YIELD node, score
            WHERE node:Chunk
            RETURN node, score
            ORDER BY score DESC
            """
            keyword_results = session.run(
                keyword_search_query,
                q=question,
                limit=top_k * 2
            ).values()
            
            # 3. RRF 스코어 계산 및 원본 점수 보존
            rrf_scores = {}
            original_scores = {}  # 원본 검색 점수 보존
            k = 60  # RRF 파라미터
            
            # 벡터 검색 결과에 대한 RRF 스코어
            vector_count = 0
            vector_threshold = 0.7  # 관련성 임계값 설정
            
            for rank, (node, score) in enumerate(vector_results):
                node_id = node.get('id')
                if node_id:
                    # 디버깅: 실제 벡터 점수 확인
                    if rank < 3:  # 상위 3개만 로깅
                        logging.info(f"Vector search result {rank+1}: raw_score={score}, node_id={node_id[:8]}...")
                    
                    # 임계값 이하는 제외
                    if float(score) < vector_threshold:
                        logging.info(f"Skipping vector result with score {score} < {vector_threshold}")
                        continue
                        
                    vector_count += 1
                    
                    # Neo4j 벡터 인덱스는 이미 정렬된 상위 결과만 반환
                    # score 값의 의미를 정확히 파악하기 위해 로깅
                    rrf_scores[node_id] = rrf_scores.get(node_id, 0) + 1.0 / (k + rank + 1)
                    
                    # 원본 점수를 그대로 저장 (나중에 변환)
                    if node_id not in original_scores:
                        original_scores[node_id] = float(score)
            
            logging.info(f"Vector search returned {vector_count} results for query: '{question[:50]}...'")
            
            # 키워드 검색 결과에 대한 RRF 스코어
            keyword_count = 0
            for rank, (node, score) in enumerate(keyword_results):
                node_id = node.get('id')
                if node_id:
                    keyword_count += 1
                    # 디버깅: 키워드 검색 점수 확인
                    if rank < 3:
                        logging.info(f"Keyword search result {rank+1}: score={score}, node_id={node_id[:8]}...")
                    
                    # 키워드 검색도 최소 임계값 적용
                    if float(score) < 0.5:  # 키워드 검색 임계값 낮춤
                        continue
                        
                    # 키워드 검색에 더 높은 가중치 부여
                    rrf_scores[node_id] = rrf_scores.get(node_id, 0) + 1.5 / (k + rank + 1)
                    
                    # 키워드 검색 점수는 벡터 점수가 없을 때만 사용
                    if node_id not in original_scores:
                        original_scores[node_id] = min(float(score) * 0.2, 1.0)  # 키워드 점수 조정
            
            logging.info(f"Keyword search returned {keyword_count} results")

            weighted_rrf_scores = {}
            for node_id, base_score in rrf_scores.items():
                node_query = """
                MATCH (c:Chunk {id: $node_id})-[:BELONGS_TO]->(d:Document)
                RETURN d.created_at AS created_at
                """
                result = session.run(node_query, node_id=node_id).single()
                created_at = result["created_at"] if result and "created_at" in result else None

                weight = time_decay_weight(created_at)
                weighted_rrf_scores[node_id] = base_score * weight
            
            # 4. 상위 결과 선택 및 노드 생성 (시간 가중치 반영)
            sorted_nodes = sorted(weighted_rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
            logging.info(f"Final RRF merged results: {len(sorted_nodes)} nodes selected from {len(rrf_scores)} candidates")
            
            # 노드 정보 가져오기
            result_nodes = []
            for node_id, rrf_score in sorted_nodes:
                # 노드 상세 정보 조회
                node_query = """
                MATCH (c:Chunk {id: $node_id})
                OPTIONAL MATCH (c)-[:BELONGS_TO]->(d:Document)
                RETURN c, d
                """
                result = session.run(node_query, node_id=node_id).single()
                
                if result:
                    chunk_node = result['c']
                    doc_node = result['d']
                    
                    # TextNode 생성
                    text_node = TextNode(
                        text=chunk_node.get('text', chunk_node.get('_node_content', '')),
                        id_=chunk_node.get('id'),
                        metadata={
                            'document_id': chunk_node.get('document_id', chunk_node.get('ref_doc_id')),
                            'title': doc_node.get('title') if doc_node else None,
                            'created_at': str(doc_node.get('created_at')) if doc_node and doc_node.get('created_at') else None,
                            'rrf_score': rrf_score
                        }
                    )
                    
                    # 원본 검색 점수 사용 (없으면 RRF 점수를 정규화)
                    display_score = original_scores.get(node_id, rrf_score * 100)
                    
                    node_with_score = NodeWithScore(
                        node=text_node,
                        score=display_score
                    )
                    result_nodes.append(node_with_score)
            
            return result_nodes
            
    except Exception as e:
        logging.error(f"하이브리드 검색 중 오류 발생: {e}", exc_info=True)
        return []

def time_decay_weight(created_at: str, decay_rate=0.05) -> float:
    """
    문서 생성 시점을 기반으로 시간 가중치를 계산합니다.
    """
    if not created_at:
        return 1.0
    try:
        created_dt = datetime.fromisoformat(str(created_at).split("T")[0])
    except Exception:
        return 1.0

    days_diff = (datetime.now() - created_dt).days
    return math.exp(-decay_rate * days_diff)

def _create_document_node(document_id: str, doc_data: dict):
    """
    원본 문서를 나타내는 Document 노드를 생성하고 메타데이터를 저장합니다.
    """
    driver = get_neo4j_driver()
    if not driver:
        logging.error(f"문서 {document_id}의 노드 생성 실패: Neo4j 드라이버를 가져올 수 없습니다.")
        return

    query = """
    MERGE (d:Document {id: $document_id})
    SET d.title = $title,
        d.created_at = datetime($created_at),
        d.theme = $theme,
        d.reference_urls = $reference_urls,
        d.last_updated = timestamp()
    """
    try:
        with driver.session(database="neo4j") as session:
            session.run(
                query,
                document_id=document_id,
                title=doc_data.get('title'),
                created_at=doc_data.get('created_at'),
                theme=doc_data.get('theme', ''),
                reference_urls=doc_data.get('reference_urls', [])
            )
            # logging.info(f"문서 ID {document_id}에 대한 Document 노드를 생성/업데이트했습니다.")
    except Exception as e:
        logging.error(f"문서 ID {document_id}의 Document 노드 생성 중 오류 발생: {e}", exc_info=True)


def process_ingestion(document_id: str):
    """
    문서 수집 및 처리를 담당하는 메인 함수.
    벡터 임베딩과 지식 그래프를 모두 생성합니다.
    """
    # logging.info(f"문서 ID {document_id}에 대한 수집 처리 시작...")
    
    update_document_status(document_id, "INGESTING")

    try:
        # 1. Supabase에서 문서와 관련 레이블들을 함께 가져오기
        doc_response = supabase_client.from_("documents").select("id, title, content, created_at").eq("id", document_id).single().execute()
        doc_data = doc_response.data
        if not doc_data:
            raise ValueError("Supabase에서 문서를 찾을 수 없습니다.")

        labels_response = supabase_client.from_("labels").select("key, value").eq("document_id", document_id).execute()
        labels_data = labels_response.data or []
        
        # 레이블 데이터를 메타데이터로 변환
        metadata = {item['key']: item['value'] for item in labels_data}
        metadata['document_id'] = doc_data['id']
        metadata['title'] = doc_data['title']
        metadata['created_at'] = doc_data['created_at']

        # 2. 회의록 메타데이터 추출
        meeting_metadata = extract_meeting_metadata(doc_data['content'])
        metadata.update(meeting_metadata)
        
        # 3. LlamaIndex Document 객체 생성
        doc = Document(
            text=f"제목: {doc_data['title']}\n\n{doc_data['content']}",
            id_=doc_data['id'], 
            metadata=metadata
        )

        # 4. 노드 파싱 (청킹)
        nodes = LlamaSettings.node_parser.get_nodes_from_documents([doc])
        
        # 5. 각 노드에 필요한 메타데이터 추가 및 필터링
        filtered_nodes = []
        seen_texts = set()  # 중복 제거용
        
        for i, node in enumerate(nodes):
            # 텍스트 내용 검증
            text_content = node.text.strip()
            
            # 이미지 마크다운 패턴 제거 후 실제 텍스트 길이 확인
            import re
            text_without_images = re.sub(r'\[.*?\]\(attachment:.*?\)', '', text_content)
            text_without_images = re.sub(r'!\[.*?\]\(.*?\)', '', text_without_images)
            # 추가 패턴: 단독 이미지 파일명
            text_without_images = re.sub(r'\[[\w\-\.]+\.(png|jpg|jpeg|gif|webp|PNG|JPG|JPEG|GIF|WEBP)\]', '', text_without_images)
            clean_text = text_without_images.strip()
            
            # 너무 짧은 청크는 제외 (100자 미만으로 강화)
            if len(clean_text) < 100:
                logging.info(f"Skipping chunk {i} with only {len(clean_text)} chars of text content")
                continue
            
            # 중복 청크 확인 (처음 500자로 비교)
            text_key = clean_text[:500]
            if text_key in seen_texts:
                logging.info(f"Skipping duplicate chunk {i}")
                continue
            seen_texts.add(text_key)
            
            node.metadata['document_id'] = doc_data['id']
            node.metadata['ref_doc_id'] = doc_data['id']  # Neo4j vector store가 사용하는 필드
            node.metadata['chunk_index'] = i
            
            # 청크별 발언자 정보 추출 (있는 경우)
            speaker_info = extract_speaker_from_chunk(node.text)
            if speaker_info:
                node.metadata.update(speaker_info)
                
            filtered_nodes.append(node)
        
        logging.info(f"Filtered {len(nodes)} chunks to {len(filtered_nodes)} chunks for document {document_id}")
        nodes = filtered_nodes
        
        # 5. 먼저 Document 노드 생성 (테마와 요약 생성 포함)
        theme = metadata.get('theme', '')
        if not theme:
            # Use LLM to analyze content and suggest theme
            try:
                theme_prompt = f"""
                다음 회의록을 분석하여 가장 적절한 테마를 하나만 선택해주세요:
                
                제목: {doc_data['title']}
                내용: {doc_data['content'][:500]}...
                
                가능한 테마: 개발, 설계, 기획, 마케팅, QA, 사업, 일반 회의, 기타
                
                테마 이름만 답해주세요.
                """
                response = LLM.complete(theme_prompt)
                suggested_theme = response.text.strip()
                # Validate the suggested theme
                valid_themes = ['개발', '설계', '기획', '마케팅', 'QA', '사업', '일반 회의', '기타']
                theme = suggested_theme if suggested_theme in valid_themes else '일반 회의'
            except:
                # Fallback to simple logic
                title_lower = doc_data['title'].lower()
                content_lower = doc_data['content'][:500].lower()
                if '개발' in title_lower or 'develop' in title_lower or '코드' in content_lower:
                    theme = '개발'
                elif '설계' in title_lower or 'design' in title_lower or '디자인' in content_lower:
                    theme = '설계'
                elif 'qa' in title_lower or '테스트' in content_lower or '버그' in content_lower:
                    theme = 'QA'
                elif '기획' in title_lower or '사업' in content_lower:
                    theme = '기획'
                else:
                    theme = '일반 회의'
            # logging.info(f"Auto-assigned theme '{theme}' for document {document_id}")
        
        # Generate summary for the document
        summary = ""
        try:
            summary_prompt = f"""
            다음 회의록의 핵심 내용을 2-3문장으로 요약해주세요:
            
            제목: {doc_data['title']}
            내용: {doc_data['content'][:1500]}...
            
            간결하고 명확하게 요약해주세요.
            """
            response = LLM.complete(summary_prompt)
            summary = response.text.strip()
            logging.info(f"Generated summary for document {document_id}")
        except Exception as e:
            logging.error(f"Failed to generate summary for document {document_id}: {e}")
            summary = f"{doc_data['title']}에 대한 회의록입니다."
        
        # Update document in Supabase with theme and summary
        try:
            supabase_client.from_("documents").update({
                "theme": theme,
                "summary": summary
            }).eq("id", document_id).execute()
            logging.info(f"Updated document {document_id} with theme '{theme}' and summary")
        except Exception as e:
            logging.error(f"Failed to update document {document_id} with theme and summary: {e}")
        
        # Create Document node in Neo4j FIRST
        _create_document_node(document_id, {
            'title': doc_data['title'],
            'created_at': doc_data['created_at'],
            'theme': theme,
            'reference_urls': metadata.get('reference_urls', [])
        })
        
        # 6. VectorStoreIndex로 노드 인덱싱
        vector_index = VectorStoreIndex(
            nodes=nodes,
            storage_context=STORAGE_CONTEXT,
            show_progress=True,
        )
        
        # 7. Chunk 노드 확인 및 Document 관계 생성
        driver = get_neo4j_driver()
        
        if driver:
            with driver.session() as session:
                # Chunk 노드 확인 (ref_doc_id로 검색)
                chunk_result = session.run("""
                    MATCH (c:Chunk)
                    WHERE c.ref_doc_id = $document_id OR c.document_id = $document_id
                    RETURN count(c) as chunk_count
                """, document_id=document_id)
                
                chunk_count = chunk_result.single()['chunk_count']
                # logging.info(f"Created {chunk_count} Chunk nodes for document {document_id}")
                
                # Document-Chunk 관계 생성
                rel_result = session.run("""
                    MATCH (d:Document {id: $document_id})
                    MATCH (c:Chunk)
                    WHERE c.ref_doc_id = $document_id OR c.document_id = $document_id
                    MERGE (c)-[:BELONGS_TO]->(d)
                    RETURN count(*) as rel_count
                """, document_id=document_id)
                
                rel_count = rel_result.single()['rel_count']
                # logging.info(f"Created {rel_count} Document-Chunk relationships")
        
        # 8. (선택사항) 지식 그래프 추출
        # KnowledgeGraphIndex로 엔티티와 관계 추출
        try:
            # logging.info(f"Starting knowledge graph extraction for document {document_id}...")
            kg_index = KnowledgeGraphIndex.from_documents(
                [doc],
                storage_context=STORAGE_CONTEXT,
                max_triplets_per_chunk=10,  # 증가: 더 많은 관계 추출
                include_embeddings=False,  # 이미 벡터는 저장했으므로
                show_progress=True,
                kg_triple_extract_template=(
                    "다음 회의록에서 중요한 엔티티(사람, 조직, 프로젝트, 시스템, 기술)와 "
                    "그들 간의 관계를 추출해주세요. 특히 의사결정, 역할, 책임, "
                    "일정, 의존성 등에 초점을 맞춰주세요.\n"
                    "---------------------\n"
                    "{text}\n"
                    "---------------------\n"
                    "위 텍스트에서 최대 {max_knowledge_triplets}개의 "
                    "(주체, 관계, 객체) 형태의 트리플렛을 추출해주세요.\n"
                )
            )
            # logging.info(f"Knowledge graph extraction completed for document {document_id}")
            
            # Tag entities with document_id
            if driver:
                with driver.session() as session:
                    # First, find all entities that don't have document_id
                    tag_result = session.run("""
                        MATCH (e:Entity)
                        WHERE e.document_id IS NULL
                        SET e.document_id = $document_id
                        RETURN count(e) as tagged_count
                    """, document_id=document_id)
                    
                    tagged_count = tag_result.single()['tagged_count']
                    if tagged_count > 0:
                        logging.info(f"Tagged {tagged_count} entities with document_id {document_id}")
                    
                    # Count total entities for this document
                    entity_count_result = session.run("""
                        MATCH (e:Entity)
                        WHERE e.document_id = $document_id
                        RETURN count(DISTINCT e) as count
                    """, document_id=document_id)
                    entity_count = entity_count_result.single()['count']
                    logging.info(f"Total {entity_count} entities for document {document_id}")
                    
        except Exception as e:
            logging.error(f"Knowledge graph extraction failed for document {document_id}: {e}", exc_info=True)
        
        # 최종 확인: 이 문서와 연결된 엔티티 수 확인
        if driver:
            with driver.session() as session:
                final_check = session.run("""
                    MATCH (e:Entity)
                    WHERE e.document_id = $document_id OR 
                          EXISTS {
                            MATCH (e)-[r]-(other)
                            WHERE other.document_id = $document_id
                          }
                    WITH count(DISTINCT e) as entity_count
                    MATCH (d:Document {id: $document_id})
                    RETURN d.title, entity_count
                """, document_id=document_id)
                
                result = final_check.single()
                if result:
                    logging.info(f"문서 '{result['d.title']}' 인덱싱 완료: {result['entity_count']}개 엔티티 추출")
        
        # logging.info(f"문서 ID {document_id}가 성공적으로 인덱싱되었습니다.")
        update_document_status(document_id, "INGESTED")

    except Exception as e:
        logging.error(f"문서 ID {document_id} 수집 처리 중 오류 발생: {e}", exc_info=True)
        update_document_status(document_id, "FAILED")


def get_chat_response_stream(question: str):
    """
    사용자 질문에 대해 하이브리드 RAG 파이프라인(그래프 + 벡터)을 실행하고,
    생성된 답변과 소스 문서를 반환합니다.
    """
    # logging.info(f"질문 수신: {question}")
    
    def generate():
        # 질문 분석 시작
        yield f"data: {json.dumps({'type': 'status', 'status': 'analyzing'})}\n\n"
        
        try:
            # 검색 시작
            yield f"data: {json.dumps({'type': 'status', 'status': 'searching'})}\n\n"
            
            # 1. 하이브리드 검색 수행 (벡터 + 키워드)
            retrieved_nodes = perform_hybrid_search(question)
            
            # 2. VectorStoreIndex를 사용하여 벡터 검색 수행 (폴백용)
            if not retrieved_nodes:
                # 명시적으로 임베딩 모델 설정 확인
                logging.info(f"Current embed model: {LlamaSettings.embed_model}")
                logging.info(f"Embed model type: {type(LlamaSettings.embed_model)}")
                
                vector_index = VectorStoreIndex.from_vector_store(
                    vector_store=STORAGE_CONTEXT.vector_store,
                    storage_context=STORAGE_CONTEXT,
                    embed_model=EMBED_MODEL  # 명시적으로 임베딩 모델 전달
                )
                
                # 벡터 검색 쿼리 엔진 생성
                query_engine = vector_index.as_query_engine(
                    streaming=True,
                    similarity_top_k=10,  # 증가된 top_k
                )
                
                # 쿼리 실행 및 스트리밍 응답 받기
                response = query_engine.query(question)
            else:
                # 하이브리드 검색 결과로 응답 생성
                from llama_index.core.response_synthesizers import get_response_synthesizer
                from llama_index.core.schema import QueryBundle
                
                synthesizer = get_response_synthesizer(
                    streaming=True,
                    llm=LLM
                )
                
                query_bundle = QueryBundle(query_str=question)
                response = synthesizer.synthesize(
                    query=query_bundle,
                    nodes=retrieved_nodes
                )
            
            # 4. 소스 문서 정보 추출 및 그룹화
            source_nodes = []
            
            # 하이브리드 검색 결과 처리
            if retrieved_nodes:
                yield f"data: {json.dumps({'type': 'status', 'status': 'sources_found'})}\n\n"
                
                for node_with_score in retrieved_nodes[:10]:  # 상위 10개 수집 (그룹화 후 필터링)
                    node = node_with_score.node
                    metadata = getattr(node, 'metadata', {})
                    source_info = {
                        'text': node.text,  # 전체 텍스트 포함
                        'preview': node.text[:200] + '...' if len(node.text) > 200 else node.text,
                        'score': node_with_score.score,
                        'metadata': metadata,
                        'search_type': 'hybrid'
                    }
                    source_nodes.append(source_info)
            elif hasattr(response, 'source_nodes') and response.source_nodes:
                yield f"data: {json.dumps({'type': 'status', 'status': 'sources_found'})}\n\n"
                
                for node in response.source_nodes[:10]:
                    # 노드에 메타데이터가 있는지 확인
                    metadata = getattr(node, 'metadata', {})
                    source_info = {
                        'text': node.text,  # 전체 텍스트 포함
                        'preview': node.text[:200] + '...' if len(node.text) > 200 else node.text,
                        'score': getattr(node, 'score', 0.0),
                        'metadata': metadata,
                        'search_type': 'vector'
                    }
                    source_nodes.append(source_info)
            
            # 문서별로 그룹화
            grouped_sources = {}
            
            for source in source_nodes:
                doc_id = source['metadata'].get('document_id', 'unknown')
                doc_title = source['metadata'].get('title', f'문서 {doc_id[:8]}...')
                
                if doc_id not in grouped_sources:
                    grouped_sources[doc_id] = {
                        'documentId': doc_id,
                        'title': doc_title,
                        'link': None,
                        'chunks': []
                    }
                
                grouped_sources[doc_id]['chunks'].append({
                    'text': source['text'],
                    'preview': source['preview'],
                    'score': source['score'],
                    'metadata': source['metadata']
                })
            
            # 문서 출처 링크(Supabase) 조회 후 주입
            try:
                doc_ids = [doc_id for doc_id in grouped_sources.keys() if doc_id and doc_id != 'unknown']
                if doc_ids and supabase_client is not None:
                    docs_resp = supabase_client.from_("documents").select("id, link").in_("id", doc_ids).execute()
                    if docs_resp and getattr(docs_resp, 'data', None):
                        id_to_link = {row.get("id"): row.get("link") for row in docs_resp.data}
                        for d_id, group in grouped_sources.items():
                            group['link'] = id_to_link.get(d_id)
            except Exception as e:
                logging.error(f"Failed to enrich sources with document links: {e}")
            
            # 상위 5개 문서만 선택 (각 문서의 최고 점수 기준)
            sorted_groups = sorted(
                grouped_sources.values(), 
                key=lambda g: max(c['score'] for c in g['chunks']),
                reverse=True
            )[:5]
            
            # 소스 정보를 JSON으로 전송
            yield f"data: {json.dumps({'type': 'sources', 'sources': sorted_groups})}\n\n"
            
            # 응답 생성 시작
            yield f"data: {json.dumps({'type': 'status', 'status': 'generating'})}\n\n"
            
            # 응답이 있는지 확인
            if hasattr(response, 'response_gen') and response.response_gen:
                # 실제 응답 스트리밍
                has_content = False
                
                try:
                    for token in response.response_gen:
                        # 토큰이 있으면 그대로 전송 (중복 체크 제거)
                        if token:
                            has_content = True
                            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                except IndexError:
                    # Gemini가 빈 parts를 반환하는 경우 처리
                    logging.warning("Gemini returned empty parts in response")
                    yield f"data: {json.dumps({'type': 'token', 'content': '응답 생성 중 오류가 발생했습니다. 다시 시도해주세요.'})}\n\n"
                    has_content = True
                except Exception as e:
                    # 기타 오류 처리
                    logging.error(f"Error during response streaming: {e}")
                    yield f"data: {json.dumps({'type': 'token', 'content': '응답 처리 중 오류가 발생했습니다.'})}\n\n"
                    has_content = True
                
                # 응답이 없는 경우 기본 메시지
                if not has_content:
                    yield f"data: {json.dumps({'type': 'token', 'content': '죄송합니다. 관련된 정보를 찾을 수 없습니다.'})}\n\n"
            else:
                # response_gen이 없는 경우 응답 텍스트 직접 전송
                response_text = str(response) if response else "죄송합니다. 관련된 정보를 찾을 수 없습니다."
                yield f"data: {json.dumps({'type': 'token', 'content': response_text})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logging.error(f"채팅 스트림 생성 중 오류 발생: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return generate()
