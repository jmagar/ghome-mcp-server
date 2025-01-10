import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  CallToolRequest
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
const smartdevicemanagement = google.smartdevicemanagement('v1');
import { OAuth2Client } from "google-auth-library";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger, metrics, health } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SmartPlugDevice {
  id: string;
  name: string;
  type: string;
  traits: {
    [key: string]: any;
  };
  state: {
    on: boolean;
    online: boolean;
  };
}

interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

interface DeviceState {
  id: string;
  name?: {
    name: string;
  };
  type: string;
  states?: {
    on?: boolean;
    online?: boolean;
  };
}

interface ControlPlugParams {
  deviceId: string;
  state: boolean;
}

interface GetPlugStateParams {
  deviceId: string;
}

class GoogleHomeServer extends Server {
  private sdm: ReturnType<typeof google.smartdevicemanagement> | null = null;
  private auth: OAuth2Client | null = null;
  private logger = createLogger('ghome-server');
  private config: Config;

  constructor() {
    super(
      {
        name: "ghome-server",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    try {
      const configPath = join(__dirname, "../config.json");
      this.config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (error) {
      this.logger.error("Failed to load config.json", { error: error instanceof Error ? error.message : String(error) });
      throw new Error("Failed to load config.json");
    }
  }

  async initialize() {
    return this.logger.measureOperation('server_initialize', async () => {
      await this.setupAuth();
      this.setupTools();
      
      // Register additional health checks
      health.registerCheck('auth', async () => this.auth !== null);
      health.registerCheck('sdm', async () => this.sdm !== null);
    });
  }

  private async setupAuth() {
    return this.logger.measureOperation('setup_auth', async () => {
      try {
        if (!this.config.refreshToken) {
          throw new Error('Refresh token not found in config.json. Please run get-refresh-token.ts first.');
        }

        this.auth = new OAuth2Client({
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
        });

        this.auth.setCredentials({
          refresh_token: this.config.refreshToken
        });

        this.sdm = google.smartdevicemanagement({
          version: 'v1',
          auth: this.auth
        });

        this.logger.info("Authentication setup completed successfully");
      } catch (error) {
        this.logger.error("Failed to setup authentication", { error: error instanceof Error ? error.message : String(error) });
        metrics.increment('auth_setup_failures');
        throw {
          code: ErrorCode.InternalError,
          message: "Authentication setup failed",
          data: error
        };
      }
    });
  }

  private async getSmartPlugs(): Promise<SmartPlugDevice[]> {
    return this.logger.measureOperation('get_smart_plugs', async () => {
      if (!this.sdm) {
        this.logger.error("Smart Device Management API not initialized");
        metrics.increment('sdm_not_initialized_errors');
        throw {
          code: ErrorCode.InternalError,
          message: "Smart Device Management API not initialized"
        };
      }

      try {
        const response = await this.sdm.enterprises.devices.list({
          parent: 'enterprises/me'
        });

        const devices = response.data.devices || [];
        const smartPlugs = devices
          .filter(device => device.type === 'sdm.devices.types.OUTLET' && device.name)
          .map(device => ({
            id: device.name!,
            name: device.traits?.['sdm.devices.traits.Info']?.customName || device.name!,
            type: device.type || 'sdm.devices.types.OUTLET',
            traits: device.traits || {},
            state: {
              on: Boolean(device.traits?.['sdm.devices.traits.OnOff']?.on),
              online: device.traits?.['sdm.devices.traits.Connectivity']?.status === 'ONLINE'
            }
          }));

        metrics.gauge('smart_plugs_count', smartPlugs.length);
        this.logger.info(`Found ${smartPlugs.length} smart plugs`);
        return smartPlugs;
      } catch (error) {
        this.logger.error("Failed to get devices", { error: error instanceof Error ? error.message : String(error) });
        metrics.increment('get_devices_errors');
        throw {
          code: ErrorCode.InternalError,
          message: "Failed to get devices",
          data: error
        };
      }
    });
  }

  protected setupTools() {
    // List available tools
    this.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug("Handling list_tools request");
      metrics.increment('list_tools_requests');
      
      return {
        tools: [
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
        ]
      };
    });

    // Handle tool execution
    this.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      return this.logger.measureOperation(`execute_tool_${request.params.name}`, async () => {
        const { name, arguments: args } = request.params;
        this.logger.info(`Executing tool: ${name}`, { args: args || {} });
        metrics.increment(`tool_execution_${name}`);

        switch (name) {
          case "list_smart_plugs":
            return {
              content: await this.getSmartPlugs()
            };

          case "control_smart_plug": {
            if (!args || typeof args !== 'object' || !('deviceId' in args) || !('state' in args)) {
              this.logger.warn("Invalid parameters for control_smart_plug", { args: args || {} });
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

            if (!this.sdm) {
              this.logger.error("Smart Device Management API not initialized");
              metrics.increment('sdm_not_initialized_errors');
              throw {
                code: ErrorCode.InternalError,
                message: "Smart Device Management API not initialized"
              };
            }

            try {
              await this.sdm.enterprises.devices.executeCommand({
                name: params.deviceId,
                requestBody: {
                  command: 'sdm.devices.commands.OnOff.Set',
                  params: {
                    on: params.state
                  }
                }
              });

              this.logger.info(`Successfully controlled device ${params.deviceId}`, { state: params.state });
              metrics.increment(`device_control_success`);

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
            } catch (error) {
              this.logger.error(`Failed to control device ${params.deviceId}`, { 
                error: error instanceof Error ? error.message : String(error),
                state: params.state 
              });
              metrics.increment('device_control_errors');
              throw {
                code: ErrorCode.InternalError,
                message: `Failed to control device ${params.deviceId}`,
                data: error
              };
            }
          }

          case "get_smart_plug_state": {
            if (!args || typeof args !== 'object' || !('deviceId' in args)) {
              this.logger.warn("Invalid parameters for get_smart_plug_state", { args: args || {} });
              metrics.increment('invalid_get_state_params_errors');
              throw {
                code: ErrorCode.InvalidParams,
                message: "Missing required parameter: deviceId"
              };
            }

            const params: GetPlugStateParams = {
              deviceId: String(args.deviceId)
            };

            if (!this.sdm) {
              this.logger.error("Smart Device Management API not initialized");
              metrics.increment('sdm_not_initialized_errors');
              throw {
                code: ErrorCode.InternalError,
                message: "Smart Device Management API not initialized"
              };
            }

            try {
              const response = await this.sdm.enterprises.devices.get({
                name: params.deviceId
              });

              const device = response.data;
              if (!device) {
                this.logger.warn(`Device not found: ${params.deviceId}`);
                metrics.increment('device_not_found_errors');
                throw {
                  code: ErrorCode.InvalidParams,
                  message: `Device not found: ${params.deviceId}`
                };
              }

              this.logger.info(`Successfully retrieved state for device ${params.deviceId}`);
              metrics.increment('get_device_state_success');

              return {
                content: {
                  id: device.name,
                  name: device.traits?.['sdm.devices.traits.Info']?.customName || device.name,
                  type: device.type,
                  state: {
                    on: device.traits?.['sdm.devices.traits.OnOff']?.on || false,
                    online: device.traits?.['sdm.devices.traits.Connectivity']?.status === 'ONLINE'
                  }
                }
              };
            } catch (error) {
              this.logger.error(`Failed to get device state: ${params.deviceId}`, { 
                error: error instanceof Error ? error.message : String(error) 
              });
              metrics.increment('get_device_state_errors');
              throw {
                code: ErrorCode.InternalError,
                message: `Failed to get device state: ${params.deviceId}`,
                data: error
              };
            }
          }

          default:
            this.logger.warn(`Unknown tool: ${name}`);
            metrics.increment('unknown_tool_errors');
            throw {
              code: ErrorCode.MethodNotFound,
              message: `Unknown tool: ${name}`
            };
        }
      });
    });
  }

