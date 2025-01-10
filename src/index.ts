import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger, metrics, health } from "./logger.js";
import { Config } from './types';
import { tools, handlers } from './tools';
import { SDMService } from './services/sdm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class GoogleHomeServer extends Server {
  private auth: OAuth2Client | null = null;
  private logger = createLogger('ghome-server');
  private config: Config;
  private sdm: ReturnType<typeof google.smartdevicemanagement> | null = null;

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
    try {
      return await this.logger.measureOperation('server_initialize', async () => {
        await this.setupAuth();
        this.setupTools();
        
        // Register additional health checks
        health.registerCheck('auth', async () => this.auth !== null);
        health.registerCheck('sdm', async () => this.sdm !== null);
      });
    } catch (error: any) {
      this.logger.error("Failed to initialize server", {
        error: error instanceof Error ? error.message : 
              typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error)
      });
      throw error;
    }
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
          this.logger.debug('Access token verified', { 
            hasToken: Boolean(token),
            tokenType: token?.token_type,
            expiryDate: token?.expiry_date
          });

          this.logger.debug('Initializing SDM client...');
          this.sdm = google.smartdevicemanagement({
            version: 'v1',
            auth: this.auth
          });

          this.logger.info("Authentication setup completed successfully", {
            hasAuth: Boolean(this.auth),
            hasSDM: Boolean(this.sdm)
          });
        } catch (authError: any) {
          this.logger.error("OAuth2 setup failed", {
            error: authError instanceof Error ? authError.message : 
                  typeof authError === 'object' && authError !== null ? JSON.stringify(authError) : String(authError),
            stack: authError instanceof Error ? authError.stack : undefined,
            code: authError?.code,
            response: authError?.response?.data
          });
          metrics.increment('oauth_setup_failures');
          throw {
            code: ErrorCode.InternalError,
            message: "OAuth2 setup failed",
            data: authError
          };
        }
      } catch (error: any) {
        this.logger.error("Failed to setup authentication", {
          error: error instanceof Error ? error.message : 
                typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          code: error?.code,
          response: error?.response?.data
        });
        metrics.increment('auth_setup_failures');
        throw error;
      }
    });
  }

  protected setupTools() {
    // List available tools
    this.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug("Handling list_tools request");
      metrics.increment('list_tools_requests');
      return { tools };
    });

    // Handle tool execution
    this.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      return this.logger.measureOperation(`execute_tool_${request.params.name}`, async () => {
        const { name, arguments: args } = request.params;
        this.logger.info(`Executing tool: ${name}`, { args: args || {} });
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

        return handler(this.sdm, args);
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
