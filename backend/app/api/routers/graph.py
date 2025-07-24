from fastapi import APIRouter, Depends, HTTPException
from neo4j import Driver
from app.services.rag_service import get_neo4j_driver

router = APIRouter()

@router.get("/graph/all")
async def get_all_graph_data(
    limit_entities: int = 100,
    limit_relationships: int = 200,
    driver: Driver = Depends(get_neo4j_driver)
):
    """
    전체 지식 그래프 데이터를 반환합니다.
    성능을 위해 엔티티와 관계 수를 제한합니다.
    """
    try:
        with driver.session() as session:
            # 전체 그래프 쿼리 - 문서와 연결된 엔티티만
            graph_query = """
            // 1. document_id가 있는 모든 엔티티 찾기
            MATCH (e:Entity)
            WHERE e.document_id IS NOT NULL
            OPTIONAL MATCH (e)-[r]-()
            WITH e, count(DISTINCT r) as rel_count
            ORDER BY rel_count DESC
            WITH collect(e) as all_entities
            
            // 2. 엔티티 정보 수집
            UNWIND all_entities as e
            WITH all_entities, collect(DISTINCT {
                id: elementId(e),
                name: coalesce(e.name, e.id),
                type: coalesce(labels(e)[0], 'Entity'),
                properties: properties(e)
            }) as entities
            
            // 3. 선택된 엔티티 간의 관계 찾기
            UNWIND all_entities as e1
            UNWIND all_entities as e2
            OPTIONAL MATCH (e1)-[rel]->(e2)
            WHERE e1 <> e2 AND rel IS NOT NULL
            WITH entities, collect(DISTINCT {
                source: elementId(e1),
                target: elementId(e2),
                type: type(rel),
                properties: properties(rel)
            }) as all_relationships
            
            // 4. 관계 필터링
            WITH entities, [r IN all_relationships WHERE r.type IS NOT NULL] as relationships
            RETURN entities, relationships
            """
            
            result = session.run(graph_query)
            record = result.single()
            
            if record:
                entities = record["entities"] or []
                relationships = [r for r in (record["relationships"] or []) if r["type"]]
                
                # 통계 정보 추가 - 문서와 연결된 엔티티만
                stats_result = session.run("""
                    MATCH (e:Entity)
                    WHERE e.document_id IS NOT NULL OR EXISTS {
                        MATCH (e)-[]-(other)
                        WHERE other.document_id IS NOT NULL
                    }
                    WITH count(DISTINCT e) as total_entities
                    MATCH ()-[r]->()
                    WHERE type(r) <> 'BELONGS_TO'
                    RETURN total_entities, count(r) as total_relationships
                """)
                stats = stats_result.single()
                
                return {
                    "entities": entities,
                    "relationships": relationships,
                    "total_entities": len(entities),
                    "total_relationships": len(relationships),
                    "stats": {
                        "total_entities_in_db": stats["total_entities"],
                        "total_relationships_in_db": stats["total_relationships"],
                        "showing_entities": len(entities),
                        "showing_relationships": len(relationships)
                    }
                }
            else:
                return {
                    "entities": [],
                    "relationships": [],
                    "total_entities": 0,
                    "total_relationships": 0,
                    "stats": {}
                }
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"그래프 데이터 조회 실패: {str(e)}")