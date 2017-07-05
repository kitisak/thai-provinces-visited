module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [
    {
      name: 'thai-province',
      script: 'server.js',
      args: [],
      'no-daemon': true,
      watch: true,
      ignore_watch: [
        '[\\/\\\\]\\./',
        '.git',
        'node_modules',
        'public',
        'data',
      ],
      min_uptime: 10000,
      max_restarts: 2,
      env_production : {
        NODE_ENV: 'production'
      }
    }
  ],

  /**
   * Deployment section
   * http://pm2.keymetrics.io/docs/usage/deployment/
   */
  deploy : {
    production : {
      user : 'node',
      host : '212.83.163.1',
      ref  : 'origin/master',
      repo : 'git@github.com:repo.git',
      path : '/var/www/production',
      'post-deploy' : 'yarn  && pm2 startOrRestart ecosystem.json --env production'
    }
  }
}
