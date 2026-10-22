try { require('./server/secrets-loader.js'); } catch (_) {}

module.exports = {
  apps: [
    {
      name: 'project-steam-mmo',
      script: 'server/server.js',
      cwd: '/var/www/project-steam',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-semi-space-size=128 --max-old-space-size=2560',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        DB: process.env.DB || 'file',
        EDITOR_ENABLED: '0',
        ALLOW_FILE_DB_IN_PROD: '1',
        ALLOW_INSECURE_AUTH: process.env.ALLOW_INSECURE_AUTH || (process.env.YANDEX_APP_SECRET ? '0' : '1'),
        KEY_ALLOW_KEYONLY: process.env.KEY_ALLOW_KEYONLY || '0',
        KEY_ALLOW_OLD_HASHES: process.env.KEY_ALLOW_OLD_HASHES || '0',
        YANDEX_APP_SECRET: process.env.YANDEX_APP_SECRET || '',
        NET_ENGINE: 'uws',
        STRICT_UWS: '1',
        WS_DEFLATE: '0',
        UV_THREADPOOL_SIZE: '16',
        MAX_CONNS_PER_IP: process.env.MAX_CONNS_PER_IP || '64',
        WS_MAX_BACKPRESSURE: '2097152',
        WS_IDLE_TIMEOUT: '48',
        STRESS_TEST: '1',
        STRESS_SECRET: process.env.STRESS_SECRET || 'ps-stress-perf-2026',
        MOD_SECRET: process.env.MOD_SECRET || '',
        CORS_ALLOW_LOCALHOST: process.env.CORS_ALLOW_LOCALHOST || '1',
        CORS_ORIGINS: process.env.CORS_ORIGINS || '217.179.49.236,217.179.49.236.sslip.io,93.77.168.135,93.77.168.135.sslip.io,localhost',
        KEY_PEPPER: process.env.KEY_PEPPER || '',
        KEY_VAULT_SECRET: process.env.KEY_VAULT_SECRET || '',
        ALLOW_DEFAULT_KEY_SECRETS: process.env.ALLOW_DEFAULT_KEY_SECRETS || '0',
        GUEST_LEGACY_TOKENS: process.env.GUEST_LEGACY_TOKENS || '0',
        GUEST_TOFU: process.env.GUEST_TOFU || '0'
      },
      // Автоперезапуск при падении или превышении памяти (адаптировано под 4GB RAM 4 vCPU VPS)
      max_memory_restart: '3200M',
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
    },
    {
      name: 'project-steam-bots',
      script: 'scripts/stress-test-3000.js',
      cwd: '/var/www/project-steam',
      args: '--host=127.0.0.1 --port=8080 --bots=150 --town-bots=30 --duration=0 --batch=10 --interval=200',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 10000,
      watch: false,
      env: {
        NODE_ENV: 'production',
        STRESS_TEST: '1',
        STRESS_SECRET: 'ps-stress-perf-2026',
        BOTS: '150',
        TOWN_BOTS: '30',
        DURATION: '0'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/project-steam/bots-error.log',
      out_file: '/var/log/project-steam/bots-out.log'
    }
  ]
};
