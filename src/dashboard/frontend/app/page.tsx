import BotStatus from '@/components/BotStatus';
import DriveViz from '@/components/DriveViz';
import MemoryGraph from '@/components/MemoryGraph';

export default function Home() {
  return (
    <div className="dashboard">
      <header className="header">
        <h1>Minecraft AI Bot Dashboard</h1>
      </header>
      <main className="main">
        <BotStatus />
        <DriveViz />
        <MemoryGraph />
      </main>
    </div>
  );
}