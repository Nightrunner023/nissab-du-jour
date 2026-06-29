// Configuration PM2 — lance et garde le serveur en vie (redémarrage auto).
// Le fuseau horaire est défini AVANT le démarrage de Node : il faut donc le
// poser ici (et non dans .env) pour que les dates et le cron soient corrects.
module.exports = {
  apps: [
    {
      name: 'nissab-du-jour',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'Europe/Paris',
      },
    },
  ],
};
