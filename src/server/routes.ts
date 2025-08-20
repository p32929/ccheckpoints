import { Router } from 'express';
import type { CheckpointManager } from '../core/checkpoint-manager-sqlite.js';
import type { WebSocketService } from './websocket.js';
import { Logger } from '../utils/logger.js';

export function createRoutes(checkpointManager: CheckpointManager, wsService: WebSocketService): Router {
  const router = Router();
  const logger = Logger.getInstance();

  // Add logging middleware for all API routes
  router.use('/api/*', async (req, res, next) => {
    const startTime = Date.now();
    await logger.logServerRequest(req.method, req.url, req.body);
    
    const originalSend = res.send;
    res.send = function(body) {
      const responseTime = Date.now() - startTime;
      logger.logServerResponse(res.statusCode, req.url, responseTime);
      return originalSend.call(this, body);
    };
    
    next();
  });

  // Health endpoint - GET only
  router.get('/api/health', async (req, res) => {
    try {
      await logger.debug('Health check requested');
      const response = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        websocketConnections: wsService.getConnectedClients()
      };
      await logger.debug('Health check successful', response);
      res.json(response);
    } catch (error) {
      await logger.logException('health-check', error);
      res.status(500).json({ status: 'error', error: 'Health check failed' });
    }
  });

  router.post('/api/track', async (req, res) => {
    try {
      const { event, timestamp } = req.body;
      
      if (!event) {
        return res.status(400).json({
          success: false,
          error: 'Event type is required'
        });
      }

      // Map CLI events to CheckpointManager events
      let eventType: string;
      switch (event) {
        case 'submit':
          eventType = 'UserPromptSubmit';
          break;
        case 'stop':
          eventType = 'Stop';
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Unknown event type'
          });
      }

      const result = await checkpointManager.handleClaudeEvent(eventType, { timestamp });
      
      if (eventType === 'UserPromptSubmit' && result) {
        wsService.broadcastSessionStart(result);
      } else if (eventType === 'Stop' && result) {
        wsService.broadcastCheckpointCreated(result);
      }

      return res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error('Error tracking event:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to track event'
      });
    }
  });

  router.post('/api/stats', async (req, res) => {
    try {
      await logger.logCall('getProjectStats');
      await logger.verbose('Stats endpoint called');
      await logger.verbose('Current working directory', { cwd: process.cwd() });
      
      const stats = await checkpointManager.getProjectStats();
      
      await logger.logReturn('getProjectStats', stats);
      await logger.success('Stats retrieved successfully');
      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      await logger.logException('api-stats', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch project statistics'
      });
    }
  });

  router.post('/api/checkpoints', async (req, res) => {
    try {
      const { projectPath } = req.body;
      await logger.logCall('getCheckpoints', [projectPath]);
      
      if (!projectPath) {
        await logger.warn('Missing projectPath in request body');
        return res.status(400).json({
          success: false,
          error: 'Project path is required in request body'
        });
      }
      
      const checkpoints = await checkpointManager.getCheckpoints(projectPath);
      await logger.logReturn('getCheckpoints', checkpoints);
      
      return res.json({
        success: true,
        data: checkpoints
      });
    } catch (error) {
      await logger.logException('api-checkpoints', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch checkpoints'
      });
    }
  });

  router.post('/api/checkpoint', async (req, res) => {
    try {
      const { checkpointId } = req.body;
      await logger.logCall('getCheckpointById', [checkpointId]);
      
      if (!checkpointId) {
        await logger.warn('Missing checkpointId in request body');
        return res.status(400).json({
          success: false,
          error: 'Checkpoint ID is required in request body'
        });
      }
      
      const checkpoint = await checkpointManager.getCheckpointById(checkpointId);
      await logger.logReturn('getCheckpointById', checkpoint);
      
      if (!checkpoint) {
        await logger.warn(`Checkpoint not found: ${checkpointId}`);
        return res.status(404).json({
          success: false,
          error: 'Checkpoint not found'
        });
      }

      return res.json({
        success: true,
        data: checkpoint
      });
    } catch (error) {
      await logger.logException('api-checkpoint', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch checkpoint'
      });
    }
  });

  router.post('/api/current-session', async (req, res) => {
    try {
      await logger.logCall('getCurrentSession');
      const session = checkpointManager.getCurrentSession();
      await logger.logReturn('getCurrentSession', session);
      return res.json({
        success: true,
        data: session
      });
    } catch (error) {
      await logger.logException('api-current-session', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch current session'
      });
    }
  });

  router.post('/api/claude-event', async (req, res) => {
    try {
      const { eventType, data } = req.body;
      
      if (!eventType) {
        return res.status(400).json({
          success: false,
          error: 'Event type is required'
        });
      }

      const result = await checkpointManager.handleClaudeEvent(eventType, data || {});
      
      if (eventType === 'UserPromptSubmit' && result) {
        wsService.broadcastSessionStart(result);
      } else if (eventType === 'Stop' && result) {
        wsService.broadcastCheckpointCreated(result);
      }

      return res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error('Error handling Claude event:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to handle Claude event'
      });
    }
  });

  // Cache management endpoints
  router.post('/api/cache/stats', async (req, res) => {
    try {
      const { projectPath } = req.body;
      
      if (!projectPath) {
        return res.status(400).json({
          success: false,
          error: 'Project path is required in request body'
        });
      }
      
      const stats = await checkpointManager.getProjectIndexStats(projectPath);
      
      return res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching cache stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch cache statistics'
      });
    }
  });

  router.post('/api/cache/reset', async (req, res) => {
    try {
      const { projectPath } = req.body;
      await checkpointManager.resetProjectIndex(projectPath);
      
      return res.json({
        success: true,
        message: projectPath 
          ? `Cache cleared for project: ${projectPath}` 
          : 'All project caches cleared'
      });
    } catch (error) {
      console.error('Error resetting cache:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to reset cache'
      });
    }
  });

  router.post('/api/cache/force-scan', async (req, res) => {
    try {
      const { projectPath } = req.body;
      
      if (!projectPath) {
        return res.status(400).json({
          success: false,
          error: 'Project path is required'
        });
      }
      
      await checkpointManager.forceFullScan(projectPath);
      
      return res.json({
        success: true,
        message: 'Next checkpoint will perform full scan'
      });
    } catch (error) {
      console.error('Error forcing full scan:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to force full scan'
      });
    }
  });

  // Restore checkpoint
  router.post('/api/checkpoint/:id/restore', async (req, res) => {
    try {
      const checkpointId = req.params.id;
      const result = await checkpointManager.restoreCheckpoint(checkpointId);
      
      return res.json({
        success: true,
        message: `Restored ${result.filesRestored} files from checkpoint`,
        data: result
      });
    } catch (error) {
      console.error('Error restoring checkpoint:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to restore checkpoint'
      });
    }
  });

  // Diff between checkpoints
  router.post('/api/checkpoint/diff', async (req, res) => {
    try {
      const { currentId, previousId } = req.body;
      
      if (!currentId || !previousId) {
        return res.status(400).json({
          success: false,
          error: 'Both currentId and previousId are required in request body'
        });
      }
      
      const diff = await checkpointManager.diffCheckpoints(currentId, previousId);
      
      return res.json({
        success: true,
        data: diff
      });
    } catch (error) {
      console.error('Error generating diff:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate diff'
      });
    }
  });

  // Delete checkpoint
  router.delete('/api/checkpoint/:id', async (req, res) => {
    try {
      const checkpointId = req.params.id;
      await checkpointManager.deleteCheckpoint(checkpointId);
      
      return res.json({
        success: true,
        message: 'Checkpoint deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting checkpoint:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete checkpoint'
      });
    }
  });

  // Delete all checkpoints for a project
  router.delete('/api/project/checkpoints', async (req, res) => {
    try {
      const { projectPath } = req.body;
      
      if (!projectPath) {
        return res.status(400).json({
          success: false,
          error: 'Project path is required'
        });
      }
      
      const result = await checkpointManager.deleteProjectCheckpoints(projectPath);
      
      return res.json({
        success: true,
        message: `Deleted ${result.deletedCheckpoints} checkpoints for project`,
        data: result
      });
    } catch (error) {
      console.error('Error deleting project checkpoints:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete project checkpoints'
      });
    }
  });

  // Clear all checkpoints from all projects
  router.delete('/api/clear-all-checkpoints', async (req, res) => {
    try {
      const result = await checkpointManager.clearAllCheckpoints();
      
      return res.json({
        success: true,
        message: `Cleared ${result.deletedCheckpoints} checkpoints from ${result.projectCount} projects`,
        data: result
      });
    } catch (error) {
      console.error('Error clearing all checkpoints:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to clear all checkpoints'
      });
    }
  });

  return router;
}