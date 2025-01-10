# Google Home MCP Server

An MCP server implementation for controlling Google Home smart plugs through the Smart Home API.

## Features

- List all available smart plugs and their states
- Control smart plugs (turn on/off)
- Get real-time state of specific smart plugs
- Automatic device state refresh
- OAuth2 authentication with Smart Home API

## Prerequisites

1. Google Cloud Project with Smart Home API enabled
2. Actions on Google Smart Home Action project
3. OAuth 2.0 Client credentials for Smart Home Action
4. Node.js 18 or higher
5. Access to Google Home smart plugs

## Setup

1. Create a Smart Home Action:
   - Go to [Actions on Google Console](https://console.actions.google.com)
   - Create a new project
   - Choose "Smart Home" as the project type
   - Configure Account Linking:
     - OAuth Client ID
     - OAuth Client Secret
     - Authorization URL
     - Token URL

2. Set up OAuth 2.0:
   - Configure your OAuth server endpoints
   - Set up user authentication flow
   - Implement token generation/validation

3. Install dependencies:
```bash
pnpm install
```

4. Configure the server:
   - Copy `config.json.example` to `config.json`
   - Fill in your:
     - OAuth Client ID
     - OAuth Client Secret

5. Build the server:
```bash
pnpm build
```

6. Start the server:
```bash
pnpm start
```

## Available Tools

### 1. List Smart Plugs
```typescript
{
  name: "list_smart_plugs",
  description: "List all available smart plugs and their current states",
  response: Array<{
    id: string;
    name: string;
    state: {
      on: boolean;
      online: boolean;
    }
  }>
}
```

### 2. Control Smart Plug
```typescript
{
  name: "control_smart_plug",
  description: "Turn a smart plug on or off",
  parameters: {
    deviceId: string;  // Device ID from list_smart_plugs
    state: boolean;    // true for on, false for off
  },
  response: {
    success: boolean;
    device: {
      id: string;
      name: string;
      state: {
        on: boolean;
        online: boolean;
      }
    }
  }
}
```

### 3. Get Smart Plug State
```typescript
{
  name: "get_smart_plug_state",
  description: "Get the current state of a specific smart plug",
  parameters: {
    deviceId: string;  // Device ID from list_smart_plugs
  },
  response: {
    id: string;
    name: string;
    state: {
      on: boolean;
      online: boolean;
    }
  }
}
```

## API Details

The server implements the Smart Home API intents:

1. **SYNC Intent**
   - Called when users link their account
   - Reports available devices and capabilities
   - Handles device discovery

2. **QUERY Intent**
   - Reports current state of devices
   - Handles state queries from Google Assistant
   - Returns online/offline status

3. **EXECUTE Intent**
   - Handles device control commands
   - Executes on/off operations
   - Reports command success/failure

## Error Handling

The server implements comprehensive error handling with specific error codes:

- `CONFIG_ERROR`: Configuration loading or validation errors
- `API_ERROR`: Errors from Smart Home API
- `DEVICE_NOT_FOUND`: Device ID not found in available devices
- `COMMAND_ERROR`: Error executing device command

Each error includes:
- Error message
- Error code
- Detailed error information when available

## Security

- OAuth 2.0 authentication flow
- Secure token handling
- Request validation
- Command authorization
- HTTPS communication
- Input sanitization

## Development

1. Start in development mode:
```bash
pnpm dev
```

2. Run tests:
```bash
pnpm test
```

3. Debug logs:
   - All API calls are logged
   - Error details are captured
   - Device state changes are tracked

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
# ghome-mcp-server
