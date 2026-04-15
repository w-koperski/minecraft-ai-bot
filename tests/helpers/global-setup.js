const { exec } = require('child_process');
const https = require('https');
const http = require('http');

const MINECRAFT_HOST = process.env.MINECRAFT_HOST || 'localhost';
const MINECRAFT_PORT = parseInt(process.env.MINECRAFT_PORT) || 25565;

function checkServerConnection(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = require('net').Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function waitForServer(maxAttempts = 30, delay = 1000) {
  console.log('[Global Setup] Checking Minecraft server availability...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const available = await checkServerConnection(MINECRAFT_HOST, MINECRAFT_PORT);
    if (available) {
      console.log(`[Global Setup] Minecraft server available (attempt ${attempt}/${maxAttempts})`);
      return true;
    }
    
    if (attempt < maxAttempts) {
      console.log(`[Global Setup] Waiting for server... (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

module.exports = async () => {
  console.log('[Global Setup] E2E test suite starting...');
  
  const serverAvailable = await waitForServer();
  
  if (!serverAvailable) {
    console.error('[Global Setup] ERROR: Minecraft server not available');
    console.error('[Global Setup] Please start Minecraft server before running E2E tests');
    console.error('[Global Setup] Docker command: docker run -d -p 25565:25565 --name mc-server itzg/minecraft-server');
    console.error('[Global Setup] Or set MINECRAFT_HOST and MINECRAFT_PORT environment variables');
    process.exit(1);
  }
  
  console.log('[Global Setup] E2E environment ready');
};
