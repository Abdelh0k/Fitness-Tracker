import { createServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createSupabaseTokenVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { createAteformHttpHandler } from './http.js';

const config = loadConfig();
const handler = createAteformHttpHandler(config, createSupabaseTokenVerifier(config));
const server = createServer(toNodeHandler(handler));

server.listen(config.port, () => {
  console.log(`Ateform MCP listening on http://localhost:${config.port}${config.publicUrl.pathname}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
