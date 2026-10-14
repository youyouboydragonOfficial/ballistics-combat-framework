// server/server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessage, ServerMessage, PlayerNetState } from './protocol.ts';

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

interface ClientSession {
  ws: WebSocket;
  state: PlayerNetState;
}

const clients = new Map<string, ClientSession>();
let nextClientId = 1;

console.log(`====================================================`);
console.log(`[Combat Server] WebSocket Server listening on port ${PORT}`);
console.log(`[Combat Server] Ready for TPS/FPS multiplayer matches!`);
console.log(`====================================================`);

wss.on('connection', (ws: WebSocket) => {
  const playerId = `player_${nextClientId++}`;

  const initialPlayer: PlayerNetState = {
    id: playerId,
    name: `User_${nextClientId - 1}`,
    position: [0, 0, 0],
    rotation: { yaw: 0, pitch: 0 },
    velocity: [0, 0, 0],
    isAiming: false,
    health: 100,
    currentPresetId: 'fortnite_br'
  };

  clients.set(playerId, { ws, state: initialPlayer });
  console.log(`[Connect] ${playerId} joined (Total: ${clients.size})`);

  // 1. 接続したクライアントへ Welcome メッセージを送信
  const existingPlayers: PlayerNetState[] = [];
  for (const session of clients.values()) {
    existingPlayers.push(session.state);
  }

  const welcomeMsg: ServerMessage = {
    type: 'welcome',
    yourId: playerId,
    players: existingPlayers,
    bots: []
  };
  ws.send(JSON.stringify(welcomeMsg));

  // 2. 他の全クライアントへ新規プレイヤー参加を通知
  broadcast({
    type: 'player_joined',
    player: initialPlayer
  }, playerId);

  // メッセージ受信ハンドラ
  ws.on('message', (data: string) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      if (msg.type === 'update') {
        const session = clients.get(playerId);
        if (session) {
          session.state = {
            ...session.state,
            ...msg.state
          };

          // 他クライアントへ位置更新をブロードキャスト
          const { id: _, ...syncState } = session.state;
          broadcast({
            type: 'player_updated',
            id: playerId,
            state: syncState
          }, playerId);
        }
      } else if (msg.type === 'shoot') {
        // 射撃イベントを他クライアントへブロードキャスト
        broadcast({
          type: 'player_shoot',
          event: {
            shooterId: playerId,
            timestamp: Date.now(),
            ...msg.event
          }
        }, playerId);
      } else if (msg.type === 'hit') {
        // ヒットイベントをブロードキャスト
        broadcast({
          type: 'player_hit',
          event: {
            shooterId: playerId,
            ...msg.event
          }
        });
      }
    } catch (e) {
      console.error(`[Error] Failed to process message from ${playerId}:`, e);
    }
  });

  // 切断ハンドラ
  ws.on('close', () => {
    clients.delete(playerId);
    console.log(`[Disconnect] ${playerId} left (Total: ${clients.size})`);
    broadcast({
      type: 'player_left',
      id: playerId
    });
  });

  ws.on('error', (err) => {
    console.error(`[Socket Error] ${playerId}:`, err.message);
  });
});

/**
 * 全員（または除外ID以外）へブロードキャスト
 */
function broadcast(msg: ServerMessage, excludeId?: string): void {
  const data = JSON.stringify(msg);
  for (const [id, session] of clients.entries()) {
    if (id !== excludeId && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(data);
    }
  }
}
