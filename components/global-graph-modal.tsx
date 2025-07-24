"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Network, Download, ZoomIn, ZoomOut } from "lucide-react"
import { GraphVisualizer } from "./graph-visualizer"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface GlobalGraphModalProps {
  isOpen: boolean
  onClose: () => void
}

export function GlobalGraphModal({ isOpen, onClose }: GlobalGraphModalProps) {
  const [loading, setLoading] = useState(true)
  const [entities, setEntities] = useState<any[]>([])
  const [relationships, setRelationships] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [entityLimit, setEntityLimit] = useState(100)
  const [relationshipLimit, setRelationshipLimit] = useState(200)
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR' | 'BT' | 'RL'>('TB')
  const [layoutType, setLayoutType] = useState<'dagre' | 'force'>('force')

  const fetchGraphData = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/graph/all?limit_entities=${entityLimit}&limit_relationships=${relationshipLimit}`
      )
      if (response.ok) {
        const data = await response.json()
        setEntities(data.entities || [])
        setRelationships(data.relationships || [])
        setStats(data.stats || {})
      }
    } catch (error) {
      console.error("Failed to fetch global graph data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchGraphData()
    }
  }, [isOpen, entityLimit, relationshipLimit])

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            전체 지식 그래프
          </DialogTitle>
          <DialogDescription>
            시스템에 저장된 모든 엔티티와 관계를 시각화합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="h-full flex flex-col gap-4">
              {/* 통계 및 컨트롤 */}
              <div className="flex items-center justify-between gap-4 px-4">
                <div className="flex gap-4">
                  <Badge variant="outline">
                    엔티티: {entities.length} / {stats.total_entities_in_db || 0}
                  </Badge>
                  <Badge variant="outline">
                    관계: {relationships.length} / {stats.total_relationships_in_db || 0}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">엔티티 수:</span>
                    <Slider
                      value={[entityLimit]}
                      onValueChange={(value) => setEntityLimit(value[0])}
                      max={500}
                      min={10}
                      step={10}
                      className="w-32"
                    />
                    <span className="text-sm w-10">{entityLimit}</span>
                  </div>
                  
                  <Select value={layoutType} onValueChange={(value: any) => setLayoutType(value)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="레이아웃 타입" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="force">Force (자연스러운)</SelectItem>
                      <SelectItem value="dagre">Dagre (계층적)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {layoutType === 'dagre' && (
                    <Select value={layoutDirection} onValueChange={(value: any) => setLayoutDirection(value)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="레이아웃 방향" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TB">위에서 아래로</SelectItem>
                        <SelectItem value="BT">아래에서 위로</SelectItem>
                        <SelectItem value="LR">왼쪽에서 오른쪽</SelectItem>
                        <SelectItem value="RL">오른쪽에서 왼쪽</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchGraphData}
                  >
                    새로고침
                  </Button>
                </div>
              </div>

              {/* 그래프 시각화 */}
              <div className="flex-1 border rounded-lg overflow-hidden">
                {entities.length > 0 ? (
                  <GraphVisualizer
                    entities={entities}
                    relationships={relationships}
                    layoutDirection={layoutDirection}
                    layoutType={layoutType}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    엔티티가 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}