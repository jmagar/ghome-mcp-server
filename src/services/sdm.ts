import { SmartDeviceManagement } from 'googleapis';
import { SmartPlugDevice } from '../types';
import { createLogger, metrics } from '../logger.js';
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";

const logger = createLogger('sdm-service');

export class SDMService {
  constructor(private sdm: SmartDeviceManagement.Smartdevicemanagement) {}

  async listDevices(): Promise<SmartPlugDevice[]> {
    if (!this.sdm) {
      logger.error("Smart Device Management API not initialized");
      metrics.increment('sdm_not_initialized_errors');
      throw {
        code: ErrorCode.InternalError,
        message: "Smart Device Management API not initialized"
      };
    }

    try {
      logger.info("Attempting to list devices with SDM API");
      
      const requestParams = {
        parent: 'enterprises/-'
      };
      
      const response = await this.sdm.enterprises.devices.list(requestParams);

      const devices = response.data.devices || [];
      const smartPlugs = devices
        .filter(device => device.type === 'sdm.devices.types.OUTLET')
        .map(device => ({
          id: device.name,
          name: device.traits?.['sdm.devices.traits.Info']?.customName || device.name,
          type: device.type,
          traits: device.traits || {},
          state: {
            on: Boolean(device.traits?.['sdm.devices.traits.OnOff']?.on),
            online: device.traits?.['sdm.devices.traits.Connectivity']?.status === 'ONLINE'
          }
        }));

      metrics.gauge('smart_plugs_count', smartPlugs.length);
      logger.info(`Found ${smartPlugs.length} smart plugs`);
      return smartPlugs;
    } catch (error) {
      logger.error("Failed to get devices", { 
        error: error instanceof Error ? error.message : String(error)
      });
      metrics.increment('get_devices_errors');
      throw {
        code: ErrorCode.InternalError,
        message: "Failed to get devices",
        data: error
      };
    }
  }

  async controlDevice(deviceId: string, state: boolean): Promise<void> {
    if (!this.sdm) {
      logger.error("Smart Device Management API not initialized");
      metrics.increment('sdm_not_initialized_errors');
      throw {
        code: ErrorCode.InternalError,
        message: "Smart Device Management API not initialized"
      };
    }

    try {
      await this.sdm.enterprises.devices.executeCommand({
        name: deviceId,
        requestBody: {
          command: 'sdm.devices.commands.OnOff.Set',
          params: {
            on: state
          }
        }
      });

      logger.info(`Successfully controlled device ${deviceId}`, { state });
      metrics.increment(`device_control_success`);
    } catch (error) {
      logger.error(`Failed to control device ${deviceId}`, { 
        error: error instanceof Error ? error.message : String(error),
        state 
      });
      metrics.increment('device_control_errors');
      throw {
        code: ErrorCode.InternalError,
        message: `Failed to control device ${deviceId}`,
        data: error
      };
    }
  }

  async getDeviceState(deviceId: string): Promise<SmartPlugDevice> {
    if (!this.sdm) {
      logger.error("Smart Device Management API not initialized");
      metrics.increment('sdm_not_initialized_errors');
      throw {
        code: ErrorCode.InternalError,
        message: "Smart Device Management API not initialized"
      };
    }

    try {
      const response = await this.sdm.enterprises.devices.get({
        name: deviceId
      });

      const device = response.data;
      if (!device) {
        logger.warn(`Device not found: ${deviceId}`);
        metrics.increment('device_not_found_errors');
        throw {
          code: ErrorCode.InvalidParams,
          message: `Device not found: ${deviceId}`
        };
      }

      logger.info(`Successfully retrieved state for device ${deviceId}`);
      metrics.increment('get_device_state_success');

      return {
        id: device.name,
        name: device.traits?.['sdm.devices.traits.Info']?.customName || device.name,
        type: device.type,
        traits: device.traits || {},
        state: {
          on: Boolean(device.traits?.['sdm.devices.traits.OnOff']?.on),
          online: device.traits?.['sdm.devices.traits.Connectivity']?.status === 'ONLINE'
        }
      };
    } catch (error) {
      logger.error(`Failed to get device state: ${deviceId}`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      metrics.increment('get_device_state_errors');
      throw {
        code: ErrorCode.InternalError,
        message: `Failed to get device state: ${deviceId}`,
        data: error
      };
    }
  }
} 