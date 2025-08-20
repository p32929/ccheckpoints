import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CheckpointManager } from '../core/checkpoint-manager-sqlite.js';
import { WebSocketService } from './websocket.js';
import { createRoutes } from './routes.js';
import { Logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '9271', 10);

export class WebServer {
  private app: express.Application;
  private server: any;
  private checkpointManager: CheckpointManager;
  private wsService: WebSocketService;
  private logger = Logger.getInstance();

  constructor() {
    this.logger.verbose('Initializing WebServer');
    this.app = express();
    this.server = createServer(this.app);
    
    try {
      this.logger.verbose('Creating CheckpointManager instance');
      this.checkpointManager = new CheckpointManager();
      this.logger.verbose('CheckpointManager created successfully');
      
      this.logger.verbose('Creating WebSocketService instance');
      this.wsService = new WebSocketService(this.server);
      this.logger.verbose('WebSocketService created successfully');
    } catch (error) {
      this.logger.error('Error during WebServer initialization', error);
      throw error;
    }
    
    this.setupMiddleware();
    this.setupRoutes();
    this.logger.success('WebServer initialization completed');
  }

  private setupMiddleware(): void {
    this.logger.verbose('Setting up middleware');
    
    this.app.use(cors());
    this.logger.debug('CORS middleware added');
    
    // Custom JSON parsing with better error handling
    this.app.use(express.json({
      strict: false,
      verify: (req: any, res, buf) => {
        try {
          JSON.parse(buf.toString());
        } catch (e) {
          this.logger.warn('Received malformed JSON request', {
            url: req.url,
            method: req.method,
            error: e instanceof Error ? e.message : String(e),
            body: buf.toString().substring(0, 200) + (buf.length > 200 ? '...' : '')
          });
        }
      }
    }));
    this.logger.debug('JSON parsing middleware added');
    
    // Fallback error handler for JSON parsing
    this.app.use((error: any, req: any, res: any, next: any) => {
      if (error instanceof SyntaxError && 'body' in error) {
        this.logger.warn('JSON parsing error caught and handled gracefully', error);
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON format',
          details: 'Please check your JSON syntax and escape sequences'
        });
      }
      next(error);
    });
    this.logger.debug('Error handling middleware added');
    
    const publicPath = resolve(__dirname, '../../public');
    this.logger.verbose(`Setting up static files from: ${publicPath}`);
    this.app.use(express.static(publicPath));
    this.logger.debug('Static file middleware added');
  }

  private setupRoutes(): void {
    this.logger.verbose('Setting up routes');
    
    // API routes first
    const routes = createRoutes(this.checkpointManager, this.wsService);
    this.app.use(routes);
    this.logger.debug('API routes added');

    // Root route
    this.app.get('/', (req, res) => {
      const indexPath = resolve(__dirname, '../../public/index.html');
      this.logger.debug(`Serving index.html from: ${indexPath}`);
      res.sendFile(indexPath);
    });
    this.logger.debug('Root route added');

    // Catch-all route LAST (after all other routes)
    this.app.get('*', (req, res) => {
      this.logger.warn(`404 - Endpoint not found: ${req.url}`);
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
    this.logger.debug('Catch-all route added');
  }

  async start(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.logger.info(`Starting server on port ${PORT}`);
        
        this.server.listen(PORT, '127.0.0.1', async () => {
          console.log('🚀 CCheckpoint Server Started');
          console.log('═'.repeat(50));
          console.log(`🌐 Server: http://127.0.0.1:${PORT}`);
          console.log(`📊 Dashboard: http://127.0.0.1:${PORT}`);
          console.log(`🔌 API: http://127.0.0.1:${PORT}/api`);
          console.log(`⚡ WebSocket: ws://127.0.0.1:${PORT}`);
          console.log('═'.repeat(50));
          console.log('💡 Ready to track Claude Code checkpoints!');
          console.log('🛑 Press Ctrl+C to stop');
          
          await this.logger.success(`Server started successfully on port ${PORT}`);
          resolve();
        });

        this.server.on('error', async (error: any) => {
          if (error.code === 'EADDRINUSE') {
            await this.logger.error(`Port ${PORT} is already in use`);
            console.error(`❌ Port ${PORT} is already in use`);
            console.error('Please stop the other service or choose a different port');
          } else {
            await this.logger.error('Server error', error);
            console.error('❌ Server error:', error);
          }
          reject(error);
        });
      } catch (error) {
        await this.logger.error('Failed to start server', error);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise(async (resolve) => {
      await this.logger.info('Stopping server');
      this.server.close(async () => {
        console.log('🛑 Server stopped');
        await this.logger.info('Server stopped successfully');
        resolve();
      });
    });
  }

  async cleanup(): Promise<void> {
    try {
      await this.logger.verbose('Starting cleanup process');
      await this.checkpointManager.close();
      await this.logger.success('Cleanup completed successfully');
    } catch (error) {
      await this.logger.error('Error during cleanup', error);
    }
  }
}