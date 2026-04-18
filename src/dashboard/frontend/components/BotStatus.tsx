'use client';

import { useWebSocket } from '@/hooks/useWebSocket';
import type { BotStatusEnum, ConnectionState, InventoryItem } from '@/lib/types';
import styles from './BotStatus.module.css';

function ConnectionBanner({ state }: { state: ConnectionState }) {
  const config: Record<ConnectionState, { label: string; style: string; dotStyle: string }> = {
    connecting: { label: 'Connecting to server\u2026', style: styles.connectionBannerConnecting, dotStyle: styles.connectionDotConnecting },
    connected: { label: 'Connected', style: styles.connectionBannerConnected, dotStyle: styles.connectionDotConnected },
    disconnected: { label: 'Disconnected \u2014 reconnecting\u2026', style: styles.connectionBannerDisconnected, dotStyle: styles.connectionDotDisconnected },
    error: { label: 'Connection error \u2014 reconnecting\u2026', style: styles.connectionBannerError, dotStyle: styles.connectionDotError },
  };

  const { label, style, dotStyle } = config[state];

  return (
    <div className={`${styles.connectionBanner} ${style}`}>
      <span className={`${styles.connectionDot} ${dotStyle}`} />
      {label}
    </div>
  );
}

function StatusBadge({ status }: { status: BotStatusEnum }) {
  const styleMap: Record<BotStatusEnum, string> = {
    idle: styles.statusIdle,
    active: styles.statusActive,
    danger: styles.statusDanger,
    disconnected: styles.statusDisconnected,
  };

  return (
    <div className={styles.statusRow}>
      <span className={`${styles.statusText} ${styleMap[status]}`}>
        {status}
      </span>
    </div>
  );
}

function PositionDisplay({ position }: { position: { x: number; y: number; z: number } }) {
  return (
    <div className={styles.positionGrid}>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <div key={axis} className={styles.posItem}>
          <div className={styles.posLabel}>{axis.toUpperCase()}</div>
          <div className={styles.posValue}>{Math.round(position[axis])}</div>
        </div>
      ))}
    </div>
  );
}

function HealthBar({ health }: { health: number }) {
  const maxHealth = 20;
  const percent = Math.min(Math.max((health / maxHealth) * 100, 0), 100);

  let barStyle = styles.healthHigh;
  if (percent < 30) barStyle = styles.healthLow;
  else if (percent < 60) barStyle = styles.healthMedium;

  return (
    <div className={styles.healthBarContainer}>
      <div className={styles.healthLabel}>
        <span className={styles.healthValue}>{health}</span>
        <span className={styles.healthMax}>/ {maxHealth}</span>
      </div>
      <div className={styles.healthBar}>
        <div className={`${styles.healthBarFill} ${barStyle}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function InventoryList({ items }: { items: InventoryItem[] }) {
  if (items.length === 0) {
    return <div className={styles.inventoryEmpty}>No items</div>;
  }

  return (
    <div className={styles.inventoryList}>
      {items.map((item, i) => (
        <div key={`${item.name}-${i}`} className={styles.inventoryItem}>
          <span className={styles.itemName}>{item.name}</span>
          <span className={styles.itemCount}>&times;{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function GoalDisplay({ goal }: { goal: string | null }) {
  if (!goal) {
    return <div className={styles.goalEmpty}>No active goal</div>;
  }
  return <div className={styles.goalText}>{goal}</div>;
}

export default function BotStatus() {
  const { state, connectionState, lastUpdate } = useWebSocket();

  if (connectionState === 'connecting' && !state) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner} />
        <div>Connecting to bot server\u2026</div>
      </div>
    );
  }

  return (
    <div className={styles.status}>
      <ConnectionBanner state={connectionState} />

      {state && (
        <>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Status</div>
            <StatusBadge status={state.status} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Position</div>
            <PositionDisplay position={state.position} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Health</div>
            <HealthBar health={state.health} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Current Goal</div>
            <GoalDisplay goal={state.goal} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Inventory</div>
            <InventoryList items={state.inventory} />
            {state.connectedClients > 0 && (
              <div className={styles.clientsInfo}>
                {state.connectedClients} client{state.connectedClients !== 1 ? 's' : ''} connected
                {lastUpdate && ` \u00b7 updated ${new Date(lastUpdate).toLocaleTimeString()}`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}