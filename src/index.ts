#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger, metrics, health } from "./logger.js";
import { Config } from './types/index.js';
import { tools, handlers } from './tools/index.js';
import { HomeGraphService } from './services/homegraph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class GoogleHomeServer extends Server {
  private auth: OAuth2Client | null = null;
  private logger = createLogger('ghome-server');
  private config: Config;
  private homegraph: HomeGraphService | null = null;

  constructor() {
    super(
      {
        name: "ghome-server",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {
            execution: true
          }
        }
      }
    );

    this.logger.info("Server instance created");

    try {
      const configPath = join(__dirname, "../config.json");
      this.config = JSON.parse(readFileSync(configPath, "utf-8"));
      this.logger.debug("Config loaded successfully", { 
        hasClientId: Boolean(this.config.clientId),
        hasClientSecret: Boolean(this.config.clientSecret),
        hasRefreshToken: Boolean(this.config.refreshToken)
      });
    } catch (error) {
      this.logger.error("Failed to load config.json", { error });
      throw new Error("Failed to load config.json");
    }
  }

  async connect(transport: StdioServerTransport): Promise<void> {
    this.logger.info("Connecting to transport...");
    transport.onmessage = (message) => {
      this.logger.debug("Received message", { 
        type: 'method' in message ? 'request/notification' : 'response',
        hasId: 'id' in message,
        hasParams: 'params' in message
      });
    };
    transport.onerror = (error) => {
      this.logger.error("Transport error", { error });
    };
    transport.onclose = () => {
      this.logger.info("Transport connection closed");
    };
    await super.connect(transport);
    this.logger.info("Connected to transport successfully");
  }

  async initialize() {
    try {
      return await this.logger.measureOperation('server_initialize', async () => {
        this.logger.info("Starting server initialization...");
        await this.setupAuth();
        this.homegraph = new HomeGraphService(this.auth!);
        this.setupTools();
        
        health.registerCheck('auth', async () => this.auth !== null);
        health.registerCheck('homegraph', async () => this.homegraph !== null);
        this.logger.info("Server initialization completed");
      });
    } catch (error) {
      this.logger.error("Failed to initialize server", { error });
      throw error;
    }
  }

  protected setupTools() {
    this.logger.info("Setting up tools...");
    this.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug("Handling list_tools request");
      metrics.increment('list_tools_requests');
      const response = { tools };
      this.logger.debug("Returning tools list", { toolCount: tools.length });
      return response;
    });

    this.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.logger.measureOperation(`execute_tool_${request.params.name}`, async () => {
        const { name, arguments: toolArgs } = request.params;
        this.logger.info(`Executing tool: ${name}`, { 
          args: toolArgs,
          hasArgs: Boolean(toolArgs)
        });
        metrics.increment(`tool_execution_${name}`);

        const handler = handlers[name as keyof typeof handlers];
        if (!handler) {
          this.logger.warn(`Unknown tool: ${name}`);
          metrics.increment('unknown_tool_errors');
          throw {
            code: ErrorCode.MethodNotFound,
            message: `Unknown tool: ${name}`
          };
        }

        this.logger.debug(`Starting execution of ${name}`);
        const response = await handler(this.homegraph!, toolArgs || {});
        this.logger.debug(`Completed execution of ${name}`, {
          contentLength: response.content.length
        });
        return {
          content: response.content
        };
      });
    });
    this.logger.info("Tools setup completed");
  }

  async cleanup(): Promise<void> {
    return this.logger.measureOperation('server_cleanup', async () => {
      this.logger.info('Cleaning up server...');
      this.homegraph = null;
      this.auth = null;
      this.logger.info('Server cleanup completed');
    });
  }

  private async setupAuth() {
    return this.logger.measureOperation('setup_auth', async () => {
      try {
        this.logger.debug('Starting auth setup', { 
          hasRefreshToken: Boolean(this.config.refreshToken),
          hasClientId: Boolean(this.config.clientId),
          hasClientSecret: Boolean(this.config.clientSecret)
        });

        if (!this.config.refreshToken) {
          const error = new Error('Refresh token not found in config.json. Please run get-refresh-token.ts first.');
          this.logger.error(error.message);
          metrics.increment('auth_setup_failures');
          throw error;
        }

        if (!this.config.clientId || !this.config.clientSecret) {
          const error = new Error('Missing clientId or clientSecret in config.json');
          this.logger.error(error.message);
          metrics.increment('auth_setup_failures');
          throw error;
        }

        try {
          this.logger.debug('Creating OAuth2Client...');
          this.auth = new OAuth2Client({
            clientId: this.config.clientId,
            clientSecret: this.config.clientSecret
          });

          this.logger.debug('Setting credentials...');
          this.auth.setCredentials({
            refresh_token: this.config.refreshToken
          });

          this.logger.debug('Verifying access token...');
          const token = await this.auth.getAccessToken();
          const credentials = this.auth.credentials;
          this.logger.debug('Access token verified', { 
            hasToken: Boolean(token),
            tokenType: credentials.token_type,
            expiryDate: credentials.expiry_date
          });

          this.logger.info("Authentication setup completed successfully", {
            hasAuth: Boolean(this.auth)
          });
        } catch (authError) {
          this.logger.error("OAuth2 setup failed", { error: authError });
          metrics.increment('oauth_setup_failures');
          throw {
            code: ErrorCode.InternalError,
            message: "OAuth2 setup failed",
            data: authError
          };
        }
      } catch (error) {
        this.logger.error("Failed to setup authentication", { error });
        metrics.increment('auth_setup_failures');
        throw error;
      }
    });
  }
}

