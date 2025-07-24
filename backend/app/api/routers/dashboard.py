from fastapi import APIRouter, Depends, HTTPException
from neo4j import Driver
from ...services.rag_service import get_neo4j_driver, LLM, supabase_client
from typing import List, Dict, Any
import logging

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_data(driver: Driver = Depends(get_neo4j_driver)):
    """
    Fetches and aggregates data from Neo4j for the dashboard UI.
    """
    try:
        with driver.session() as session:
            # 1. Fetch timeline data (meetings grouped by week/month)
            timeline_query = """
            MATCH (d:Document)
            WHERE d.created_at IS NOT NULL
            WITH d, datetime(d.created_at) AS meetingDate
            WITH meetingDate.year AS year, meetingDate.week AS week, count(d) AS count
            RETURN year, week, count
            ORDER BY year DESC, week DESC
            LIMIT 4
            """
            timeline_result = session.run(timeline_query)
            timeline = [
                {"period": f"{record['year']}-{record['week']}주차", "count": record["count"]}
                for record in timeline_result
            ]

            # 2. Fetch task summaries
            tasks_query = """
            MATCH (d:Document)
            WHERE d.theme IS NOT NULL
            WITH d.theme as theme, collect(d) as documents
            WHERE theme <> ''
            RETURN theme,
                   size(documents) as summaries,
                   size([doc IN documents WHERE doc.reference_urls IS NOT NULL AND size(doc.reference_urls) > 0]) as refs,
                   [doc IN documents | doc.id] as doc_ids
            ORDER BY summaries DESC
            LIMIT 10
            """
            tasks_result = session.run(tasks_query)
            tasks = []
            task_count = 0
            for i, record in enumerate(tasks_result):
                task_count += 1
                
                # Placeholder summary - will be loaded asynchronously
                detailed_summary = None  # Frontend will handle loading state
                
                # Fetch sources for display
                sources_query = """
                MATCH (d:Document {theme: $theme})
                RETURN d.title as title, d.id as doc_id
                LIMIT 5
                """
                sources_result = session.run(sources_query, theme=record["theme"])
                
                sources = []
                for src in sources_result:
                    # Try to get content preview from Supabase
                    preview = ""
                    try:
                        doc_response = supabase_client.from_("documents").select("content").eq("id", src["doc_id"]).single().execute()
                        if doc_response.data:
                            preview = doc_response.data["content"][:200] + "..."
                    except:
                        preview = f"Document ID: {src['doc_id'][:8]}..."
                    
                    sources.append({
                        "type": "meeting", 
                        "title": src["title"], 
                        "content": preview
                    })

                tasks.append({
                    "id": f"task-{i+1}",
                    "theme": record["theme"],
                    "summaries": record["summaries"],
                    "refs": record["refs"],
                    "detailedSummary": detailed_summary,
                    "sources": sources
                })

            # If no tasks found with themes, show individual documents
            if task_count == 0:
                # Get all documents
                docs_query = """
                MATCH (d:Document)
                RETURN d.id as id, d.title as title, d.created_at as created_at
                ORDER BY d.created_at DESC
                LIMIT 10
                """
                docs_result = session.run(docs_query)
                
                for i, record in enumerate(docs_result):
                    doc_title = record['title']
                    doc_id = record['id']
                    
                    # Get chunk count for this document
                    chunk_count_query = """
                    MATCH (c:Chunk)
                    WHERE c.ref_doc_id = $doc_id OR c.document_id = $doc_id
                    RETURN count(c) as chunk_count
                    """
                    chunk_result = session.run(chunk_count_query, doc_id=doc_id)
                    chunk_count = chunk_result.single()['chunk_count']
                    
                    tasks.append({
                        "id": f"task-{i+1}",
                        "theme": doc_title,
                        "summaries": 1,
                        "refs": 0,
                        "detailedSummary": f"문서 '{doc_title}'에는 {chunk_count}개의 청크가 포함되어 있습니다.",
                        "sources": [{
                            "type": "meeting",
                            "title": doc_title,
                            "content": f"Document ID: {doc_id[:8]}..."
                        }]
                    })

            return {"timeline": timeline, "tasks": tasks}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard data from Neo4j: {str(e)}")


@router.get("/dashboard/theme-summary/{theme}")
async def get_theme_summary(theme: str, driver: Driver = Depends(get_neo4j_driver)):
    """
    Generate synthesized summary for a specific theme.
    This is called asynchronously from the frontend.
    """
    try:
        with driver.session() as session:
            # Get document IDs for this theme
            docs_query = """
            MATCH (d:Document {theme: $theme})
            RETURN collect(d.id) as doc_ids
            """
            result = session.run(docs_query, theme=theme)
            record = result.single()
            
            if not record or not record["doc_ids"]:
                return {"theme": theme, "summary": f"{theme} 테마와 관련된 회의록들의 종합 요약입니다."}
            
            doc_ids = record["doc_ids"]
            
            # Get summaries from Supabase
            try:
                response = supabase_client.from_("documents").select("summary").in_("id", doc_ids[:5]).execute()
                if response.data:
                    summaries = [doc["summary"] for doc in response.data if doc.get("summary")]
                    if summaries:
                        # Combine summaries into a theme summary
                        combined_prompt = f"""
                        다음은 '{theme}' 테마의 개별 문서 요약들입니다:
                        
                        {' '.join(summaries)}
                        
                        위 요약들을 종합하여 이 테마의 핵심 내용을 2-3문장으로 요약해주세요.
                        """
                        try:
                            llm_response = LLM.complete(combined_prompt)
                            return {"theme": theme, "summary": llm_response.text}
                        except Exception as e:
                            logging.error(f"Failed to generate theme summary: {e}")
                            # Use first summary as fallback
                            return {"theme": theme, "summary": summaries[0]}
                    else:
                        return {"theme": theme, "summary": f"{theme} 테마와 관련된 {len(doc_ids)}개의 회의록이 있습니다."}
                else:
                    return {"theme": theme, "summary": f"{theme} 테마와 관련된 회의록들의 종합 요약입니다."}
            except Exception as e:
                logging.error(f"Failed to fetch summaries from Supabase: {e}")
                return {"theme": theme, "summary": f"{theme} 테마와 관련된 회의록들의 종합 요약입니다."}
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate theme summary: {str(e)}")
