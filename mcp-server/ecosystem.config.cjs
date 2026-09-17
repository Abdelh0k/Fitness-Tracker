module.exports = {
  apps: [
    {
      name: 'ateform-mcp',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      instances: 1,
      autorestart: true,
      max_restarts: 10
    }
  ]
};
