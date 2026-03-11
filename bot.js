const TOKEN = "8620612566:AAG1DqsHR8du4QZUDaP489yszhMczweF5o4"; // Apnar notun token ekhane diben
const API = `https://api.telegram.org/bot${TOKEN}`;
const MAIN_GROUP_ID = -5184100145;

// Your Telegram numeric admin IDs
const ADMIN_IDS = [123456789];

const http = require("http");
const fs = require("fs");

// ==============================
// SERVER
// ==============================
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("GOWIN Support Bot is running...");
});
server.listen(process.env.PORT || 8080);

console.log("🚀 GOWIN Support Bot Started with STRICT ANTI-DUPLICATE LOCK!");

// ==============================
// FILES
// ==============================
const BLOCK_FILE = "blocked.json";
const STATE_FILE = "state.json";
const PROFILE_FILE = "profiles.json";
const MSG_CACHE_FILE = "processed_messages.json";

// ==============================
// MEMORY
// ==============================
let blockedUsers = new Set();
let botState = { lastUpdateId: 0 };
let userProfile = {};
let isPolling = false;

const albumBucket = {};
const runtimeProcessedMessages = new Set();

// ==============================
// LOAD / SAVE
// ==============================
function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    // Ignore save errors silently
  }
}

function loadBlockedUsers() {
  try {
    if (!fs.existsSync(BLOCK_FILE)) return new Set();
    const data = JSON.parse(fs.readFileSync(BLOCK_FILE, "utf8"));
    return new Set(Array.isArray(data) ? data.map(Number) : []);
  } catch {
    return new Set();
  }
}

function persistBlockedUsers() {
  try {
    fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers], null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

function loadData() {
  blockedUsers = loadBlockedUsers();
  botState = loadJson(STATE_FILE, { lastUpdateId: 0 });
  userProfile = loadJson(PROFILE_FILE, {});
}

function saveState() { saveJson(STATE_FILE, botState); }
function saveProfiles() { saveJson(PROFILE_FILE, userProfile); }

loadData();

// ==============================
// 🔥 ULTRA-STRICT MESSAGE CACHE (FILE LEVEL LOCK)
// ==============================
function clearUserMessageCache(userId) {
  const uid = String(userId);
  let diskCache = loadJson(MSG_CACHE_FILE, {});
  
  for (const key of Object.keys(diskCache)) {
    if (key.startsWith(`${uid}_`)) delete diskCache[key];
  }
  for (const key of [...runtimeProcessedMessages]) {
    if (key.startsWith(`${uid}_`) || key.includes(`_${uid}_`)) {
      runtimeProcessedMessages.delete(key);
    }
  }
  saveJson(MSG_CACHE_FILE, diskCache);
}

function alreadyProcessedMessage(msg) {
  const key = `${msg.chat.id}_${msg.message_id}`;
  
  // 1. First check instant RAM cache
  if (runtimeProcessedMessages.has(key)) return true;
  
  // 2. Then check Hard Disk cache (Solves Ghost Processes & Loop Bugs)
  let diskCache = loadJson(MSG_CACHE_FILE, {});
  const now = Date.now();
  
  if (diskCache[key] && (now - diskCache[key] < 86400000)) {
    return true; // Already processed by another process or loop!
  }
  
  // Lock it immediately in RAM and Disk
  runtimeProcessedMessages.add(key);
  diskCache[key] = now;
  
  // Clean old cache to prevent file getting too large
  const keys = Object.keys(diskCache);
  if (keys.length > 3000) {
    const cutoff = now - 86400000;
    for (const k of keys) {
      if (diskCache[k] < cutoff) delete diskCache[k];
    }
  }
  
  saveJson(MSG_CACHE_FILE, diskCache);
  return false;
}

// ==============================
// BLOCK HELPERS
// ==============================
function blockUser(userId) {
  blockedUsers = loadBlockedUsers();
  blockedUsers.add(Number(userId));
  clearUserMessageCache(userId);
  return persistBlockedUsers();
}

function unblockUser(userId) {
  blockedUsers = loadBlockedUsers();
  blockedUsers.delete(Number(userId));
  clearUserMessageCache(userId);
  return persistBlockedUsers();
}

function isBlocked(userId) {
  blockedUsers = loadBlockedUsers(); 
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
  } catch (e) {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(text = "") {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getUserName(msg) {
  const firstName = msg.from?.first_name || "User";
  const username = msg.from?.username ? ` (@${msg.from.username})` : "";
  return `${firstName}${username}`;
}

function getUserLink(msg) {
  return `<a href="tg://user?id=${msg.chat.id}">${escapeHtml(getUserName(msg))}</a>`;
}

function makeMagicId(userId, msgId) { return `#ID${userId}_${msgId}`; }
function makeTicketId() { return "GW" + Date.now().toString().slice(-8); }
function isAdminId(userId) { return ADMIN_IDS.includes(userId); }

async function isGroupAdmin(chatId, userId) {
  if (isAdminId(userId)) return true;
  const res = await api("getChatMember", { chat_id: chatId, user_id: userId });
  if (!res || !res.ok) return false;
  return res.result?.status === "creator" || res.result?.status === "administrator";
}

function setCategory(userId, category) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].category = category;
  saveProfiles();
}

function getCategory(userId) { return userProfile[userId]?.category || "GENERAL"; }

function setLastTicket(userId, ticketId) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].lastTicketId = ticketId;
  saveProfiles();
}

