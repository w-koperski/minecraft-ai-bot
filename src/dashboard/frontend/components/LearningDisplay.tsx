'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LearningData, LearningMetricsData, StrategyData } from '@/lib/types';
import styles from './LearningDisplay.module.css';

const API_URL = 'http://localhost:3001/api/learning';
const REFRESH_INTERVAL_MS = 5_000;

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function MetricsOverview({ metrics }: { metrics: LearningMetricsData }) {
  const reusePercent = formatPercent(metrics.strategyReuseRate);
  const totalCycles = metrics.totalPlanningCycles;

  return (
    <div className={styles.metricsGrid}>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Reuse Rate</span>
        <span className={styles.metricValue}>{reusePercent}</span>
        <span className={styles.metricSub}>
          {metrics.totalApplications} / {totalCycles} cycles
        </span>
      </div>
      <div className={styles.metricItem}>
        <span className={styles.metricLabel}>Cycles</span>
        <span className={styles.metricValue}>{totalCycles}</span>
        <span className={styles.metricSub}>total planning</span>
      </div>
    </div>
  );
}

function SuccessComparison({ metrics }: { metrics: LearningMetricsData }) {
  const strategyRate = metrics.strategySuccessRate;
  const freshRate = metrics.freshPlanningSuccessRate;
  const improvement = strategyRate - freshRate;

  return (
    <div className={styles.comparisonSection}>
      <div className={styles.comparisonRow}>
        <div className={styles.comparisonItem}>
          <span className={styles.comparisonLabel}>Strategy</span>
          <div className={styles.barContainer}>
            <div
              className={`${styles.barFill} ${styles.barStrategy}`}
              style={{ width: `${Math.round(strategyRate * 100)}%` }}
            />
          </div>
          <span className={styles.comparisonValue}>{formatPercent(strategyRate)}</span>
        </div>
        <div className={styles.comparisonDetails}>
          {metrics.strategySuccesses}S / {metrics.strategyFailures}F
        </div>
      </div>
      <div className={styles.comparisonRow}>
        <div className={styles.comparisonItem}>
          <span className={styles.comparisonLabel}>Fresh</span>
          <div className={styles.barContainer}>
            <div
              className={`${styles.barFill} ${styles.barFresh}`}
              style={{ width: `${Math.round(freshRate * 100)}%` }}
            />
          </div>
          <span className={styles.comparisonValue}>{formatPercent(freshRate)}</span>
        </div>
        <div className={styles.comparisonDetails}>
          {metrics.freshSuccesses}S / {metrics.freshFailures}F
        </div>
      </div>
      {improvement !== 0 && (
        <div className={`${styles.improvementRow} ${improvement > 0 ? styles.improvementPositive : styles.improvementNegative}`}>
          <span className={styles.improvementLabel}>
            {improvement > 0 ? '↗ Strategy leads' : '↘ Fresh leads'}
          </span>
          <span className={styles.improvementValue}>
            {improvement > 0 ? '+' : ''}{formatPercent(Math.abs(improvement))}
          </span>
        </div>
      )}
    </div>
  );
}

function StrategyList({ strategies }: { strategies: StrategyData[] }) {
  if (strategies.length === 0) {
    return <div className={styles.listEmpty}>No strategies stored yet</div>;
  }

  return (
    <div className={styles.list}>
      {strategies.map((s) => (
        <div key={s.id} className={styles.strategyCard}>
          <div className={styles.strategyHeader}>
            <span className={styles.strategyContext} title={s.context}>
              {s.context.length > 48 ? `${s.context.slice(0, 48)}…` : s.context}
            </span>
            <span className={styles.strategyRate}>
              {Math.round(s.success_rate * 100)}%
            </span>
          </div>
          {s.actions && s.actions.length > 0 && (
            <ul className={styles.actionList}>
              {s.actions.slice(0, 3).map((action, i) => (
                <li key={i} className={styles.actionItem}>{action}</li>
              ))}
              {s.actions.length > 3 && (
                <li className={styles.actionMore}>+{s.actions.length - 3} more</li>
              )}
            </ul>
          )}
          {s.outcome && (
            <div className={styles.strategyOutcome}>{s.outcome}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LearningDisplay() {
  const [data, setData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: LearningData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch learning data');
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
          <div className={styles.cardTitle}>Learning</div>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <div>Loading learning data…</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Learning</div>
          <div className={styles.errorContainer}>
            <div className={styles.errorIcon}>!</div>
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.enabled) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Learning</div>
          <div className={styles.emptyContainer}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                <path d="M20 16L24 20L20 24L16 20L20 16Z" fill="currentColor" opacity="0.3" />
              </svg>
            </div>
            <div>Learning disabled</div>
            <div className={styles.emptyHint}>Set ENABLE_META_LEARNING=true to activate strategy learning</div>
          </div>
        </div>
      </div>
    );
  }

  if (!data.metrics || data.metrics.totalPlanningCycles === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Learning</div>
          <div className={styles.emptyContainer}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                <path d="M20 16L24 20L20 24L16 20L20 16Z" fill="currentColor" opacity="0.3" />
              </svg>
            </div>
            <div>No learning data yet</div>
            <div className={styles.emptyHint}>Strategies will appear after planning cycles complete</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Learning</div>

        <MetricsOverview metrics={data.metrics} />

        <div className={styles.divider} />

        <div className={styles.sectionTitle}>Success Rate</div>
        <SuccessComparison metrics={data.metrics} />

        {data.strategies.length > 0 && (
          <>
            <div className={styles.divider} />
            <div className={styles.sectionTitle}>Recent Strategies</div>
            <StrategyList strategies={data.strategies} />
          </>
        )}
      </div>
    </div>
  );
}