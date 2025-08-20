import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { WebSocketMessage } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients = new Set<any>();
  private logger = Logger.getInstance();

  constructor(server: Server) {
    try {
      this.logger.verbose('Initializing WebSocket server');
      this.wss = new WebSocketServer({ server });
      this.setupEventHandlers();
      this.logger.success('WebSocket server initialized');
    } catch (error) {
      this.logger.error('Failed to initialize WebSocket server', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws) => {
      this.logger.verbose('WebSocket client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        this.logger.verbose('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        this.logger.warn('WebSocket client error', error);
        this.clients.delete(ws);
      });

      // Safely send welcome message
      this.safeWsSend(ws, {
        type: 'connected',
        data: { message: 'Connected to checkpoint server' }
      });
    });

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error', error);
    });
  }

  private safeWsSend(ws: any, message: WebSocketMessage): boolean {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
        return true;
      } else {
        this.logger.debug(`WebSocket not ready, state: ${ws.readyState}`);
        this.clients.delete(ws);
        return false;
      }
    } catch (error) {
      this.logger.warn('Failed to send WebSocket message', error);
      this.clients.delete(ws);
      return false;
    }
  }

  broadcast(message: WebSocketMessage): void {
    this.logger.debug(`Broadcasting message to ${this.clients.size} clients`, { type: message.type });
    
    // Convert to array to avoid modification during iteration
    const clientsArray = Array.from(this.clients);
    let successCount = 0;
    
    clientsArray.forEach((ws) => {
      if (this.safeWsSend(ws, message)) {
        successCount++;
      }
    });
    
    this.logger.debug(`Broadcast sent to ${successCount}/${clientsArray.length} clients`);
  }

  broadcastSessionStart(session: any): void {
    this.broadcast({
      type: 'session_start',
      data: session
    });
  }

  broadcastSessionStop(session: any): void {
    this.broadcast({
      type: 'session_stop',
      data: session
    });
  }

  broadcastCheckpointCreated(checkpoint: any): void {
    this.broadcast({
      type: 'checkpoint_created',
      data: checkpoint
    });
  }

  getConnectedClients(): number {
    return this.clients.size;
  }
}