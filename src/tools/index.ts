import { SmartPlugDevice, ControlPlugParams, GetPlugStateParams } from '../types';
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createLogger, metrics } from '../logger.js';
import { SDMService } from '../services/sdm';
import { SmartDeviceManagement } from 'googleapis';

const logger = createLogger('tools');

export const tools = [
  {
    name: "list_smart_plugs",
    description: "List all available smart plugs and their current states",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "control_smart_plug",
    description: "Turn a smart plug on or off",
    inputSchema: {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "The ID of the smart plug to control"
        },
        state: {
          type: "boolean",
          description: "True to turn on, false to turn off"
        }
      },
      required: ["deviceId", "state"]
    }
  },
  {
    name: "get_smart_plug_state",
    description: "Get the current state of a specific smart plug",
    inputSchema: {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "The ID of the smart plug to query"
        }
      },
      required: ["deviceId"]
    }
  }
];

export const handlers = {
  list_smart_plugs: async (sdm: SmartDeviceManagement.Smartdevicemanagement) => {
    const service = new SDMService(sdm);
    return {
      content: await service.listDevices()
    };
  },

  control_smart_plug: async (sdm: SmartDeviceManagement.Smartdevicemanagement, args: unknown) => {
    if (!args || typeof args !== 'object' || !('deviceId' in args) || !('state' in args)) {
      logger.warn("Invalid parameters for control_smart_plug", { args: args || {} });
      metrics.increment('invalid_control_params_errors');
      throw {
        code: ErrorCode.InvalidParams,
        message: "Missing required parameters: deviceId and state"
      };
    }

    const params: ControlPlugParams = {
      deviceId: String(args.deviceId),
      state: Boolean(args.state)
    };

    const service = new SDMService(sdm);
    await service.controlDevice(params.deviceId, params.state);

    return {
      content: {
        success: true,
        device: {
          id: params.deviceId,
          state: {
            on: params.state,
            online: true
          }
        }
      }
    };
  },

  get_smart_plug_state: async (sdm: SmartDeviceManagement.Smartdevicemanagement, args: unknown) => {
    if (!args || typeof args !== 'object' || !('deviceId' in args)) {
      logger.warn("Invalid parameters for get_smart_plug_state", { args: args || {} });
      metrics.increment('invalid_get_state_params_errors');
      throw {
        code: ErrorCode.InvalidParams,
        message: "Missing required parameter: deviceId"
      };
    }

    const params: GetPlugStateParams = {
      deviceId: String(args.deviceId)
    };

    const service = new SDMService(sdm);
    const device = await service.getDeviceState(params.deviceId);

    return {
      content: device
    };
  }
}; 