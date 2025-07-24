"use client"

import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
  Position,
} from 'reactflow'
import dagre from '@dagrejs/dagre'
import * as d3 from 'd3-force'
import 'reactflow/dist/style.css'

interface GraphEntity {
  id: string
  name: string
  type: string
  properties: Record<string, any>
}

interface GraphRelationship {
  source: string
  target: string
  type: string
  properties: Record<string, any>
}

interface GraphVisualizerProps {
  entities: GraphEntity[]
  relationships: GraphRelationship[]
  layoutDirection?: 'TB' | 'LR' | 'BT' | 'RL'
  layoutType?: 'dagre' | 'force'
}

export function GraphVisualizer({ entities, relationships, layoutDirection = 'TB', layoutType = 'dagre' }: GraphVisualizerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    if (layoutType === 'dagre') {
      // Dagre layout
      const dagreGraph = new dagre.graphlib.Graph()
      dagreGraph.setDefaultEdgeLabel(() => ({}))
      dagreGraph.setGraph({ 
        rankdir: layoutDirection,
        nodesep: 50,
        ranksep: 70,
        marginx: 20,
        marginy: 20
      })

      entities.forEach((entity) => {
        dagreGraph.setNode(entity.id, { width: 120, height: 40 })
      })

      relationships.forEach((rel) => {
        if (rel.type && dagreGraph.hasNode(rel.source) && dagreGraph.hasNode(rel.target)) {
          dagreGraph.setEdge(rel.source, rel.target)
        }
      })

      dagre.layout(dagreGraph)

      const getNodePositions = () => {
        switch(layoutDirection) {
          case 'TB':
            return { source: Position.Bottom, target: Position.Top }
          case 'BT':
            return { source: Position.Top, target: Position.Bottom }
          case 'LR':
            return { source: Position.Right, target: Position.Left }
          case 'RL':
            return { source: Position.Left, target: Position.Right }
          default:
            return { source: Position.Bottom, target: Position.Top }
        }
      }
      
      const { source: sourcePosition, target: targetPosition } = getNodePositions()

      const nodeData: Node[] = entities.map((entity) => {
        const nodeWithPosition = dagreGraph.node(entity.id)
        
        return {
          id: entity.id,
          type: 'default',
          position: {
            x: nodeWithPosition?.x || 0,
            y: nodeWithPosition?.y || 0
          },
          data: { 
            label: entity.name || entity.id,
            ...entity.properties 
          },
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '12px',
            width: 'auto',
            minWidth: '80px',
          },
          sourcePosition,
          targetPosition,
        }
      })

      const edgeData: Edge[] = relationships
        .filter(rel => rel.type)
        .map((rel, index) => ({
          id: `edge-${index}`,
          source: rel.source,
          target: rel.target,
          label: rel.type,
          type: 'smoothstep',
          animated: true,
          style: {
            stroke: '#555',
            strokeWidth: 2,
          },
          labelStyle: {
            fill: '#999',
            fontSize: '10px',
          },
        }))

      setNodes(nodeData)
      setEdges(edgeData)
      
    } else if (layoutType === 'force') {
      // Force layout with dynamic sizing
      // Use viewport size or fallback to reasonable defaults
      const width = 1200
      const height = 800
      
      // Dynamic parameters based on node count - increased spacing
      const nodeCount = entities.length
      const linkDistance = Math.max(50, Math.min(120, 800 / Math.sqrt(nodeCount)))
      const chargeStrength = Math.max(-200, Math.min(-50, -2000 / Math.sqrt(nodeCount)))
      const collideRadius = Math.max(25, Math.min(50, 300 / Math.sqrt(nodeCount)))
      
      // Create simulation nodes and links
      const simulationNodes = entities.map((entity, i) => ({
        id: entity.id,
        name: entity.name,
        properties: entity.properties,
        // Start with a circular initial position for better distribution - doubled radius
        x: width / 2 + Math.cos(2 * Math.PI * i / nodeCount) * Math.min(width, height) * 2 / 3,
        y: height / 2 + Math.sin(2 * Math.PI * i / nodeCount) * Math.min(width, height) * 2 / 3
      }))
      
      const simulationLinks = relationships
        .filter(rel => rel.type)
        .map((rel) => ({
          source: rel.source,
          target: rel.target,
          type: rel.type,
          properties: rel.properties
        }))

      // Calculate node degrees (number of connections)
      const nodeDegrees = new Map<string, number>()
      entities.forEach(entity => nodeDegrees.set(entity.id, 0))
      
      simulationLinks.forEach(link => {
        nodeDegrees.set(link.source, (nodeDegrees.get(link.source) || 0) + 1)
        nodeDegrees.set(link.target, (nodeDegrees.get(link.target) || 0) + 1)
      })
      
      // Find max degree for normalization
      const maxDegree = Math.max(...Array.from(nodeDegrees.values()))

      // Create force simulation with connectivity-based positioning
      const simulation = d3.forceSimulation(simulationNodes)
        .force('link', d3.forceLink(simulationLinks)
          .id((d: any) => d.id)
          .distance(linkDistance)
          .strength(1.5) // Stronger link force to keep connected nodes together
        )
        .force('charge', d3.forceManyBody()
          .strength(chargeStrength)
          .distanceMax(200)
        )
        .force('collision', d3.forceCollide()
          .radius(collideRadius)
          .strength(0.8)
          .iterations(2)
        )
        // Add radial force based on connectivity - 1.2x radius
        .force('radial', d3.forceRadial((d: any) => {
          const degree = nodeDegrees.get(d.id) || 0
          if (degree === 0) {
            // Isolated nodes go to outer circle - 1.2x
            return Math.min(width, height) * 0.48
          } else {
            // Connected nodes: more connections = closer to center - 1.2x
            const normalizedDegree = degree / maxDegree
            return Math.min(width, height) * 0.36 * (1 - normalizedDegree)
          }
        }, width / 2, height / 2).strength(0.8))
        // Weaker centering force
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05))

      // Run simulation with more iterations for better convergence
      simulation.stop()
      for (let i = 0; i < 300; i++) simulation.tick()

      // Calculate bounds to center the graph
      const xValues = simulationNodes.map((d: any) => d.x)
      const yValues = simulationNodes.map((d: any) => d.y)
      const xMin = Math.min(...xValues)
      const xMax = Math.max(...xValues)
      const yMin = Math.min(...yValues)
      const yMax = Math.max(...yValues)
      const xOffset = (xMin + xMax) / 2 - width / 2
      const yOffset = (yMin + yMax) / 2 - height / 2

      // Dynamic node sizing based on count - reduced by 30%
      const nodeSize = Math.max(28, Math.min(56, 560 / Math.sqrt(nodeCount)))
      const fontSize = Math.max(8, Math.min(10, nodeSize / 7))

      // Convert to React Flow nodes with centered positions
      const nodeData: Node[] = simulationNodes.map((node: any) => ({
        id: node.id,
        type: 'default',
        position: {
          x: node.x - xOffset,
          y: node.y - yOffset
        },
        data: { 
          label: node.name || node.id,
          ...node.properties 
        },
        style: {
          background: '#1a1a1a',
          color: '#fff',
          border: '1px solid #555',
          borderRadius: '8px',
          padding: '8px',
          fontSize: `${fontSize}px`,
          width: 'auto',
          minWidth: `${nodeSize}px`,
        },
      }))

      // Convert to React Flow edges
      const edgeData: Edge[] = relationships
        .filter(rel => rel.type)
        .map((rel, index) => ({
          id: `edge-${index}`,
          source: rel.source,
          target: rel.target,
          label: rel.type,
          type: 'smoothstep',
          animated: true,
          style: {
            stroke: '#555',
            strokeWidth: 2,
          },
          labelStyle: {
            fill: '#999',
            fontSize: '10px',
          },
        }))

      setNodes(nodeData)
      setEdges(edgeData)
    }
  }, [entities, relationships, layoutDirection, layoutType, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{
          padding: 0.05,
          includeHiddenNodes: false,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        attributionPosition="bottom-left"
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={12} 
          size={1} 
          color="#333"
        />
        <Controls 
          style={{
            background: '#1a1a1a',
            border: '1px solid #555',
          }}
        />
      </ReactFlow>
    </div>
  )
}