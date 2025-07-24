from fastapi import APIRouter, Depends
from neo4j import Driver
from app.services.rag_service import get_neo4j_driver

router = APIRouter()

@router.get("/debug/entities")
async def debug_entities(driver: Driver = Depends(get_neo4j_driver)):
    """
    Debug endpoint to understand Entity structure
    """
    with driver.session() as session:
        # Count all node types
        node_counts_result = session.run("""
            MATCH (n)
            RETURN labels(n)[0] as label, count(n) as count
            ORDER BY count DESC
        """)
        
        node_counts = {
            record["label"]: record["count"] 
            for record in node_counts_result
        }
        
        # Get sample entities
        entities_result = session.run("""
            MATCH (e:Entity)
            RETURN properties(e) as props, labels(e) as labels
            LIMIT 5
        """)
        
        entities = [
            {"properties": dict(record["props"]), "labels": record["labels"]}
            for record in entities_result
        ]
        
        # Get all documents
        all_docs_result = session.run("""
            MATCH (d:Document)
            RETURN d.id as id, d.title as title
            LIMIT 5
        """)
        
        all_documents = [
            {"id": record["id"], "title": record["title"]}
            for record in all_docs_result
        ]
        
        # Get documents with chunks
        docs_result = session.run("""
            MATCH (d:Document)
            OPTIONAL MATCH (c:Chunk {document_id: d.id})
            WITH d, count(c) as chunk_count
            WHERE chunk_count > 0
            RETURN d.id as id, d.title as title, chunk_count
            LIMIT 5
        """)
        
        documents = [
            {"id": record["id"], "title": record["title"], "chunks": record["chunk_count"]}
            for record in docs_result
        ]
        
        # Test the graph query with first document
        graph_results = []
        if documents:
            doc_id = documents[0]["id"]
            
            # Run our graph query
            graph_result = session.run("""
                // 1. 해당 문서의 제목과 Chunk 텍스트를 가져옵니다
                MATCH (d:Document {id: $document_id})
                OPTIONAL MATCH (c:Chunk {document_id: $document_id})
                WITH d.title as doc_title, collect(DISTINCT c.text) as chunk_texts
                
                // 2. Entity 노드들을 찾습니다 (텍스트 매칭 기반)
                MATCH (e:Entity)
                WHERE any(chunk_text IN chunk_texts WHERE 
                    chunk_text CONTAINS e.id OR 
                    chunk_text CONTAINS e.name OR
                    e.id CONTAINS doc_title OR
                    e.name CONTAINS doc_title
                )
                RETURN count(e) as entity_count
            """, document_id=doc_id)
            
            entity_count = graph_result.single()["entity_count"]
            graph_results.append({
                "document_id": doc_id,
                "entity_count": entity_count
            })
        
        return {
            "node_counts": node_counts,
            "all_documents": all_documents,
            "sample_entities": entities,
            "documents_with_chunks": documents,
            "graph_query_test": graph_results,
            "total_entities": len(entities)
        }