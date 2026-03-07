/**
 * imageUploader.js – v0.5.63
 * 
 * Robustes Media-Upload-System für Telegram.
 * Speichert Telegram file_id mit Typ-Präfix (photo:, animation:, video:).
 * Validiert Uploads per getFile-API und hat Retry-Logik.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Wartet eine bestimmte Anzahl Millisekunden.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extrahiert die file_id aus einer eingehenden Telegram-Nachricht.
 * Gibt ein Objekt { type, fileId, prefixedId } zurück oder null.
 */
const extractMediaFromMessage = (message) => {
    if (!message) return null;

    // Fotos: höchste Auflösung (letztes Element im Array)
    if (message.photo && message.photo.length > 0) {
        const best = message.photo[message.photo.length - 1];
        return {
            type: 'photo',
            fileId: best.file_id,
            fileUniqueId: best.file_unique_id,
            prefixedId: `photo:${best.file_id}`
        };
    }

    // GIF / Animation
    if (message.animation) {
        return {
            type: 'animation',
            fileId: message.animation.file_id,
            fileUniqueId: message.animation.file_unique_id,
            prefixedId: `animation:${message.animation.file_id}`
        };
    }

    // Video
    if (message.video) {
        return {
            type: 'video',
            fileId: message.video.file_id,
            fileUniqueId: message.video.file_unique_id,
            prefixedId: `video:${message.video.file_id}`
        };
    }

    // Dokument das ein Bild/GIF ist (z.B. als Datei gesendet)
    if (message.document) {
        const mime = message.document.mime_type || '';
        if (mime.startsWith('image/gif')) {
            return {
                type: 'animation',
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id,
                prefixedId: `animation:${message.document.file_id}`
            };
        }
        if (mime.startsWith('image/')) {
            return {
                type: 'photo',
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id,
                prefixedId: `photo:${message.document.file_id}`
            };
        }
        if (mime.startsWith('video/')) {
            return {
                type: 'video',
                fileId: message.document.file_id,
                fileUniqueId: message.document.file_unique_id,
                prefixedId: `video:${message.document.file_id}`
            };
        }
    }

    return null;
};

/**
 * Validiert eine file_id über die Telegram Bot API.
 * Prüft ob die Datei tatsächlich existiert und abrufbar ist.
 * Gibt true zurück wenn valide, false wenn nicht.
 */
const validateFileId = async (ctx, fileId) => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const file = await ctx.telegram.getFile(fileId);
            return !!(file && file.file_id);
        } catch (error) {
            const errMsg = error.message || '';
            // Ungültige file_id → sofort aufgeben
            if (errMsg.includes('wrong file_id') || errMsg.includes('file is too big') || errMsg.includes('invalid file_id')) {
                console.error(`validateFileId: Ungültige file_id (Versuch ${attempt}): ${errMsg}`);
                return false;
            }
            // Netzwerkfehler → retry
            if (attempt < MAX_RETRIES) {
                console.warn(`validateFileId: Versuch ${attempt}/${MAX_RETRIES} fehlgeschlagen, retry in ${RETRY_DELAY_MS}ms...`);
                await delay(RETRY_DELAY_MS * attempt);
            } else {
                console.error(`validateFileId: Alle ${MAX_RETRIES} Versuche fehlgeschlagen: ${errMsg}`);
                return false;
            }
        }
    }
    return false;
};

/**
 * Sendet ein Medium mit Retry-Logik.
 * Versucht mehrfach, bevor ein Fehler geworfen wird.
 */
const sendMediaWithRetry = async (ctx, type, fileId, options = {}, retries = MAX_RETRIES) => {
    const methodMap = {
        'photo': 'replyWithPhoto',
        'animation': 'replyWithAnimation',
        'video': 'replyWithVideo'
    };

    const method = methodMap[type] || 'replyWithPhoto';
    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await ctx[method](fileId, options);
        } catch (error) {
            lastError = error;
            const errMsg = error.message || '';

            // Definitiv ungültige file_id → kein Retry
            if (errMsg.includes('wrong file_id') || errMsg.includes('invalid file_id')) {
                throw error;
            }

            // Rate Limit → warte und retry
            if (errMsg.includes('Too Many Requests') || error.code === 429) {
                const retryAfter = error.parameters?.retry_after || 3;
                console.warn(`sendMediaWithRetry: Rate limit, warte ${retryAfter}s...`);
                await delay(retryAfter * 1000);
                continue;
            }

            // Anderer Fehler → kurz warten und retry
            if (attempt < retries) {
                console.warn(`sendMediaWithRetry: ${method} Versuch ${attempt}/${retries} fehlgeschlagen: ${errMsg}`);
                await delay(RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw lastError;
};

module.exports = { 
    extractMediaFromMessage, 
    validateFileId, 
    sendMediaWithRetry,
    MAX_RETRIES,
    RETRY_DELAY_MS
};