function getLastTicket(userId) { return userProfile[userId]?.lastTicketId || null; }

function setLastTicketStatus(userId, status) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].lastTicketStatus = status;
  saveProfiles();
}

function getLastTicketStatus(userId) { return userProfile[userId]?.lastTicketStatus || "OPEN"; }
function extractMetaFromText(text = "") {
  const idMatch = text.match(/#ID(\d+)_(\d+)/);
  return { userId: idMatch ? Number(idMatch[1]) : null, userMsgId: idMatch ? Number(idMatch[2]) : null };
}

async function sendTyping(chatId) { await api("sendChatAction", { chat_id: chatId, action: "typing" }); }
function normalizeText(text = "") { return String(text).trim().replace(/\s+/g, " ").toLowerCase(); }

// ==============================
// MENU
// ==============================
const BTN_DEPOSIT = "💳 𝗗𝗘𝗣𝗢𝗦𝗜𝗧 𝗜𝗦𝗦𝗨𝗘";
const BTN_WITHDRAW = "💸 𝗪𝗜𝗧𝗛𝗗𝗥𝗔𝗪 𝗜𝗦𝗦𝗨𝗘";
const BTN_LOGIN = "🆔 𝗟𝗢𝗚𝗜𝗡 / 𝗚𝗔𝗠𝗘 𝗜𝗗";
const BTN_OTHER = "🛠 𝗢𝗧𝗛𝗘𝗥 𝗦𝗨𝗣𝗣𝗢𝗥𝗧";
const BTN_STATUS = "📌 𝗠𝗬 𝗧𝗜𝗖𝗞𝗘𝗧 𝗦𝗧𝗔𝗧𝗨𝗦";
const BTN_HELP = "📘 𝗛𝗢𝗪 𝗧𝗢 𝗦𝗨𝗕𝗠𝗜𝗧";

const mainKeyboard = {
  keyboard: [
    [{ text: BTN_DEPOSIT }, { text: BTN_WITHDRAW }],
    [{ text: BTN_LOGIN }, { text: BTN_OTHER }],
    [{ text: BTN_STATUS }, { text: BTN_HELP }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

function welcomeText(name) {
  return `🎯 <b>WELCOME TO GOWIN SUPPORT</b>\n\nHello <b>${escapeHtml(name)}</b>,\nPlease select your problem type from the menu below.\n\nOur support team will respond as soon as possible.`;
}

function helpText() {
  return `📘 <b>HOW TO SUBMIT PROPERLY</b>\n\nPlease send these details:\n• Game ID\n• Short problem description\n• TRX ID if payment related\n• Screenshot / proof if available\n\n✅ Clear details = faster support`;
}

function categoryPrompt(category) {
  const map = {
    DEPOSIT: `💳 <b>DEPOSIT SUPPORT</b>\n\nSend:\n1. Game ID\n2. TRX ID\n3. Deposit Amount\n4. Payment Screenshot`,
    WITHDRAW: `💸 <b>WITHDRAW SUPPORT</b>\n\nSend:\n1. Game ID\n2. Amount\n3. Method\n4. Screenshot if needed`,
    LOGIN: `🆔 <b>LOGIN / GAME ID SUPPORT</b>\n\nSend:\n1. Game ID\n2. Problem Description\n3. Screenshot if available`,
    OTHER: `🛠 <b>GENERAL SUPPORT</b>\n\nDescribe your issue clearly.\nYou can also send screenshot, video, or file.`
  };
  return map[category] || helpText();
}

function getAdminInlineKeyboard(userId) {
  return {
    inline_keyboard: [
      [{ text: "🔒 Close Ticket", callback_data: `close_${userId}` }],
      [{ text: "🚫 Block User", callback_data: `block_${userId}` }, { text: "✅ Unblock", callback_data: `unblock_${userId}` }]
    ]
  };
}

function buildCompactTicketMessage(msg, category, ticketId, preview) {
  const magicId = makeMagicId(msg.chat.id, msg.message_id);
  const userLink = getUserLink(msg);
  return `🔔 <b>GOWIN SUPPORT TICKET</b>\n🎟 <b>${ticketId}</b>\n👤 ${userLink}\n📂 <b>${escapeHtml(category)}</b>\n\n💬 <b>Message:</b>\n<blockquote>${escapeHtml(preview)}</blockquote>\n\n🆔 <code>${magicId}</code>`;
}

// ==============================
// ALBUM
// ==============================
async function sendAlbumGroup(groupId) {
  const bucket = albumBucket[groupId];
  if (!bucket || !bucket.messages?.length) return;
  delete albumBucket[groupId];

  const firstMsg = bucket.firstMsg;
  const userId = firstMsg.chat.id;
  
  if (isBlocked(userId)) return;

  const category = getCategory(userId);
  const ticketId = makeTicketId();

  setLastTicket(userId, ticketId);
  setLastTicketStatus(userId, "OPEN");

  const msgWithCaption = bucket.messages.find((m) => m.caption);
  const originalCaption = msgWithCaption?.caption || "Album / Multiple Media";

  const media = bucket.messages.map((m, index) => {
    const caption = index === 0 && msgWithCaption?.caption ? m.caption : undefined;
    if (m.photo) return { type: "photo", media: m.photo[m.photo.length - 1].file_id, caption };
    if (m.video) return { type: "video", media: m.video.file_id, caption };
    return null;
  }).filter(Boolean);

  await api("sendMediaGroup", { chat_id: MAIN_GROUP_ID, media });
  
  await api("sendMessage", {
    chat_id: MAIN_GROUP_ID,
    text: buildCompactTicketMessage(firstMsg, category, ticketId, originalCaption),
    parse_mode: "HTML",
    reply_markup: getAdminInlineKeyboard(userId)
  });

  await api("sendMessage", {
    chat_id: userId,
    text: `✅ <b>Support request received</b>\n\nTicket: <code>${ticketId}</code>\nCategory: <b>${escapeHtml(category)}</b>\nStatus: <b>OPEN</b>`,
    parse_mode: "HTML"
  });
}

// ==============================
// PRIVATE HANDLER
// ==============================
async function handlePrivateMessage(msg) {
  const userId = msg.chat.id;
  const text = msg.text || msg.caption || "";
  const tCheck = normalizeText(text);

  if (isBlocked(userId)) {
    const diskCache = loadJson(MSG_CACHE_FILE, {});
    const now = Date.now();
    const lastWarn = diskCache[`warn_${userId}`] || 0;
    
    if (now - lastWarn > 300000) { // Warn once every 5 mins
      await api("sendMessage", {
        chat_id: userId,
        text: `🚫 <b>ACCOUNT SUSPENDED</b>\n\nYou have been blocked by the admin. You can no longer send messages.`,
        parse_mode: "HTML",
        reply_markup: { remove_keyboard: true }
      });
      diskCache[`warn_${userId}`] = now;
      saveJson(MSG_CACHE_FILE, diskCache);
    }
    return;
  }

  if (text === "/start") {
    await sendTyping(userId);
    await api("sendMessage", {
      chat_id: userId,
      text: welcomeText(msg.from?.first_name || "User"),
      parse_mode: "HTML",
      reply_markup: mainKeyboard
    });
    return;
  }

  if (tCheck.includes("deposit") || text === BTN_DEPOSIT) {
    setCategory(userId, "DEPOSIT");
    await api("sendMessage", { chat_id: userId, text: categoryPrompt("DEPOSIT"), parse_mode: "HTML" });
    return;
  }
  if (tCheck.includes("withdraw") || text === BTN_WITHDRAW) {
    setCategory(userId, "WITHDRAW");
    await api("sendMessage", { chat_id: userId, text: categoryPrompt("WITHDRAW"), parse_mode: "HTML" });
    return;
  }
  if (tCheck.includes("login") || tCheck.includes("game id") || text === BTN_LOGIN) {
    setCategory(userId, "LOGIN");
    await api("sendMessage", { chat_id: userId, text: categoryPrompt("LOGIN"), parse_mode: "HTML" });
    return;
  }
  if (tCheck.includes("other") || tCheck.includes("support") || text === BTN_OTHER) {
    setCategory(userId, "OTHER");
    await api("sendMessage", { chat_id: userId, text: categoryPrompt("OTHER"), parse_mode: "HTML" });
    return;
  }
  if (tCheck.includes("how to submit") || text === BTN_HELP) {
    await api("sendMessage", { chat_id: userId, text: helpText(), parse_mode: "HTML" });
    return;
  }
  if (tCheck.includes("ticket status") || text === BTN_STATUS) {
    const ticketId = getLastTicket(userId);
    if (!ticketId) {
      await api("sendMessage", { chat_id: userId, text: `📌 <b>No recent ticket found.</b>\n\nPlease select an issue type and send your message first.`, parse_mode: "HTML" });
      return;
    }
    await api("sendMessage", { chat_id: userId, text: `📌 <b>YOUR LATEST TICKET</b>\n\n🎟 Ticket: <code>${ticketId}</code>\n📂 Category: <b>${escapeHtml(getCategory(userId))}</b>\n📊 Status: <b>${escapeHtml(getLastTicketStatus(userId))}</b>`, parse_mode: "HTML" });
    return;
  }

  if (msg.media_group_id) {
    const groupId = msg.media_group_id;
    if (!albumBucket[groupId]) {
      albumBucket[groupId] = { firstMsg: msg, messages: [], timer: setTimeout(() => sendAlbumGroup(groupId), 1800) };
    }
    albumBucket[groupId].messages.push(msg);
    return;
  }

  const category = getCategory(userId);
  const ticketId = makeTicketId();
  
  const diskCache = loadJson(MSG_CACHE_FILE, {});
  const now = Date.now();
  const lastMsgTime = diskCache[`spam_${userId}`] || 0;
  const isSpam = (now - lastMsgTime) < 4000;
  
  diskCache[`spam_${userId}`] = now;
  saveJson(MSG_CACHE_FILE, diskCache);
  
  setLastTicket(userId, ticketId);
  setLastTicketStatus(userId, "OPEN");

  if (text && !msg.photo && !msg.video && !msg.voice && !msg.document && !msg.sticker) {
    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text: buildCompactTicketMessage(msg, category, ticketId, text),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: getAdminInlineKeyboard(userId)
    });

    if (!isSpam) {
      await api("sendMessage", { chat_id: userId, text: `✅ <b>Support request received</b>\n\nTicket: <code>${ticketId}</code>\nCategory: <b>${escapeHtml(category)}</b>\nStatus: <b>OPEN</b>`, parse_mode: "HTML" });
    }
    return;
  }

  await api("copyMessage", { chat_id: MAIN_GROUP_ID, from_chat_id: userId, message_id: msg.message_id });
  
  await api("sendMessage", {
    chat_id: MAIN_GROUP_ID,
    text: buildCompactTicketMessage(msg, category, ticketId, msg.caption || "Media / File"),
    parse_mode: "HTML",
    reply_markup: getAdminInlineKeyboard(userId)
  });

  if (!isSpam) {
    await api("sendMessage", { chat_id: userId, text: `✅ <b>Support request received</b>\n\nTicket: <code>${ticketId}</code>\nCategory: <b>${escapeHtml(category)}</b>\nStatus: <b>OPEN</b>`, parse_mode: "HTML" });
  }
}

// ==============================
// CALLBACK & GROUP HANDLERS 
// ==============================
async function handleCallbackQuery(cb) {
  const data = cb.data;
  const adminGroupId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;

  if (adminGroupId !== MAIN_GROUP_ID) {
    await api("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }

  const senderId = cb.from.id;
  const admin = await isGroupAdmin(adminGroupId, senderId);
  
  if (!admin) {
    await api("answerCallbackQuery", { callback_query_id: cb.id, text: "⛔ Action Denied: Admins only!", show_alert: true });
    return;
  }

  const parts = data.split("_");
  const action = parts[0];
  const targetUserId = Number(parts[1]);

  if (action === "close") {
    setLastTicketStatus(targetUserId, "CLOSED");
    await api("sendMessage", { chat_id: targetUserId, text: `✅ <b>Your support request is now closed.</b>`, parse_mode: "HTML" });
    await api("answerCallbackQuery", { callback_query_id: cb.id, text: "Ticket Closed!" });
    
    await api("editMessageReplyMarkup", {
      chat_id: adminGroupId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: "🚫 Block User", callback_data: `block_${targetUserId}` }, { text: "✅ Unblock", callback_data: `unblock_${targetUserId}` }]] }
    });
  } else if (action === "block") {
    if (blockUser(targetUserId)) {
      await api("sendMessage", { chat_id: targetUserId, text: `🚫 <b>ACCOUNT SUSPENDED</b>\n\nYou have been blocked by the admin.`, parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
      await api("answerCallbackQuery", { callback_query_id: cb.id, text: "User Blocked successfully!", show_alert: true });
    }
  } else if (action === "unblock") {
    if (unblockUser(targetUserId)) {
      setLastTicketStatus(targetUserId, "OPEN");
      await api("sendMessage", { chat_id: targetUserId, text: `✅ <b>ACCOUNT RESTORED</b>\n\nYou have been unblocked by the admin. You can send messages now.`, parse_mode: "HTML", reply_markup: mainKeyboard });
      await api("answerCallbackQuery", { callback_query_id: cb.id, text: "User Unblocked successfully!", show_alert: true });
    }
  }
}

async function handleGroupMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const senderId = msg.from?.id;

  if (text === "/id") {
    await api("sendMessage", { chat_id: chatId, text: `🆔 <b>Group ID:</b> <code>${chatId}</code>`, parse_mode: "HTML" });
    return;
  }

  if (chatId !== MAIN_GROUP_ID || !msg.reply_to_message) return;

  const admin = await isGroupAdmin(chatId, senderId);
  if (!admin) return;

  const meta = extractMetaFromText(msg.reply_to_message.text || msg.reply_to_message.caption || "");
  if (!meta.userId) return;

  if (isBlocked(meta.userId)) {
    await api("sendMessage", { chat_id: chatId, text: `⚠️ <b>Action Failed:</b> This user is currently blocked. Click 'Unblock' on their ticket first to reply.`, parse_mode: "HTML" });
    return;
  }

  if (!meta.userMsgId) return;

  const replyKey = `reply_${chatId}_${msg.message_id}`;
  if (runtimeProcessedMessages.has(replyKey)) return;
  runtimeProcessedMessages.add(replyKey);

  await api("copyMessage", { chat_id: meta.userId, from_chat_id: chatId, message_id: msg.message_id, reply_to_message_id: meta.userMsgId });
  await api("setMessageReaction", { chat_id: chatId, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: "⚡" }] });
}

