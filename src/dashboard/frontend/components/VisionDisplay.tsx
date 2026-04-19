'use client';

import { useState, useEffect, useCallback } from 'react';
import type { VisionData, VisionMode } from '@/lib/types';
import styles from './VisionDisplay.module.css';

const API_URL = 'http://localhost:3001/api/vision';
const REFRESH_INTERVAL_MS = 5_000;

const MODE_CONFIG: Record<VisionMode, { label: string; className: string }> = {
  danger: { label: 'Danger', className: styles.modeDanger },
  active: { label: 'Active', className: styles.modeActive },
  idle: { label: 'Idle', className: styles.modeIdle },
};

function ModeBadge({ mode }: { mode: VisionMode }) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.idle;
  return <span className={`${styles.modeBadge} ${config.className}`}>{config.label}</span>;
}

function CacheStats({ hits, misses, age }: { hits: number; misses: number; age: number | null }) {
  const total = hits + misses;
  const hitRate = total > 0 ? Math.round((hits / total) * 100) : 0;
  const ageSec = age !== null ? (age / 1000).toFixed(0) : '—';

  return (
    <div className={styles.cacheRow}>
      <div className={styles.cacheItem}>
        <span className={styles.cacheLabel}>Hits</span>
        <span className={styles.cacheValue}>{hits}</span>
      </div>
      <div className={styles.cacheItem}>
        <span className={styles.cacheLabel}>Misses</span>
        <span className={styles.cacheValue}>{misses}</span>
      </div>
      <div className={styles.cacheItem}>
        <span className={styles.cacheLabel}>Rate</span>
        <span className={styles.cacheValue}>{hitRate}%</span>
      </div>
      <div className={styles.cacheItem}>
        <span className={styles.cacheLabel}>Age</span>
        <span className={styles.cacheValue}>{ageSec}s</span>
      </div>
    </div>
  );
}

function AnalysisList({ items, emptyText, variant }: { items: string[]; emptyText: string; variant: 'observation' | 'threat' | 'entity' }) {
  if (items.length === 0) {
    return <div className={styles.listEmpty}>{emptyText}</div>;
  }

  const itemClass = variant === 'threat' ? styles.itemThreat : variant === 'entity' ? styles.itemEntity : styles.itemObservation;

  return (
    <div className={styles.list}>
      {items.map((item, i) => (
        <div key={`${variant}-${i}`} className={`${styles.listItem} ${itemClass}`}>
          {item}
        </div>
      ))}
    </div>
  );
}

export default function VisionDisplay() {
  const [visionData, setVisionData] = useState<VisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: VisionData = await res.json();
      setVisionData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vision data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Vision</div>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <div>Loading vision data…</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Vision</div>
          <div className={styles.errorContainer}>
            <div className={styles.errorIcon}>!</div>
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!visionData || !visionData.enabled) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Vision</div>
          <div className={styles.emptyContainer}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <circle cx="20" cy="20" r="2" fill="currentColor" opacity="0.3" />
              </svg>
            </div>
            <div>Vision disabled</div>
            <div className={styles.emptyHint}>Set ENABLE_VISION=true to activate visual analysis</div>
          </div>
        </div>
      </div>
    );
  }

  const analysis = visionData.analysis;

  if (!analysis || !analysis.running) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Vision</div>
          <div className={styles.emptyContainer}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <circle cx="20" cy="20" r="2" fill="currentColor" opacity="0.3" />
              </svg>
            </div>
            <div>Vision not running</div>
            <div className={styles.emptyHint}>Waiting for VisionProcessor to start</div>
          </div>
        </div>
      </div>
    );
  }

  const lastTime = analysis.lastAnalysisTime
    ? new Date(analysis.lastAnalysisTime).toLocaleTimeString()
    : '—';

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.cardTitle}>Vision</div>
          <div className={styles.headerMeta}>
            <ModeBadge mode={analysis.mode} />
            <span className={styles.analysisCount}>#{analysis.analysisCount}</span>
          </div>
        </div>

        {analysis.lastError && (
          <div className={styles.errorBanner}>
            <span className={styles.errorDot} />
            {analysis.lastError}
          </div>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Last analysis</span>
          <span className={styles.metaValue}>{lastTime}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Interval</span>
          <span className={styles.metaValue}>{(analysis.interval / 1000).toFixed(1)}s</span>
        </div>

        <div className={styles.divider} />

        <div className={styles.sectionTitle}>Cache</div>
        <CacheStats hits={analysis.cacheHits} misses={analysis.cacheMisses} age={analysis.cacheAge} />

        <div className={styles.divider} />

      {analysis.screenshot && (
        <>
          <div className={styles.sectionTitle}>Screenshot</div>
          <img
            className={styles.screenshot}
            src={`data:image/png;base64,${analysis.screenshot}`}
            alt="Latest vision analysis"
          />
        </>
      )}

      <div className={styles.sectionTitle}>Threats</div>
      <AnalysisList
        items={analysis.latestAnalysis?.threats ?? []}
        emptyText="No threats detected"
        variant="threat"
      />

      <div className={styles.sectionTitle}>Observations</div>
      <AnalysisList
        items={analysis.latestAnalysis?.observations ?? []}
        emptyText="No observations yet"
        variant="observation"
      />

      <div className={styles.sectionTitle}>Entities</div>
      <AnalysisList
        items={analysis.latestAnalysis?.entities ?? []}
        emptyText="No entities detected"
        variant="entity"
      />

        {analysis.errorCount > 0 && (
          <>
            <div className={styles.divider} />
            <div className={styles.errorCountRow}>
              <span className={styles.errorCountLabel}>Errors</span>
              <span className={styles.errorCountValue}>{analysis.errorCount}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
