import { Application, StatusLog, addStatusLog } from './database';

export interface CheckResult {
  status: 'UP' | 'DOWN';
  statusCode: number;
  responseTime: number;
  timestamp: number;
}

export async function checkApplicationStatus(app: Application): Promise<CheckResult> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(app.url, {
      method: 'HEAD', // Use HEAD to minimize data transfer
      signal: controller.signal,
      mode: 'no-cors', // Allow cross-origin requests
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    // For no-cors mode, we can't access the status code directly
    // We'll consider any successful response as UP
    return {
      status: 'UP',
      statusCode: 200, // Default for successful no-cors requests
      responseTime,
      timestamp: Date.now(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'DOWN',
      statusCode: 0, // Network error
      responseTime,
      timestamp: Date.now(),
    };
  }
}

export async function performStatusCheck(app: Application): Promise<void> {
  try {
    const result = await checkApplicationStatus(app);
    
    if (app.id) {
      await addStatusLog({
        appId: app.id,
        timestamp: result.timestamp,
        status: result.status,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
      });
    }
  } catch (error) {
    console.error(`Failed to check status for ${app.name}:`, error);
    
    // Log the failure
    if (app.id) {
      await addStatusLog({
        appId: app.id,
        timestamp: Date.now(),
        status: 'DOWN',
        statusCode: 0,
        responseTime: 0,
      });
    }
  }
}

export async function performBatchStatusCheck(apps: Application[]): Promise<void> {
  const promises = apps.map(app => performStatusCheck(app));
  await Promise.allSettled(promises);
}

export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function getStatusIcon(status: 'UP' | 'DOWN' | 'CHECKING'): string {
  switch (status) {
    case 'UP':
      return '🟢';
    case 'DOWN':
      return '🔴';
    case 'CHECKING':
      return '🟡';
    default:
      return '⚫';
  }
}

export function getStatusColor(status: 'UP' | 'DOWN' | 'CHECKING'): string {
  switch (status) {
    case 'UP':
      return 'success';
    case 'DOWN':
      return 'destructive';
    case 'CHECKING':
      return 'warning';
    default:
      return 'muted';
  }
}