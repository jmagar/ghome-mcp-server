import { MCPClient } from '@modelcontextprotocol/sdk';

async function main() {
  const client = new MCPClient({
    serverUrl: 'http://localhost:3000', // Default MCP server port
    clientId: 'claude-test-client',
    clientName: 'Claude Test Client'
  });

  try {
    await client.connect();
    console.log('Connected to MCP server');

    // Test the connection
    const response = await client.ping();
    console.log('Ping response:', response);

    // Add any specific test cases here
    
    // Cleanup
    await client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 