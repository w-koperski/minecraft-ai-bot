'use client';

import { useWebSocket } from '@/hooks/useWebSocket';
import styles from './DriveViz.module.css';

const DRIVE_CONFIG: Record<string, { label: string; cssClass: string }> = {
  survival: { label: 'Survival', cssClass: styles.survival },
  curiosity: { label: 'Curiosity', cssClass: styles.curiosity },
  competence: { label: 'Competence', cssClass: styles.competence },
  social: { label: 'Social', cssClass: styles.social },
  goalOriented: { label: 'Goal-Oriented', cssClass: styles.goalOriented },
};

const DRIVE_ORDER = ['survival', 'curiosity', 'competence', 'social', 'goalOriented'] as const;

function DriveBar({ driveKey, score }: { driveKey: string; score: number }) {
  const config = DRIVE_CONFIG[driveKey];
  if (!config) return null;

  const clamped = Math.min(Math.max(score, 0), 100);

  return (
    <div className={`${styles.driveRow} ${config.cssClass}`}>
      <div className={styles.driveHeader}>
        <span className={styles.driveLabel}>{config.label}</span>
        <span className={styles.driveScore}>{clamped}</span>
      </div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export default function DriveViz() {
  const { state } = useWebSocket();
  const driveScores = state?.driveScores;

  if (!driveScores || Object.keys(driveScores).length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Drives</div>
          <div className={styles.emptyState}>No drive data</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Drives</div>
        <div className={styles.driveList}>
          {DRIVE_ORDER.map((key) => (
            <DriveBar
              key={key}
              driveKey={key}
              score={driveScores[key] ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}