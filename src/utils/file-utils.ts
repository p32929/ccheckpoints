import { readFile, stat, access } from 'fs/promises';
import { resolve, relative, join, extname } from 'path';
import { createHash } from 'crypto';
import fastGlob from 'fast-glob';
import { constants } from 'fs';
import { Logger } from './logger.js';

const logger = Logger.getInstance();

export interface FileInfo {
  absolutePath: string;
  relativePath: string;
  content: string;
  hash: string;
  size: number;
  lastModified: Date;
  extension: string;
}

export class FileUtils {
  private static readonly DEFAULT_IGNORE_PATTERNS = [
    '.git/**',
    'node_modules/**',
    '.DS_Store',
    '*.log',
    'dist/**',
    'build/**',
    '.next/**',
    'coverage/**',
    '.nyc_output/**',
    '.cache/**',
    'tmp/**',
    'temp/**'
  ];

  private static async getIgnorePatterns(projectPath: string): Promise<string[]> {
    const patterns = [...this.DEFAULT_IGNORE_PATTERNS];
    
    // Find all .gitignore files in the project
    const gitignoreFiles = await this.findGitignoreFiles(projectPath);
    
    for (const gitignoreFile of gitignoreFiles) {
      try {
        const gitignoreContent = await readFile(gitignoreFile.path, 'utf-8');
        
        // Parse .gitignore file
        const gitignorePatterns = gitignoreContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')) // Remove empty lines and comments
          .map((pattern): string | string[] | null => {
            // Handle negation patterns (!) - not supported by fast-glob ignore, skip for now
            if (pattern.startsWith('!')) {
              return null; // Skip negation patterns
            }
            
            // Convert gitignore patterns to fast-glob ignore patterns
            let convertedPatterns: string | string[];
            
            if (pattern.endsWith('/')) {
              // Directory pattern: "dir/" -> "dir/**"
              convertedPatterns = pattern.slice(0, -1) + '/**';
            } else if (pattern.includes('/')) {
              // Path-specific pattern: keep as-is but ensure it works for subdirs
              convertedPatterns = pattern.startsWith('/') ? pattern.slice(1) : pattern;
            } else {
              // File/folder name pattern: "node_modules" -> "**/node_modules" and "**/node_modules/**"
              convertedPatterns = [`**/${pattern}`, `**/${pattern}/**`];
            }
            
            // If this .gitignore is in a subdirectory, prefix patterns with the relative path
            if (gitignoreFile.relativePath !== '') {
              if (Array.isArray(convertedPatterns)) {
                return convertedPatterns.map(p => `${gitignoreFile.relativePath}/${p}`);
              } else {
                return `${gitignoreFile.relativePath}/${convertedPatterns}`;
              }
            }
            
            return convertedPatterns;
          })
          .filter(Boolean)
          .flat() as string[];
        
        patterns.push(...gitignorePatterns);
        await logger.debug(`📋 Found .gitignore at ${gitignoreFile.relativePath || 'root'}: ${gitignorePatterns.length} patterns`);
        
      } catch (error) {
        await logger.warn(`Failed to read .gitignore at ${gitignoreFile.path}:`, error);
      }
    }
    
    if (gitignoreFiles.length === 0) {
      await logger.debug('📋 No .gitignore files found, using default patterns only');
    }
    
    return patterns;
  }
  
  private static async findGitignoreFiles(projectPath: string): Promise<{path: string, relativePath: string}[]> {
    try {
      const gitignoreFiles = await fastGlob('**/.gitignore', {
        cwd: projectPath,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: ['.git/**'] // Don't look in .git directory
      });
      
      return gitignoreFiles.map(file => ({
        path: resolve(projectPath, file),
        relativePath: file === '.gitignore' ? '' : file.replace('/.gitignore', '')
      }));
      
    } catch (error) {
      await logger.warn('Failed to find .gitignore files:', error);
      return [];
    }
  }