  async cleanup(): Promise<void> {
    return this.logger.measureOperation('server_cleanup', async () => {
      this.logger.info('Cleaning up server...');
      this.sdm = null;
      this.auth = null;
      this.logger.info('Server cleanup completed');
    });
  }
}

async function main() {
  const logger = createLogger('main');
  let server: GoogleHomeServer | null = null;

  try {
    // Set up global unhandled rejection handler
    process.on('unhandledRejection', (error) => {
      logger.error('Unhandled promise rejection', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      metrics.increment('unhandled_rejections');
      process.exit(1);
    });

    // Set up SIGINT handler
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      metrics.increment('sigint_received');
      
      if (server) {
        try {
          await server.cleanup();
          logger.info('Server cleanup completed');
        } catch (error) {
          logger.error('Error during server cleanup', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          metrics.increment('cleanup_errors');
        }
      }
      process.exit(0);
    });

    // Initialize and start server
    server = new GoogleHomeServer();
    await server.initialize();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info("Google Home MCP server started successfully");
    metrics.increment('server_starts');

    // Start periodic health checks
    setInterval(async () => {
      const healthStatus = await health.performChecks();
      logger.debug('Health check results', { health: healthStatus });
      
      Object.entries(healthStatus).forEach(([check, status]) => {
        metrics.gauge(`health_${check}`, status ? 1 : 0);
      });
    }, 60000); // Every minute

  } catch (error) {
    logger.error("Failed to start server", { 
      error: error instanceof Error ? error.message : String(error) 
    });
    metrics.increment('server_start_failures');
    
    if (server) {
      try {
        await server.cleanup();
      } catch (cleanupError) {
        logger.error("Error during cleanup", { 
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) 
        });
        metrics.increment('cleanup_errors');
      }
    }
    process.exit(1);
  }
}

// Handle any errors that occur during main execution
main().catch((error) => {
  const logger = createLogger('main');
  logger.error("Fatal error during server execution", { 
    error: error instanceof Error ? error.message : String(error) 
  });
  metrics.increment('fatal_errors');
  process.exit(1);
});
