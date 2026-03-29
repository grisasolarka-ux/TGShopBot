/**
 * keepAlive.js – v0.6.2
 *
 * Schlankes, zuverlässiges Keep-Alive System für TGShopBot auf Render.com.
 *
 * ─── WARUM DER RÜCKBAU VON v0.6.1 ────────────────────────────────────────
 * v0.6.1 führte einen Update-Watchdog ein, der process.exit(1) auslöst,
 * wenn länger als 30min kein Telegram-Update einkam. Das klingt schlau,
 * hat aber in der Praxis nach 3-4 Tagen zu stillen Abstürzen geführt:
 *
 * - In ruhigen Nächten kommen tatsächlich 30+ Min keine Updates.
 * - Der Watchdog interpretiert das als "silent polling death" → Neustart.
 * - Beim Neustart schließt Node.js alle Sockets → "Server wurde geschlossen"
 *   Meldungen in den Logs.
 * - Render.com startet den Container neu, aber das passiert unnötig.
 *
 * ─── DIE ZUVERLÄSSIGE LÖSUNG ──────────────────────────────────────────────
 * Wir verlassen uns auf das bewährte System:
 *
 * 1. HEALTH SERVER: Einfacher HTTP-Server auf PORT. Antwortet mit 200 OK.
 *    UptimeRobot pingt diesen alle 5 Minuten → kein Cold Start auf Render.
 *
 * 2. TELEGRAM HEARTBEAT: Alle 4 Minuten getMe() aufrufen.
 *    3x hintereinander fehlgeschlagen → process.exit(1).
 *    Das erkennt echte Telegram-Verbindungsausfälle zuverlässig.
 *
 * Kein Update-Watchdog. Kein Self-Ping. Keine unnötigen Neustarts.
 * UptimeRobot übernimmt das Aufwecken – das hat historisch am besten
 * funktioniert.
 */

const http = require('http');

// ─── KONFIGURATION ────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 4 * 60 * 1000;  // 4min – Telegram API Check
const MAX_FAILURES       = 3;               // 3x Heartbeat fehlt → Neustart

// ─── STATE ────────────────────────────────────────────────────────────────

let bot             = null;
let heartbeatTimer  = null;
let failureCount    = 0;
let lastHeartbeat   = Date.now();
let totalHeartbeats = 0;
const startTime     = Date.now();

// ─── HEARTBEAT: Telegram API Connectivity Check ───────────────────────────

const heartbeat = async () => {
    try {
        await bot.telegram.getMe();
        failureCount   = 0;
        lastHeartbeat  = Date.now();
        totalHeartbeats++;
    } catch (error) {
        failureCount++;
        console.error(
            `[KeepAlive] Heartbeat fehlgeschlagen (${failureCount}/${MAX_FAILURES}): ${error.message}`
        );
        if (failureCount >= MAX_FAILURES) {
            console.error(
                `[KeepAlive] ⛔ ${MAX_FAILURES}x Heartbeat fehlgeschlagen → ` +
                `Prozess wird beendet für Container-Restart`
            );
            setTimeout(() => process.exit(1), 1000);
        }
    }
};

// ─── HEALTH STATUS ────────────────────────────────────────────────────────

const formatUptime = (totalSeconds) => {
    const days    = Math.floor(totalSeconds / 86400);
    const hours   = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days  > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const getHealthStatus = () => {
    const now           = Date.now();
    const uptimeSeconds = Math.floor((now - startTime) / 1000);
    const heartbeatAge  = now - lastHeartbeat;

    return {
        healthy:       failureCount < MAX_FAILURES,
        uptime:        formatUptime(uptimeSeconds),
        lastHeartbeat: `${Math.floor(heartbeatAge / 1000)}s ago`,
        heartbeats:    totalHeartbeats,
        failures:      failureCount,
        status:        failureCount < MAX_FAILURES ? 'Bot is running' : 'Bot may be unresponsive'
    };
};

// ─── HTTP SERVER ──────────────────────────────────────────────────────────

const createServer = (port) => {
    const server = http.createServer((req, res) => {
        const status     = getHealthStatus();
        const statusCode = status.healthy ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[KeepAlive] Health-Server auf Port ${port} – UptimeRobot pingt diesen alle 5min`);
    });

    return server;
};

// ─── START / STOP ─────────────────────────────────────────────────────────

const start = (botInstance) => {
    bot = botInstance;

    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    heartbeat(); // Sofort einmal prüfen

    console.log(
        `[KeepAlive] Watchdog v0.6.2 gestartet ` +
        `(Heartbeat: ${HEARTBEAT_INTERVAL / 60000}min, MaxFailures: ${MAX_FAILURES})`
    );
};

const stop = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log('[KeepAlive] Watchdog gestoppt.');
};

// notifyUpdate bleibt als leere Stub-Funktion damit index.js nicht
// angepasst werden muss (rückwärtskompatibel).
const notifyUpdate = () => {};

module.exports = {
    createServer,
    start,
    stop,
    notifyUpdate,
    getHealthStatus
};