  static async getProjectFiles(projectPath: string, forceFullScan = false): Promise<FileInfo[]> {
    await logger.info('🔍 Scanning project files...');
    const startTime = Date.now();
    
    if (!forceFullScan) {
      // Try incremental scan first
      const incrementalFiles = await this.getIncrementalFiles(projectPath);
      if (incrementalFiles.length > 0) {
        await logger.info(`⚡ Fast scan: ${incrementalFiles.length} changed files (${Date.now() - startTime}ms)`);
        return incrementalFiles;
      }
    }

    // Fall back to full scan
    await logger.info('📋 Full project scan...');
    const ignorePatterns = await this.getIgnorePatterns(projectPath);
    
    await logger.debug(`📋 Debug: Final ignore patterns: ${ignorePatterns.join(', ')}`);
    
    const files = await fastGlob('**/*', {
      cwd: projectPath,
      ignore: ignorePatterns,
      dot: false,
      onlyFiles: true,
      stats: true,
      followSymbolicLinks: false
    });

    const fileInfos: FileInfo[] = [];
    const batchSize = 50; // Process files in batches to avoid memory issues
    
    // Safety check: limit total files processed
    if (files.length > 10000) {
      await logger.warn(`⚠️  Warning: ${files.length} files found. This seems excessive - check your .gitignore!`);
      await logger.warn('Processing first 10,000 files only to prevent crashes.');
      files.splice(10000);
    }

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(file => this.processFile(projectPath, file))
      );
      
      fileInfos.push(...batchResults.filter(Boolean) as FileInfo[]);
      
      // Show progress for large projects
      if (files.length > 100 && i % 100 === 0) {
        await logger.debug(`   Processed ${i + batch.length}/${files.length} files...`);
      }
    }

    // Update project index
    await this.updateProjectIndex(projectPath, fileInfos);
    
    await logger.info(`✅ Scanned ${fileInfos.length} files (${Date.now() - startTime}ms)`);
    return fileInfos;
  }

  private static async getIncrementalFiles(projectPath: string): Promise<FileInfo[]> {
    // Simplified for SQLite version - always return empty to force full scan
    return [];
  }

  private static async findNewFiles(projectPath: string, existingPaths: string[]): Promise<FileInfo[]> {
    const existingSet = new Set(existingPaths);
    const ignorePatterns = await this.getIgnorePatterns(projectPath);
    const files = await fastGlob('**/*', {
      cwd: projectPath,
      ignore: ignorePatterns,
      dot: false,
      onlyFiles: true,
      stats: true,
      followSymbolicLinks: false
    });
    
    const newFiles: FileInfo[] = [];
    
    for (const file of files) {
      const filePath = resolve(projectPath, file.path);
      if (!existingSet.has(filePath)) {
        const fileInfo = await this.processFile(projectPath, file);
        if (fileInfo) {
          newFiles.push(fileInfo);
        }
      }
    }
    
    return newFiles;
  }

  private static async processFile(projectPath: string, file: any): Promise<FileInfo | null> {
    try {
      const filePath = resolve(projectPath, file.path);
      await access(filePath, constants.R_OK);
      
      const stats = await stat(filePath);
      return await this.createFileInfo(projectPath, filePath, stats);
      
    } catch (error) {
      await logger.warn(`Skipping file ${file.path}:`, error);
      return null;
    }
  }

  private static async createFileInfo(projectPath: string, filePath: string, stats: any): Promise<FileInfo | null> {
    try {
      const relativePath = relative(projectPath, filePath);
      
      // Skip files that are too large (> 10MB)
      if (stats.size > 10 * 1024 * 1024) {
        await logger.warn(`Skipping large file (${this.formatFileSize(stats.size)}): ${relativePath}`);
        return null;
      }
      
      const content = await readFile(filePath, 'utf-8');
      const hash = this.generateHash(content);

      return {
        absolutePath: filePath,
        relativePath,
        content,
        hash,
        size: stats.size,
        lastModified: stats.mtime,
        extension: extname(filePath)
      };
    } catch (error) {
      // Skip binary files and other unreadable files silently
      if (error instanceof Error && error.message.includes('invalid')) {
        return null;
      }
      await logger.warn(`Failed to read ${filePath}:`, error);
      return null;
    }
  }

  private static async updateProjectIndex(projectPath: string, files: FileInfo[]): Promise<void> {
    // Simplified for SQLite version - no indexing needed
    await logger.debug(`Index update skipped for ${files.length} files (SQLite version)`);
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  static async readFileContent(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  static generateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  static formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }
}