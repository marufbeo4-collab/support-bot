const TOKEN = "8620612566:AAG1DqsHR8du4QZUDaP489yszhMczweF5o4"; // আপনার টোকেন দিন
const API = `https://api.telegram.org/bot${TOKEN}`;
const MAIN_GROUP_ID = -5184100145; // আপনার এডমিন গ্রুপ আইডি
const ADMIN_IDS = [123456789]; // আপনার টেলিগ্রাম আইডি

const http = require("http");
const fs = require("fs");

// ==============================
// SERVER FOR RENDER
// ==============================
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("GOWIN Support Bot is active and running...");
});
server.listen(process.env.PORT || 8080);
console.log("🚀 GOWIN Support Bot Started with TIME-SHIELD Protection!");

// ==============================
// FILES & MEMORY
// ==============================
const BLOCK_FILE = "blocked.json";
let blockedUsers = new Set();
const runtimeProcessedMessages = new Set();
const albumBucket = {};
let lastOffset = 0;

// ==============================
// LOAD & SAVE BLOCKED USERS
// ==============================
function loadBlockedUsers() {
  try {
    if (!fs.existsSync(BLOCK_FILE)) return new Set();
    const data = JSON.parse(fs.readFileSync(BLOCK_FILE, "utf8"));
    return new Set(Array.isArray(data) ? data.map(Number) : []);
  } catch {
    return new Set();
  }
}

function saveBlockedUsers() {
  try {
    fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers], null, 2));
  } catch (e) {
    console.error("Save error:", e.message);
  }
}

// Initial Load
blockedUsers = loadBlockedUsers();

function blockUser(userId) {
  blockedUsers.add(Number(userId));
  saveBlockedUsers();
  return true;
}

function unblockUser(userId) {
  blockedUsers.delete(Number(userId));
  saveBlockedUsers();
  return true;
}

function isBlocked(userId) {
  return blockedUsers.has(Number(userId));
}

// ==============================
// API HELPERS
// ==============================
async function api(method, data = {}) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function escapeHtml(text = "") { return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function getUserLink(msg) { return `<a href="tg://user?id=${msg.chat.id}">${escapeHtml(msg.from?.first_name || "User")}</a>`; }
function makeTicketId() { return "GW" + Date.now().toString().slice(-8); }
function extractMetaFromText(text = "") {
  const idMatch = text.match(/#ID(\d+)_(\d+)/);
  return { userId: idMatch ? Number(idMatch[1]) : null, userMsgId: idMatch ? Number(idMatch[2]) : null };
}

// ==============================
// MENU & TEXTS
// ==============================
const BTN_DEPOSIT = "💳 𝗗𝗘𝗣𝗢𝗦𝗜𝗧 𝗜𝗦𝗦𝗨𝗘";
const BTN_WITHDRAW = "💸 𝗪𝗜𝗧𝗛𝗗𝗥𝗔𝗪 𝗜𝗦𝗦𝗨𝗘";
const BTN_LOGIN = "🆔 𝗟𝗢𝗚𝗜𝗡 / 𝗚𝗔𝗠𝗘 𝗜𝗗";
const BTN_OTHER = "🛠 𝗢𝗧𝗛𝗘𝗥 𝗦𝗨𝗣𝗣𝗢𝗥𝗧";
const BTN_STATUS = "📌 𝗠𝗬 𝗧𝗜𝗖𝗞𝗘𝗧 𝗦𝗧𝗔𝗧𝗨𝗦";
const BTN_HELP = "📘 𝗛𝗢𝗪 𝗧𝗢 𝗦𝗨𝗕𝗠𝗜𝗧";

const mainKeyboard = {
  keyboard: [[{ text: BTN_DEPOSIT }, { text: BTN_WITHDRAW }], [{ text: BTN_LOGIN }, { text: BTN_OTHER }], [{ text: BTN_STATUS }, { text: BTN_HELP }]],
  resize_keyboard: true
};

function welcomeText(name) { return `🎯 <b>WELCOME TO GOWIN SUPPORT</b>\n\nHello <b>${escapeHtml(name)}</b>,\nPlease select your problem type from the menu below.\n\nOur support team will respond as soon as possible.`; }

function getAdminInlineKeyboard(userId) {
  return { inline_keyboard: [[{ text: "🔒 Close Ticket", callback_data: `close_${userId}` }], [{ text: "🚫 Block User", callback_data: `block_${userId}` }, { text: "✅ Unblock", callback_data: `unblock_${userId}` }]] };
}

// ==============================
// MESSAGE HANDLERS
// ==============================
async function handlePrivateMessage(msg) {
  const userId = msg.chat.id;
  const text = msg.text || "";

  if (isBlocked(userId)) {
    // Blocked users get nothing, completely ignored to save server load.
    return; 
  }

  if (text === "/start") {
    await api("sendMessage", { chat_id: userId, text: welcomeText(msg.from?.first_name || "User"), parse_mode: "HTML", reply_markup: mainKeyboard });
    return;
  }

  // Handle standard buttons
  const isMenuBtn = [BTN_DEPOSIT, BTN_WITHDRAW, BTN_LOGIN, BTN_OTHER, BTN_STATUS, BTN_HELP].includes(text);
  
  if (isMenuBtn) {
    if (text === BTN_STATUS) {
      await api("sendMessage", { chat_id: userId, text: `📌 <b>Ticket Status:</b> Your message has been sent to our team. Please wait for a reply.`, parse_mode: "HTML" });
      return;
    }
    if (text === BTN_HELP) {
      await api("sendMessage", { chat_id: userId, text: `📘 <b>HOW TO SUBMIT PROPERLY</b>\n\nSend:\n• Game ID\n• Problem details\n• Screenshot if available`, parse_mode: "HTML" });
      return;
    }
    await api("sendMessage", { chat_id: userId, text: `✅ <b>Category Selected</b>\n\nPlease type your message or send a screenshot now.`, parse_mode: "HTML" });
    return;
  }

  // Forward user message to Admin Group
  const ticketId = makeTicketId();
  const magicId = `#ID${userId}_${msg.message_id}`;
  const header = `🔔 <b>GOWIN TICKET: ${ticketId}</b>\n👤 ${getUserLink(msg)}\n🆔 <code>${magicId}</code>\n\n💬 <b>Message below:</b>`;

  await api("sendMessage", { chat_id: MAIN_GROUP_ID, text: header, parse_mode: "HTML", reply_markup: getAdminInlineKeyboard(userId) });
  await api("copyMessage", { chat_id: MAIN_GROUP_ID, from_chat_id: userId, message_id: msg.message_id });
  
  await api("sendMessage", { chat_id: userId, text: `✅ <b>Support request received!</b>\nTicket: <code>${ticketId}</code>\nOur team will reply shortly.`, parse_mode: "HTML" });
}

async function handleGroupMessage(msg) {
  if (msg.chat.id !== MAIN_GROUP_ID || !msg.reply_to_message) return;

  const meta = extractMetaFromText(msg.reply_to_message.text || msg.reply_to_message.caption || "");
  if (!meta.userId) return;

  if (isBlocked(meta.userId)) {
    await api("sendMessage", { chat_id: msg.chat.id, text: `⚠️ <b>User is blocked.</b> Unblock first to reply.`, parse_mode: "HTML" });
    return;
  }

  if (!meta.userMsgId) return;

  await api("copyMessage", { chat_id: meta.userId, from_chat_id: msg.chat.id, message_id: msg.message_id, reply_to_message_id: meta.userMsgId });
  await api("setMessageReaction", { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: "⚡" }] });
}