// ==============================
// 🔥 ULTRA-STRICT POLLING SYSTEM
// ==============================
async function startup() {
  await api("deleteWebhook", { drop_pending_updates: true });
  blockedUsers = loadBlockedUsers();
}

async function poll() {
  if (isPolling) return;
  isPolling = true;

  let offset = botState.lastUpdateId ? botState.lastUpdateId + 1 : 0;

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      if (!data.ok || !data.result || data.result.length === 0) {
        await sleep(2000);
        continue;
      }

      // 🔥 FIX: Instantly tell Telegram we received the batch BEFORE processing messages.
      // This guarantees Telegram won't send the same message 3 times!
      const highestUpdateId = data.result[data.result.length - 1].update_id;
      offset = highestUpdateId + 1;
      
      botState.lastUpdateId = highestUpdateId;
      saveState();

      for (const update of data.result) {
        if (update.callback_query) {
          await handleCallbackQuery(update.callback_query);
          continue;
        }

        const msg = update.message;
        if (!msg || msg.from?.is_bot) continue;
        
        // 🔥 File Level Strict Lock
        if (alreadyProcessedMessage(msg)) continue; 

        if (msg.chat.type === "private") {
          await handlePrivateMessage(msg);
        } else if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
          await handleGroupMessage(msg);
        }
      }
    } catch (e) {
      console.error("Poll Error:", e.message);
      await sleep(3000);
    }
  }
}

(async () => {
  await startup();
  await poll();
})();
