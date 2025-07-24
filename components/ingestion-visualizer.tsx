"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, FileText, Network } from "lucide-react"
import { GraphVisualizer } from "./graph-visualizer"

interface Chunk {
  id: string
  text: string
  embedding: boolean
  metadata: any
}

interface Entity {
  id: string
  name: string
  type: string
  properties: Record<string, any>
}

interface Relationship {
  source: string
  target: string
  type: string
  properties: Record<string, any>
}

interface IngestionVisualizerProps {
  documentId: string
  isOpen: boolean
  onClose: () => void
}

export function IngestionVisualizer({ documentId, isOpen, onClose }: IngestionVisualizerProps) {
  const [loading, setLoading] = useState(true)
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [documentTitle, setDocumentTitle] = useState("")

  useEffect(() => {
    if (isOpen && documentId) {
      fetchIngestionDetails()
    }
  }, [isOpen, documentId])

  const fetchIngestionDetails = async () => {
    setLoading(true)
    try {
      // Fetch chunking details
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const detailsRes = await fetch(`${apiUrl}/api/ingest/${documentId}/details`)
      const details = await detailsRes.json()
      setChunks(details.chunks || [])
      setDocumentTitle(details.title || "")

      // Fetch graph data
      const graphRes = await fetch(`${apiUrl}/api/ingest/${documentId}/graph`)
      const graph = await graphRes.json()
      setEntities(graph.entities || [])
      setRelationships(graph.relationships || [])
    } catch (error) {
      console.error("Failed to fetch ingestion details:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-4 lg:inset-8 overflow-hidden">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>수집 결과 시각화</CardTitle>
              <CardDescription>{documentTitle}</CardDescription>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Tabs defaultValue="chunks" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="chunks">
                    <FileText className="h-4 w-4 mr-2" />
                    청킹 결과 ({chunks.length}개)
                  </TabsTrigger>
                  <TabsTrigger value="graph">
                    <Network className="h-4 w-4 mr-2" />
                    지식 그래프 ({entities.length}개 노드)
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="chunks" className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="space-y-4 p-4">
                      {chunks.map((chunk, index) => (
                        <Card key={chunk.id || index}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">
                                청크 #{index + 1}
                              </CardTitle>
                              <Badge variant={chunk.embedding ? "default" : "secondary"}>
                                {chunk.embedding ? "임베딩 완료" : "임베딩 대기"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {chunk.text}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="graph" className="flex-1 overflow-hidden">
                  <div className="h-full flex flex-col">
                    {entities.length > 0 ? (
                      <>
                        <div className="px-4 py-2 border-b">
                          <p className="text-sm text-muted-foreground">
                            {entities.length}개 엔티티, {relationships.length}개 관계
                          </p>
                        </div>
                        <div className="flex-1">
                          <GraphVisualizer 
                            entities={entities} 
                            relationships={relationships} 
                            layoutType="force"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        지식 그래프 데이터가 없습니다.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}