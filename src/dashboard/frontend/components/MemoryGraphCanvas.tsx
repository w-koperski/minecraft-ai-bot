'use client';

import { useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { MemoryGraphNode, MemoryGraphEdge } from '@/lib/types';

const NODE_TYPE_COLORS: Record<string, string> = {
  spatial_memory: '#4ade80',
  temporal_memory: '#60a5fa',
  episodic_memory: '#fbbf24',
  semantic_memory: '#c084fc',
  spatial_index: '#2dd4bf',
  player: '#fb7185',
  item: '#f97316',
  location: '#34d399',
  unknown: '#71717a',
};

const LINK_TYPE_COLORS: Record<string, string> = {
  INVOLVES: '#fbbf24',
  IN_BIOME: '#2dd4bf',
  located_at: '#4ade80',
  happened_at: '#60a5fa',
  related_to: '#71717a',
};

interface GraphNode extends MemoryGraphNode {
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  metadata: Record<string, unknown>;
  validFrom: number | null;
  validUntil: number | null;
  color?: string;
}

interface MemoryGraphCanvasProps {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  width: number;
  height: number;
  onNodeHover: (tooltip: string | null) => void;
  onLinkHover: (tooltip: string | null) => void;
}

export default function MemoryGraphCanvas({
  nodes,
  edges,
  width,
  height,
  onNodeHover,
  onLinkHover,
}: MemoryGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const graphData = {
    nodes: nodes.map((n) => ({ ...n })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      metadata: e.metadata,
      validFrom: e.validFrom,
      validUntil: e.validUntil,
      color: LINK_TYPE_COLORS[e.type] || '#444',
    })),
  };

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      if (!node) {
        onNodeHover(null);
        return;
      }

      const props = node.properties || {};
      const propLines = Object.entries(props)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join('\n');

      const validFrom = node.validFrom ? new Date(node.validFrom).toLocaleString() : '\u2014';
      const validUntil = node.validUntil ? new Date(node.validUntil).toLocaleString() : '\u221e';

      onNodeHover(
        [node.label || node.id, `Type: ${node.type}`, `Valid: ${validFrom} \u2192 ${validUntil}`, propLines]
          .filter(Boolean)
          .join('\n')
      );
    },
    [onNodeHover]
  );

  const handleLinkHover = useCallback(
    (link: GraphLink | null) => {
      if (!link) {
        onLinkHover(null);
        return;
      }
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      onLinkHover(`${src} \u2192 ${tgt}\nRelation: ${link.type}`);
    },
    [onLinkHover]
  );

  const nodeColor = useCallback((node: GraphNode) => {
    return NODE_TYPE_COLORS[node.type] || NODE_TYPE_COLORS.unknown;
  }, []);

  const nodeSize = useCallback((node: GraphNode) => {
    const typeScale: Record<string, number> = {
      episodic_memory: 8,
      semantic_memory: 6,
      spatial_memory: 7,
      temporal_memory: 5,
      player: 9,
      spatial_index: 4,
    };
    return typeScale[node.type] || 5;
  }, []);

  return (
    <div ref={containerRef}>
      <ForceGraph2D
        graphData={graphData}
        width={width}
        height={height}
        nodeId="id"
        nodeLabel="label"
        nodeColor={nodeColor}
        nodeVal={nodeSize}
        nodeRelSize={1}
        linkSource="source"
        linkTarget="target"
        linkColor={(link: GraphLink) => link.color || '#444'}
        linkWidth={1}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.9}
        linkDirectionalArrowColor={(link: GraphLink) => link.color || '#444'}
        linkCurvature={0.1}
        backgroundColor="transparent"
        onNodeHover={handleNodeHover}
        onLinkHover={handleLinkHover}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTicks={200}
        warmupTicks={50}
      />
    </div>
  );
}