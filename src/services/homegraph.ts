import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createLogger, metrics } from '../logger.js';

// Add interface for device states
interface DeviceState {
  online: boolean;
  status: string;
  [key: string]: any; // For additional device-specific states
}

export class HomeGraphService {
  private logger = createLogger('homegraph-service');
  private homegraph: ReturnType<typeof google.homegraph> | null = null;

  constructor(private auth: OAuth2Client) {
    this.initialize();
  }

  private initialize() {
    try {
      this.logger.debug('Initializing HomeGraph service...');
      this.homegraph = google.homegraph({
        version: 'v1',
        auth: this.auth
      });
      this.logger.info('HomeGraph service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize HomeGraph service', { error });
      metrics.increment('homegraph_init_failures');
      throw error;
    }
  }

  async queryDevices(agentUserId: string) {
    return this.logger.measureOperation('query_devices', async () => {
      try {
        const response = await this.homegraph?.devices.query({
          requestBody: {
            agentUserId,
            inputs: [{
              payload: {
                devices: [{
                  id: 'all'
                }]
              }
            }]
          }
        });
        metrics.increment('query_devices_success');
        return response?.data;
      } catch (error) {
        this.logger.error('Failed to query devices', { error });
        metrics.increment('query_devices_failures');
        throw error;
      }
    });
  }

  async reportState(agentUserId: string, deviceStates: Record<string, DeviceState>) {
    return this.logger.measureOperation('report_state', async () => {
      try {
        const response = await this.homegraph?.devices.reportStateAndNotification({
          requestBody: {
            agentUserId,
            requestId: Date.now().toString(),
            payload: {
              devices: {
                states: deviceStates
              }
            }
          }
        });
        metrics.increment('report_state_success');
        return response?.data;
      } catch (error) {
        this.logger.error('Failed to report state', { error });
        metrics.increment('report_state_failures');
        throw error;
      }
    });
  }

  async requestSync(agentUserId: string) {
    return this.logger.measureOperation('request_sync', async () => {
      try {
        const response = await this.homegraph?.devices.requestSync({
          requestBody: {
            agentUserId
          }
        });
        metrics.increment('request_sync_success');
        return response?.data;
      } catch (error) {
        this.logger.error('Failed to request sync', { error });
        metrics.increment('request_sync_failures');
        throw error;
      }
    });
  }
}
