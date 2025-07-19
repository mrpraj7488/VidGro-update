import { Platform } from 'react-native';

// Debug configuration
export const DEBUG_CONFIG = {
  ENABLE_LOGGING: __DEV__,
  ENABLE_PERFORMANCE_MONITORING: __DEV__,
  ENABLE_NETWORK_LOGGING: __DEV__,
  ENABLE_STATE_LOGGING: __DEV__,
  LOG_LEVEL: __DEV__ ? 'debug' : 'error',
};

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Logger class for structured logging
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    this.logLevel = __DEV__ ? LogLevel.DEBUG : LogLevel.ERROR;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel && DEBUG_CONFIG.ENABLE_LOGGING;
  }

  private formatMessage(level: string, category: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const platform = Platform.OS;
    let formatted = `[${timestamp}] [${platform}] [${level}] [${category}] ${message}`;
    
    if (data) {
      formatted += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    return formatted;
  }

  public debug(category: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', category, message, data));
    }
  }

  public info(category: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', category, message, data));
    }
  }

  public warn(category: string, message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', category, message, data));
    }
  }

  public error(category: string, message: string, error?: Error | any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error;
      
      console.error(this.formatMessage('ERROR', category, message, errorData));
    }
  }
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();

  public static startTimer(name: string): void {
    if (DEBUG_CONFIG.ENABLE_PERFORMANCE_MONITORING) {
      this.timers.set(name, Date.now());
      Logger.getInstance().debug('PERFORMANCE', `Started timer: ${name}`);
    }
  }

  public static endTimer(name: string): number {
    if (!DEBUG_CONFIG.ENABLE_PERFORMANCE_MONITORING) {
      return 0;
    }

    const startTime = this.timers.get(name);
    if (!startTime) {
      Logger.getInstance().warn('PERFORMANCE', `Timer not found: ${name}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(name);
    
    Logger.getInstance().debug('PERFORMANCE', `Timer ${name} completed`, { duration });
    return duration;
  }

  public static measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!DEBUG_CONFIG.ENABLE_PERFORMANCE_MONITORING) {
      return fn();
    }

    this.startTimer(name);
    return fn().finally(() => {
      this.endTimer(name);
    });
  }

  public static measure<T>(name: string, fn: () => T): T {
    if (!DEBUG_CONFIG.ENABLE_PERFORMANCE_MONITORING) {
      return fn();
    }

    this.startTimer(name);
    try {
      return fn();
    } finally {
      this.endTimer(name);
    }
  }
}

// Network request logging
export class NetworkLogger {
  public static logRequest(url: string, method: string, headers?: any, body?: any): void {
    if (!DEBUG_CONFIG.ENABLE_NETWORK_LOGGING) {
      return;
    }

    Logger.getInstance().debug('NETWORK', `${method} ${url}`, {
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public static logResponse(url: string, status: number, data?: any, duration?: number): void {
    if (!DEBUG_CONFIG.ENABLE_NETWORK_LOGGING) {
      return;
    }

    Logger.getInstance().debug('NETWORK', `Response ${status} ${url}`, {
      status,
      data: data ? JSON.stringify(data) : undefined,
      duration,
    });
  }

  public static logError(url: string, error: Error): void {
    if (!DEBUG_CONFIG.ENABLE_NETWORK_LOGGING) {
      return;
    }

    Logger.getInstance().error('NETWORK', `Request failed ${url}`, error);
  }
}

// State change logging
export class StateLogger {
  public static logStateChange(component: string, oldState: any, newState: any): void {
    if (!DEBUG_CONFIG.ENABLE_STATE_LOGGING) {
      return;
    }

    Logger.getInstance().debug('STATE', `State change in ${component}`, {
      oldState,
      newState,
      changes: this.getStateChanges(oldState, newState),
    });
  }

  private static getStateChanges(oldState: any, newState: any): any {
    const changes: any = {};
    
    for (const key in newState) {
      if (oldState[key] !== newState[key]) {
        changes[key] = {
          from: oldState[key],
          to: newState[key],
        };
      }
    }
    
    return changes;
  }
}

// Error boundary logging
export class ErrorLogger {
  public static logComponentError(componentName: string, error: Error, errorInfo: any): void {
    Logger.getInstance().error('COMPONENT', `Error in ${componentName}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo,
    });
  }

  public static logUnhandledError(error: Error): void {
    Logger.getInstance().error('UNHANDLED', 'Unhandled error occurred', error);
  }

  public static logPromiseRejection(reason: any): void {
    Logger.getInstance().error('PROMISE', 'Unhandled promise rejection', reason);
  }
}

// Development utilities
export class DevUtils {
  public static logAppInfo(): void {
    if (!__DEV__) return;

    const info = {
      platform: Platform.OS,
      version: Platform.Version,
      isDev: __DEV__,
      debugConfig: DEBUG_CONFIG,
    };

    Logger.getInstance().info('APP', 'Application info', info);
  }

  public static logEnvironmentVariables(): void {
    if (!__DEV__) return;

    const envVars = {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ? '***SET***' : 'NOT_SET',
      supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? '***SET***' : 'NOT_SET',
      admobAppId: process.env.EXPO_PUBLIC_ADMOB_APP_ID ? '***SET***' : 'NOT_SET',
      youtubeApiKey: process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ? '***SET***' : 'NOT_SET',
    };

    Logger.getInstance().info('ENV', 'Environment variables status', envVars);
  }

  public static createTestData(): any {
    if (!__DEV__) return null;

    return {
      testUser: {
        id: 'test-user-id',
        email: 'test@example.com',
        username: 'testuser',
        coins: 1000,
        is_vip: false,
      },
      testVideos: [
        {
          id: 'test-video-1',
          youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Test Video 1',
          duration_seconds: 120,
          coin_reward: 25,
        },
        {
          id: 'test-video-2',
          youtube_url: 'https://www.youtube.com/watch?v=oHg5SJYRHA0',
          title: 'Test Video 2',
          duration_seconds: 180,
          coin_reward: 35,
        },
      ],
    };
  }
}

// Global error handlers setup
export const setupGlobalErrorHandlers = (): void => {
  if (!__DEV__) return;

  // Handle unhandled errors
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    ErrorLogger.logUnhandledError(error);
    originalHandler(error, isFatal);
  });

  // Handle unhandled promise rejections
  const originalRejectionHandler = require('react-native/Libraries/Core/ExceptionsManager').unstable_setGlobalHandler;
  if (originalRejectionHandler) {
    originalRejectionHandler((error: any) => {
      ErrorLogger.logPromiseRejection(error);
    });
  }
};

// Export singleton instances
export const logger = Logger.getInstance();
export const performanceMonitor = PerformanceMonitor;
export const networkLogger = NetworkLogger;
export const stateLogger = StateLogger;
export const errorLogger = ErrorLogger;
export const devUtils = DevUtils;

// Initialize debug utilities
if (__DEV__) {
  setupGlobalErrorHandlers();
  devUtils.logAppInfo();
  devUtils.logEnvironmentVariables();
}

export default {
  Logger,
  PerformanceMonitor,
  NetworkLogger,
  StateLogger,
  ErrorLogger,
  DevUtils,
  logger,
  performanceMonitor,
  networkLogger,
  stateLogger,
  errorLogger,
  devUtils,
};