async function main() {
  const logger = createLogger('main');
  let server: GoogleHomeServer | null = null;

  try {
    logger.debug('Starting main function...');

    // Set up global unhandled rejection handler first
    logger.debug('Setting up unhandled rejection handler...');
    process.on('unhandledRejection', (error: any) => {
      logger.error('Unhandled promise rejection', { 
        error: error instanceof Error ? error.message : 
              typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        code: error?.code,
        response: error?.response?.data,
        type: typeof error,
        fullError: JSON.stringify(error, null, 2)
      });
      metrics.increment('unhandled_rejections');
      process.exit(1);
    });

    // Set up SIGINT handler
    logger.debug('Setting up SIGINT handler...');
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      metrics.increment('sigint_received');
      
      if (server) {
        try {
          await server.cleanup();
          logger.info('Server cleanup completed');
        } catch (cleanupError: any) {
          logger.error('Error during server cleanup', { 
            error: cleanupError instanceof Error ? cleanupError.message : 
                  typeof cleanupError === 'object' && cleanupError !== null ? JSON.stringify(cleanupError) : String(cleanupError),
            stack: cleanupError instanceof Error ? cleanupError.stack : undefined
          });
          metrics.increment('cleanup_errors');
        }
      }
      process.exit(0);
    });

    // Initialize and start server
    logger.debug('Creating server instance...');
    server = new GoogleHomeServer();

    logger.debug('Initializing server...');
    await server.initialize();
    
    logger.debug('Creating transport...');
    const transport = new StdioServerTransport();
    
    logger.debug('Connecting transport...');
    await server.connect(transport);
    
    logger.info("Google Home MCP server started successfully");
    metrics.increment('server_starts');

    // Start periodic health checks
    logger.debug('Starting health check interval...');
    setInterval(async () => {
      try {
        const healthStatus = await health.performChecks();
        logger.debug('Health check results', { health: healthStatus });
        
        Object.entries(healthStatus).forEach(([check, status]) => {
          metrics.gauge(`health_${check}`, status ? 1 : 0);
        });
      } catch (error: any) {
        logger.error('Health check failed', {
          error: error instanceof Error ? error.message : 
                typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }, 60000);

  } catch (error: any) {
    logger.error("Failed to start server", { 
      error: error instanceof Error ? error.message : 
            typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      code: error?.code,
      response: error?.response?.data,
      fullError: JSON.stringify(error, null, 2)
    });
    metrics.increment('server_start_failures');
    
    if (server) {
      try {
        await server.cleanup();
      } catch (cleanupError: any) {
        logger.error("Error during cleanup", { 
          error: cleanupError instanceof Error ? cleanupError.message : 
                typeof cleanupError === 'object' && cleanupError !== null ? JSON.stringify(cleanupError) : String(cleanupError),
          stack: cleanupError instanceof Error ? cleanupError.stack : undefined
        });
        metrics.increment('cleanup_errors');
      }
    }
    process.exit(1);
  }
}

// Start the server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const logger = createLogger('main');
    logger.error("Fatal error during server execution", { 
      error: error instanceof Error ? error.message : String(error) 
    });
    metrics.increment('fatal_errors');
    process.exit(1);
  });
}
