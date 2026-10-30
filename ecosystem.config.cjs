// PM2 config — keeps the CRM running 24x7 and restarts it on crash/reboot
module.exports = {
  apps: [{
    name: 'growcend-crm',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_memory_restart: '400M',
    env: { NODE_ENV: 'production' }
  }]
};
