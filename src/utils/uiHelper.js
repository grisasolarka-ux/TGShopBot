/**
 * uiHelper.js – v0.5.63
 * 
 * Robustes UI-Hilfesystem mit zuverlässiger Medien-Anzeige.
 * Nutzt sendMediaWithRetry für fehlerfreien Bild/GIF/Video-Versand.
 */

const texts = require('./texts');
const { sendMediaWithRetry } = require('./imageUploader');

/**
 * Parst eine image_url und gibt { type, fileId } zurück.
 * Format: "photo:FILE_ID", "animation:FILE_ID", "video:FILE_ID"
 * Legacy (kein Präfix): wird als "photo" behandelt.
 */
const parseMedia = (imageUrl) => {
    if (!imageUrl) return { type: null, fileId: null };
    if (imageUrl.startsWith('photo:')) return { type: 'photo', fileId: imageUrl.slice(6) };
    if (imageUrl.startsWith('animation:')) return { type: 'animation', fileId: imageUrl.slice(10) };
    if (imageUrl.startsWith('video:')) return { type: 'video', fileId: imageUrl.slice(6) };
    // Legacy: kein Präfix = Telegram file_id eines Fotos oder URL
    return { type: 'photo', fileId: imageUrl };
};

/**
 * Sendet ein Produkt-Medium (Foto/GIF/Video) korrekt basierend auf Typ.
 * Verwendet Retry-Logik und automatischen Typ-Fallback.
 */
const sendProductMedia = async (ctx, imageUrl, text, replyMarkup) => {
    const options = { caption: text, parse_mode: 'Markdown', reply_markup: replyMarkup };

    // Alte Nachricht löschen wenn vorhanden
    if (ctx.callbackQuery?.message) {
        await ctx.deleteMessage().catch(() => {});
    }

    // Kein Medium → nur Text senden
    if (!imageUrl) {
        return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
    }

    const { type, fileId } = parseMedia(imageUrl);

    if (!fileId) {
        return await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
    }

    // Primärer Versuch mit korrektem Typ und Retry-Logik
    try {
        return await sendMediaWithRetry(ctx, type, fileId, options);
    } catch (primaryError) {
        console.warn(`sendProductMedia: Primärer Typ "${type}" fehlgeschlagen: ${primaryError.message}`);
    }

    // Fallback: Andere Medientypen durchprobieren (mit Retry je Typ)
    const allTypes = ['photo', 'animation', 'video'];
    const fallbackTypes = allTypes.filter(t => t !== type);

    for (const fallbackType of fallbackTypes) {
        try {
            return await sendMediaWithRetry(ctx, fallbackType, fileId, options, 1);
        } catch (e) {
            // Weiter zum nächsten Typ
        }
    }

    // Absoluter Fallback: Text ohne Bild
    console.error(`sendProductMedia: Alle Medientypen fehlgeschlagen für fileId: ${fileId.substring(0, 30)}...`);
    return await ctx.reply(text + texts.getAdminImageLoadError(), { parse_mode: 'Markdown', reply_markup: replyMarkup });
};

/**
 * Aktualisiert eine bestehende Nachricht oder sendet eine neue.
 * Handhabt den Wechsel zwischen Text- und Media-Nachrichten korrekt.
 */
const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const msg = ctx.callbackQuery.message;
            const hasMedia = !!(msg.photo || msg.animation || msg.video || msg.document);

            if (imageUrl) {
                // Muss Medien senden → alte Nachricht löschen und neu senden
                await ctx.deleteMessage().catch(() => {});
                return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
            } else {
                if (hasMedia) {
                    // Alte Nachricht hat Medien, neue nicht → löschen und Text senden
                    await ctx.deleteMessage().catch(() => {});
                    return await ctx.reply(text, options);
                } else {
                    // Normales Text-Edit
                    return await ctx.editMessageText(text, options);
                }
            }
        } else {
            if (imageUrl) {
                return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
            } else {
                return await ctx.reply(text, options);
            }
        }
    } catch (error) {
        // Fallback bei allem
        try {
            if (ctx.callbackQuery?.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            if (imageUrl) {
                return await sendProductMedia(ctx, imageUrl, text, replyMarkup);
            }
            return await ctx.reply(text, options);
        } catch (fallbackError) {
            console.error('UI Helper Error:', fallbackError.message);
        }
    }
};

const sendTemporary = async (ctx, text, seconds = 3) => {
    try {
        if (ctx.message) ctx.deleteMessage().catch(() => {});
        const msg = await ctx.reply(`✨ ${text}`);
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        }, seconds * 1000);
    } catch (error) {
        console.error('Temp Message Error:', error.message);
    }
};

module.exports = { updateOrSend, sendTemporary, sendProductMedia, parseMedia };
