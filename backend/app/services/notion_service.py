import os
import re
import requests

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_BASE_URL = "https://api.notion.com/v1"

HEADERS = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
}

def extract_database_id(database_url: str) -> str:
    """
    예: https://www.notion.so/workspace/UXR-LAB-회의록...-a1b9819259280a2b0d5f9a234e44c7?pvs=4
    → a1b9819259280a2b0d5f9a234e44c7
    """
    match = re.search(r"([0-9a-f]{32})", database_url.replace("-", ""))
    if not match:
        raise ValueError("⚠️ 올바르지 않은 노션 DB URL입니다.")
    return match.group(1)

def fetch_page_content(page_id: str) -> str:
    """
    페이지 본문 텍스트(블록 단위)를 모두 가져옴
    """
    blocks_url = f"{NOTION_BASE_URL}/blocks/{page_id}/children"
    res = requests.get(blocks_url, headers=HEADERS)
    res.raise_for_status()
    data = res.json()

    texts = []
    for block in data.get("results", []):
        if "paragraph" in block:
            rich = block["paragraph"].get("rich_text", [])
            texts.append("".join(r.get("plain_text", "") for r in rich))
        elif "heading_2" in block:
            texts.append(f"## {block['heading_2']['rich_text'][0]['plain_text']}")
        elif "bulleted_list_item" in block:
            rich = block["bulleted_list_item"].get("rich_text", [])
            texts.append("• " + "".join(r.get("plain_text", "") for r in rich))
    return "\n".join(texts).strip()

def fetch_notion_pages(database_url: str):
    """
    지정된 Notion DB에서 각 회의 페이지의 메타데이터 및 본문을 추출
    """
    db_id = extract_database_id(database_url)
    url = f"{NOTION_BASE_URL}/databases/{db_id}/query"
    res = requests.post(url, headers=HEADERS)
    res.raise_for_status()
    data = res.json()

    documents = []
    for result in data.get("results", []):
        props = result.get("properties", {})
        title_prop = props.get("Name") or props.get("제목") or props.get("Title")
        date_prop = props.get("Date", {})
        tags_prop = props.get("Tags", {})
        person_prop = props.get("Person", {})
        gen_prop = props.get("기수", {})

        title = (
            title_prop["title"][0]["plain_text"]
            if title_prop and title_prop.get("title")
            else "Untitled"
        )
        date = date_prop.get("date", {}).get("start", "Unknown Date")
        tags = [t["name"] for t in tags_prop.get("multi_select", [])]
        people = [p.get("name", "") for p in person_prop.get("people", [])]
        generation = gen_prop.get("rich_text", [{}])[0].get("plain_text", "")

        page_id = result["id"]
        content = fetch_page_content(page_id)

        documents.append({
            "title": title,
            "date": date,
            "tags": tags,
            "people": people,
            "generation": generation,
            "content": content,
            "source": result.get("url", ""),
        })

    return documents
