const orderRepo = require('../database/repositories/orderRepo');
const texts = require('./texts');
const formatters = require('./formatters');

async function clearOldNotifications(ctx, order) {
    if (!order || !order.notification_msg_ids || order.notification_msg_ids.length === 0) return;
    const currentMsgId = ctx.callbackQuery?.message?.message_id;
    for (const msg of order.notification_msg_ids) {
        try {
            if (currentMsgId && msg.message_id === currentMsgId) continue;
            await ctx.telegram.deleteMessage(msg.chat_id, msg.message_id);
        } catch (e) {}
    }
    await orderRepo.clearNotificationMsgIds(order.order_id);
}

async function buildOrderViewPayload(order) {
    const date = formatters.formatDate(order.created_at);
    let text = `📋 *Bestellung #${order.order_id}*\n\n`;
    text += `👤 Kunde: ID ${order.user_id}\n📅 Datum: ${date}\n`;
    text += `💰 Betrag: ${formatters.formatPrice(order.total_amount)}\n`;
    text += `💳 Zahlung: ${order.payment_method_name || 'N/A'}\n`;
    text += `📦 Status: ${texts.getStatusLabel(order.status)}\n`;

    const method = order.delivery_method;
    if (method === 'shipping') text += `🚚 Lieferung: Versand\n`;
    else if (method === 'pickup') text += `🏪 Lieferung: Abholung\n`;
    else if (method === 'none' || !method) text += `📱 Lieferung: Digital\n`;

    if (order.shipping_link) text += `\n📦 Adresse: [Privnote](${order.shipping_link})`;
    if (order.tx_id) text += `\n🔑 TX-ID: \`${order.tx_id}\``;

    if (order.admin_notes && order.admin_notes.length > 0) {
        text += `\n\n📝 *Notizen:*`;
        order.admin_notes.forEach((note, i) => {
            const nd = new Date(note.date).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
            text += `\n${i + 1}. _${note.author}_ (${nd}): ${note.text}`;
        });
    }

    if (order.details && order.details.length > 0) {
        text += `\n\n*Artikel:*`;
        order.details.forEach(item => {
            const path = item.category_path ? `_${item.category_path}_ » ` : '';
            text += `\n▪️ ${item.quantity}x ${path}${item.name} = ${formatters.formatPrice(item.total)}`;
        });
    }

    const keyboard = { inline_keyboard: [] };
    keyboard.inline_keyboard.push([{ text: '👤 Kunden kontaktieren', url: `tg://user?id=${order.user_id}` }]);
    if (method === 'none' || !method) {
        keyboard.inline_keyboard.push([{ text: '📥 Digital Liefern', callback_data: `odeliv_${order.order_id}` }]);
    }
    keyboard.inline_keyboard.push(
        [{ text: '⚙️ In Bearbeitung', callback_data: `ostatus_${order.order_id}_processing` }, { text: '📦 Versendet', callback_data: `ostatus_${order.order_id}_versand` }],
        [{ text: '✅ Abgeschlossen', callback_data: `ostatus_${order.order_id}_abgeschlossen` }, { text: '❌ Abgebrochen', callback_data: `ostatus_${order.order_id}_abgebrochen` }]
    );
    if (order.feedback_invited) {
        keyboard.inline_keyboard.push([{ text: '✅ Für Feedback qualifiziert', callback_data: 'noop' }]);
    } else {
        keyboard.inline_keyboard.push([{ text: '⭐ Feedback erlauben', callback_data: `allow_fb_${order.order_id}` }]);
    }
    keyboard.inline_keyboard.push([{ text: '📝 Notiz', callback_data: `onote_${order.order_id}` }], [{ text: '🗑 Löschen', callback_data: `odel_${order.order_id}` }], [{ text: '🔙 Zurück zum Panel', callback_data: 'admin_panel' }]);
    return { text, reply_markup: keyboard };
}

module.exports = { clearOldNotifications, buildOrderViewPayload };
