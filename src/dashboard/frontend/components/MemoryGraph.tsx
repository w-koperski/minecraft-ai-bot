'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { MemoryGraphData } from '@/lib/types';
import styles from './MemoryGraph.module.css';

const MemoryGraphCanvas = dynamic(() => import('./MemoryGraphCanvas'), { ssr: false });

const API_URL = 'http://localhost:3001/api/memory';
const REFRESH_INTERVAL_MS = 30_000;

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

export default function MemoryGraph() {
  const [data, setData] = useState<MemoryGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: MemoryGraphData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch memory data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: Math.max(rect.height, 300) });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleNodeHover = useCallback((tooltip: string | null) => {
    setHoverTooltip(tooltip);
  }, []);

  const handleLinkHover = useCallback((tooltip: string | null) => {
    setHoverTooltip(tooltip);
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.cardTitle}>Memory Graph</div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
          <div>Loading memory data\u2026</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.cardTitle}>Memory Graph</div>
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>!</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (!data || data.nodeCount === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.cardTitle}>Memory Graph</div>
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="2" opacity="0.4" />
              <circle cx="14" cy="18" r="3" fill="currentColor" opacity="0.3" />
              <circle cx="26" cy="18" r="3" fill="currentColor" opacity="0.3" />
              <line x1="17" y1="18" x2="23" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.2" />
            </svg>
          </div>
          <div>No memory data</div>
          <div className={styles.emptyHint}>The knowledge graph will populate as the bot explores</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.cardTitle}>Memory Graph</div>
        <div className={styles.stats}>
          <span className={styles.stat}>{data.nodeCount} nodes</span>
          <span className={styles.statDivider}>&middot;</span>
          <span className={styles.stat}>{data.edgeCount} edges</span>
          {data.memoryTiers && (
            <>
              <span className={styles.statDivider}>&middot;</span>
              <span className={styles.statTier}>
                <span className={styles.tierStm}>STM {data.memoryTiers.stm}</span>
                <span className={styles.tierEpi}>EPI {data.memoryTiers.episodic}</span>
                <span className={styles.tierLtm}>LTM {data.memoryTiers.ltm}</span>
              </span>
            </>
          )}
        </div>
      </div>

      <div className={styles.graphWrapper} ref={containerRef}>
        <MemoryGraphCanvas
          nodes={data.nodes}
          edges={data.edges}
          width={dimensions.width}
          height={dimensions.height}
          onNodeHover={handleNodeHover}
          onLinkHover={handleLinkHover}
        />

        {hoverTooltip && (
          <div className={styles.tooltip}>
            <pre className={styles.tooltipContent}>{hoverTooltip}</pre>
          </div>
        )}
      </div>

      <div className={styles.legend}>
        {Object.entries(NODE_TYPE_COLORS)
          .filter(([type]) => data.nodes.some((n) => n.type === type))
          .map(([type, color]) => (
            <div key={type} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: color }} />
              <span className={styles.legendLabel}>{type.replace(/_/g, ' ')}</span>
            </div>
          ))}
      </div>
    </div>
  );
}