async function handleCallbackQuery(cb) {
  const data = cb.data;
  const adminGroupId = cb.message?.chat?.id;

  if (adminGroupId !== MAIN_GROUP_ID) return;

  const parts = data.split("_");
  const action = parts[0];
  const targetUserId = Number(parts[1]);

  if (action === "close") {
    await api("sendMessage", { chat_id: targetUserId, text: `✅ <b>Your support request is now closed.</b>`, parse_mode: "HTML" });
    await api("answerCallbackQuery", { callback_query_id: cb.id, text: "Ticket Closed!" });
  } else if (action === "block") {
    blockUser(targetUserId);
    await api("sendMessage", { chat_id: targetUserId, text: `🚫 <b>ACCOUNT SUSPENDED</b>\n\nYou have been blocked.`, parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
    await api("answerCallbackQuery", { callback_query_id: cb.id, text: "User Blocked!", show_alert: true });
  } else if (action === "unblock") {
    unblockUser(targetUserId);
    await api("sendMessage", { chat_id: targetUserId, text: `✅ <b>ACCOUNT RESTORED</b>\nYou can send messages now.`, parse_mode: "HTML", reply_markup: mainKeyboard });
    await api("answerCallbackQuery", { callback_query_id: cb.id, text: "User Unblocked!", show_alert: true });
  }
}

// ==============================
// 🔥 BULLETPROOF POLLING (ANTI-DOUBLE MSG SHIELD)
// ==============================
async function poll() {
  await api("deleteWebhook", { drop_pending_updates: true }); // Clear all old stuck messages immediately
  
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${lastOffset}`);
      const data = await res.json();

      if (!data.ok || !data.result || data.result.length === 0) {
        await sleep(1500);
        continue;
      }

      // INSTANTLY update offset so Telegram NEVER sends these again
      lastOffset = data.result[data.result.length - 1].update_id + 1;

      for (const update of data.result) {
        if (update.callback_query) { 
          await handleCallbackQuery(update.callback_query); 
          continue; 
        }
        
        const msg = update.message;
        if (!msg || msg.from?.is_bot) continue;

        // 🔥 THE MAGIC SHIELD: Anti-Ghost & Anti-Restart Spam
        // যদি মেসেজটা ৬০ সেকেন্ডের বেশি পুরনো হয়, ডাইরেক্ট রিজেক্ট! 
        const msgTimeSeconds = msg.date;
        const currentServerTimeSeconds = Math.floor(Date.now() / 1000);
        
        if (currentServerTimeSeconds - msgTimeSeconds > 60) {
          console.log("Old message blocked by shield:", msg.text);
          continue; // কোড এখানেই থেমে যাবে, কোনো রিপ্লাই দেবে না
        }

        // RAM Cache Lock
        const key = `${msg.chat.id}_${msg.message_id}`;
        if (runtimeProcessedMessages.has(key)) continue;
        runtimeProcessedMessages.add(key);

        if (msg.chat.type === "private") {
          await handlePrivateMessage(msg);
        } else if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
          await handleGroupMessage(msg);
        }
      }
    } catch (e) {
      await sleep(2000);
    }
  }
}

poll();
