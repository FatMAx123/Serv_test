module.exports = {
  apps: [
    {
      name: 'project-steam-mmo',
      script: 'server/server.js',
      cwd: '/var/www/project-steam',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-semi-space-size=64 --max-old-space-size=1200',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        DB: process.env.DB || 'file',
        EDITOR_ENABLED: '0',
        ALLOW_FILE_DB_IN_PROD: '1',
        ALLOW_INSECURE_AUTH: '1',
        YANDEX_APP_SECRET: process.env.YANDEX_APP_SECRET || '',
        NET_ENGINE: 'uws',
        STRICT_UWS: '1',
        WS_DEFLATE: '0',
        UV_THREADPOOL_SIZE: '8'
      },
      // Автоперезапуск при падении или превышении памяти (адаптировано под 2GB RAM VPS)
      max_memory_restart: '1500M',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      kill_timeout: 5000,
      treekill: true,
      // Логирование
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/project-steam/error.log',
      out_file: '/var/log/project-steam/out.log',
      merge_logs: true
    },
    {
      name: 'project-steam-watchdog',
      script: 'scripts/watchdog.js',
      cwd: '/var/www/project-steam',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      watch: false,
      env: {
        PORT: 8080,
        CHECK_INTERVAL_MS: '10000',
        MAX_FAILURES: '8'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/project-steam/watchdog-error.log',
      out_file: '/var/log/project-steam/watchdog-out.log'
    }
  ]
};
