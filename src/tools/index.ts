import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createLogger, metrics } from '../logger.js';
import { HomeGraphService } from '../services/homegraph.js';
import { homegraph_v1 } from 'googleapis';

const logger = createLogger('tools');

interface ToolContent {
  type: string;
  text?: string;
  base64?: string;
  mimeType?: string;
}

interface ToolResponse {
  content: ToolContent[];
}

export type HandlerFunction = (
  homegraph: HomeGraphService,
  args: Record<string, unknown>
) => Promise<ToolResponse>;

export const tools = [
  {
    name: "list_smart_plugs",
    description: "List all available smart plugs and their current states",
    inputSchema: {
      type: "object",
      properties: {
        agentUserId: {
          type: "string",
          description: "The agent user ID to query devices for"
        }
      },
      required: ["agentUserId"]
    }
  },
  {
    name: "control_smart_plug",
    description: "Turn a smart plug on or off",
    inputSchema: {
      type: "object",
      properties: {
        agentUserId: {
          type: "string",
          description: "The agent user ID"
        },
        deviceId: {
          type: "string",
          description: "The ID of the smart plug to control"
        },
        state: {
          type: "boolean",
          description: "True to turn on, false to turn off"
        }
      },
      required: ["agentUserId", "deviceId", "state"]
    }
  },
  {
    name: "get_smart_plug_state",
    description: "Get the current state of a specific smart plug",
    inputSchema: {
      type: "object",
      properties: {
        agentUserId: {
          type: "string",
          description: "The agent user ID"
        },
        deviceId: {
          type: "string",
          description: "The ID of the smart plug to query"
        }
      },
      required: ["agentUserId", "deviceId"]
    }
  }
] as const;

// Add interface for device response
interface Device {
  id: string;
  type: string;
  traits: string[];
  name: string;
  willReportState: boolean;
  deviceInfo?: {
    manufacturer: string;
    model: string;
    hwVersion: string;
    swVersion: string;
  };
  customData?: Record<string, unknown>;
}

export const handlers: Record<string, HandlerFunction> = {
  list_smart_plugs: async (homegraph, args) => {
    const agentUserId = String(args.agentUserId);
    const response = await homegraph.queryDevices(agentUserId);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
        mimeType: 'application/json'
      }]
    };
  },

  control_smart_plug: async (homegraph, args) => {
    if (!args || typeof args !== 'object' || !('deviceId' in args) || !('state' in args) || !('agentUserId' in args)) {
      logger.warn("Invalid parameters for control_smart_plug", { args });
      metrics.increment('invalid_control_params_errors');
      throw {
        code: ErrorCode.InvalidParams,
        message: "Missing required parameters: agentUserId, deviceId and state"
      };
    }

    const agentUserId = String(args.agentUserId);
    const deviceId = String(args.deviceId);
    const state = Boolean(args.state);

    await homegraph.reportState(agentUserId, {
      [deviceId]: {
        online: true,
        status: 'SUCCESS',
        on: state
      }
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, deviceId, state }),
        mimeType: 'application/json'
      }]
    };
  },

  get_smart_plug_state: async (homegraph, args) => {
    if (!args || typeof args !== 'object' || !('deviceId' in args) || !('agentUserId' in args)) {
      logger.warn("Invalid parameters for get_smart_plug_state", { args });
      metrics.increment('invalid_get_state_params_errors');
      throw {
        code: ErrorCode.InvalidParams,
        message: "Missing required parameters: agentUserId and deviceId"
      };
    }

    const agentUserId = String(args.agentUserId);
    const deviceId = String(args.deviceId);
    
    const response = await homegraph.queryDevices(agentUserId);
    const queryResponse = response as homegraph_v1.Schema$QueryResponse;
    const devices = Array.isArray(queryResponse.payload?.devices) ? queryResponse.payload.devices : [];
    const device = devices.find((d: homegraph_v1.Schema$Device) => d.id === deviceId);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(device, null, 2),
        mimeType: 'application/json'
      }]
    };
  }
}; 