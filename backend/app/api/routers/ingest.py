from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from app.models.schemas import IngestRequest, IngestResponse
from app.services.rag_service import process_ingestion, get_neo4j_driver, supabase_client
from app.services.supabase_service import get_document_status
from typing import List, Dict, Any
from neo4j import Driver
import logging

router = APIRouter()

@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(request: IngestRequest, background_tasks: BackgroundTasks):
    """
    지정된 document_id에 대한 데이터 수집 및 처리를 시작합니다.
    실제 처리는 백그라운드에서 실행됩니다.
    """
    try:
        background_tasks.add_task(process_ingestion, request.document_id)
        
        return IngestResponse(
            success=True,
            message="문서 수집 작업이 성공적으로 시작되었습니다.",
            document_id=request.document_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.get("/ingest/{document_id}/details")
async def get_ingestion_details(document_id: str, driver: Driver = Depends(get_neo4j_driver)):
    """
    특정 문서의 청킹 결과와 세부 정보를 반환합니다.
    """
    try:
        with driver.session() as session:
            chunks_query = """
            MATCH (d:Document {id: $document_id})
            OPTIONAL MATCH (c:Chunk)
            WHERE c.ref_doc_id = $document_id OR c.document_id = $document_id
            WITH d, collect({
                id: c.id,
                text: CASE 
                    WHEN size(coalesce(c.text, '')) > 0 THEN c.text
                    ELSE substring(c._node_content, 0, 500)
                END,
                embedding: CASE WHEN c.embedding IS NOT NULL THEN true ELSE false END
            }) as chunks
            RETURN d.title as title, 
                   d.created_at as created_at,
                   chunks
            """
            
            result = session.run(chunks_query, document_id=document_id)
            record = result.single()
            
            if not record:
                raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
            
            # Supabase에서 최신 상태를 비동기적으로 가져옵니다.
            status = await get_document_status(document_id)
            
            return {
                "document_id": document_id,
                "title": record["title"],
                "status": status,
                "created_at": record["created_at"],
                "chunks": record["chunks"],
                "total_chunks": len(record["chunks"])
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"청킹 정보 조회 실패: {str(e)}")

@router.get("/ingest/{document_id}/graph")
async def get_ingestion_graph(
    document_id: str, 
    driver: Driver = Depends(get_neo4j_driver)
):
    """
    특정 문서에서 추출된 지식 그래프 노드와 관계를 반현합니다.
    """
    try:
        with driver.session() as session:
            graph_query = """
            // 1. 해당 문서와 관련된 청크 찾기
            MATCH (d:Document {id: $document_id})
            OPTIONAL MATCH (c:Chunk)
            WHERE c.ref_doc_id = $document_id OR c.document_id = $document_id
            WITH d, collect(DISTINCT c) as chunks
            
            // 2. 해당 문서에 속한 엔티티 찾기
            MATCH (e:Entity)
            WHERE e.document_id = $document_id OR 
                  EXISTS {
                    MATCH (e)-[r]-(other)
                    WHERE other.document_id = $document_id
                  }
            WITH d, collect(DISTINCT e) as all_entities
            
            // 5. 모든 엔티티 정보 준비
            WITH d, all_entities as selected_entities
            UNWIND selected_entities as e
            WITH collect(DISTINCT {
                id: elementId(e),
                name: coalesce(e.name, e.id),
                type: coalesce(labels(e)[0], 'Entity'),
                properties: properties(e)
            }) as entities, selected_entities

            // 6. 선택된 엔티티 간의 관계 찾기
            UNWIND selected_entities as e1
            UNWIND selected_entities as e2
            OPTIONAL MATCH (e1)-[rel]->(e2)
            WHERE e1 <> e2 AND rel IS NOT NULL
            WITH entities, collect(DISTINCT {
                source: elementId(e1),
                target: elementId(e2),
                type: type(rel),
                properties: properties(rel)
            }) as all_relationships
            
            // 7. 관계 필터링
            WITH entities, [r IN all_relationships WHERE r.type IS NOT NULL] as relationships
            
            RETURN entities, relationships
            """
            
            result = session.run(graph_query, document_id=document_id)
            record = result.single()
            
            if not record:
                # 결과가 없어도 오류는 아니므로 빈 리스트를 반환합니다.
                 return {
                    "document_id": document_id,
                    "entities": [],
                    "relationships": [],
                    "total_entities": 0,
                    "total_relationships": 0
                }
            
            return {
                "document_id": document_id,
                "entities": record["entities"] or [],
                "relationships": record["relationships"] or [],
                "total_entities": len(record["entities"] or []),
                "total_relationships": len(record["relationships"] or [])
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"그래프 정보 조회 실패: {str(e)}")

@router.post("/ingest/{document_id}/rechunk", response_model=IngestResponse)
async def rechunk_document(document_id: str, background_tasks: BackgroundTasks, driver: Driver = Depends(get_neo4j_driver)):
    """
    특정 문서를 재청킹합니다.
    기존 청크와 관련 데이터를 모두 삭제하고 다시 처리합니다.
    """
    try:
        # 1. 문서 존재 여부 확인
        doc_result = supabase_client.from_("documents").select("*").eq("id", document_id).execute()
        if not doc_result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # 2. Neo4j에서 기존 청크 삭제
        with driver.session() as session:
            # 청크 삭제
            session.run("""
                MATCH (c:Chunk)
                WHERE c.ref_doc_id = $document_id OR c.document_id = $document_id
                DETACH DELETE c
            """, document_id=document_id)
            
            # Document 노드 삭제 (나중에 다시 생성됨)
            session.run("""
                MATCH (d:Document {id: $document_id})
                DETACH DELETE d
            """, document_id=document_id)
            
            # 관련 엔티티도 삭제 (선택적)
            session.run("""
                MATCH (e:Entity)
                WHERE e.document_id = $document_id
                DETACH DELETE e
            """, document_id=document_id)
            
            logging.info(f"Deleted existing chunks and entities for document {document_id}")
        
        # 3. Supabase에서 문서 상태를 PENDING으로 변경
        supabase_client.from_("documents").update({
            "status": "PENDING",
            "summary": None,
            "theme": None
        }).eq("id", document_id).execute()
        
        # 4. 백그라운드에서 재처리
        background_tasks.add_task(process_ingestion, document_id)
        
        return IngestResponse(
            success=True,
            message="문서 재청킹 작업이 성공적으로 시작되었습니다.",
            document_id=document_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to rechunk document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to rechunk document: {str(e)}")


@router.delete("/ingest/{document_id}")
async def delete_document(document_id: str, driver: Driver = Depends(get_neo4j_driver)):
    """
    특정 문서를 DB와 지식 그래프에서 완전히 삭제합니다.
    """
    try:
        # 1. Neo4j에서 관련 데이터 모두 삭제 (청크, 문서 노드, 엔티티)
        with driver.session() as session:
            # 청크 삭제
            session.run("""
                MATCH (c:Chunk)
                WHERE c.ref_doc_id = $document_id OR c.document_id = $document_id
                DETACH DELETE c
            """, document_id=document_id)
            
            # Document 노드 삭제
            session.run("""
                MATCH (d:Document {id: $document_id})
                DETACH DELETE d
            """, document_id=document_id)
            
            # 관련 엔티티 삭제
            session.run("""
                MATCH (e:Entity)
                WHERE e.document_id = $document_id
                DETACH DELETE e
            """, document_id=document_id)
            
            logging.info(f"Deleted all graph data for document {document_id}")

        # 2. Supabase에서 문서 레코드 삭제
        # ON DELETE CASCADE에 의해 labels 테이블의 관련 데이터도 자동 삭제됨
        supabase_client.from_("documents").delete().eq("id", document_id).execute()
        logging.info(f"Deleted document record from Supabase for id {document_id}")

        return {"success": True, "message": "문서가 성공적으로 삭제되었습니다."}

    except Exception as e:
        logging.error(f"Failed to delete document {document_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"문서 삭제 중 오류 발생: {str(e)}")
