const TOKEN = "8620612566:AAGa7h3L0PXdR9tugQOproiWIZPY6KVymzg";
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

console.log("🚀 GOWIN Support Bot Started");

// ==============================
// FILES
// ==============================
const BLOCK_FILE = "blocked.json";
const STATE_FILE = "state.json";
const PROFILE_FILE = "profiles.json";

// ==============================
// MEMORY
// ==============================
let blockedUsers = new Set();
let botState = { lastUpdateId: 0 };
let userProfile = {};
const albumBucket = {};
const processedReplyKeys = new Set();

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
    console.error(`Save error (${file}):`, e.message);
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
    console.error("Failed to save blocked users:", e.message);
    return false;
  }
}

function loadData() {
  blockedUsers = loadBlockedUsers();
  botState = loadJson(STATE_FILE, { lastUpdateId: 0 });
  userProfile = loadJson(PROFILE_FILE, {});
}

function saveState() {
  saveJson(STATE_FILE, botState);
}

function saveProfiles() {
  saveJson(PROFILE_FILE, userProfile);
}

loadData();

// ==============================
// BLOCK HELPERS
// ==============================
function blockUser(userId) {
  const id = Number(userId);
  blockedUsers.add(id);
  return persistBlockedUsers();
}

function unblockUser(userId) {
  const id = Number(userId);
  blockedUsers.delete(id);
  return persistBlockedUsers();
}

function isBlocked(userId) {
  return blockedUsers.has(Number(userId));
}

// ==============================
// PROFILE HELPERS
// ==============================
function setCategory(userId, category) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].category = category;
  saveProfiles();
}

function getCategory(userId) {
  return userProfile[userId]?.category || "GENERAL";
}

function setLastTicket(userId, ticketId) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].lastTicketId = ticketId;
  saveProfiles();
}

function getLastTicket(userId) {
  return userProfile[userId]?.lastTicketId || null;
}

function setLastTicketStatus(userId, status) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].lastTicketStatus = status;
  saveProfiles();
}

function getLastTicketStatus(userId) {
  return userProfile[userId]?.lastTicketStatus || "OPEN";
}

// ==============================
// HELPERS
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
    console.error(`API error (${method}):`, e.message);
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getUserName(msg) {
  const firstName = msg.from?.first_name || "User";
  const username = msg.from?.username ? ` (@${msg.from.username})` : "";
  return `${firstName}${username}`;
}

function getUserLink(msg) {
  return `<a href="tg://user?id=${msg.chat.id}">${escapeHtml(getUserName(msg))}</a>`;
}

function makeMagicId(userId, msgId) {
  return `#ID${userId}_${msgId}`;
}

function makeTicketId() {
  return "GW" + Date.now().toString().slice(-8);
}

function isAdminId(userId) {
  return ADMIN_IDS.includes(userId);
}

async function isGroupAdmin(chatId, userId) {
  if (isAdminId(userId)) return true;

  const res = await api("getChatMember", {
    chat_id: chatId,
    user_id: userId
  });

  if (!res || !res.ok) return false;

  const status = res.result?.status;
  return status === "creator" || status === "administrator";
}

function extractMetaFromText(text = "") {
  const idMatch = text.match(/#ID(\d+)_(\d+)/);
  return {
    userId: idMatch ? Number(idMatch[1]) : null,
    userMsgId: idMatch ? Number(idMatch[2]) : null
  };
}

function normalizeText(text = "") {
  return String(text).trim().replace(/\s+/g, " ");
}

async function sendTyping(chatId) {
  await api("sendChatAction", {
    chat_id: chatId,
    action: "typing"
  });
}

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

function isStatusButton(text = "") {
  const t = normalizeText(text).toLowerCase();
  return (
    t === normalizeText(BTN_STATUS).toLowerCase() ||
    t.includes("my ticket status") ||
    t.includes("ticket status")
  );
}

function isHelpButton(text = "") {
  const t = normalizeText(text).toLowerCase();
  return (
    t === normalizeText(BTN_HELP).toLowerCase() ||
    t.includes("how to submit")
  );
}

function welcomeText(name) {
  return (
    `🎯 <b>WELCOME TO GOWIN SUPPORT</b>\n\n` +
    `Hello <b>${escapeHtml(name)}</b>,\n` +
    `Please select your issue type from the menu below.\n\n` +
    `Our support team will respond as soon as possible.`
  );
}

function helpText() {
  return (
    `📘 <b>HOW TO SUBMIT PROPERLY</b>\n\n` +
    `Please send these details:\n` +
    `• Game ID\n` +
    `• Short problem description\n` +
    `• TRX ID if payment related\n` +
    `• Screenshot / proof if available\n\n` +
    `✅ Clear details = faster support`
  );
}

function categoryPrompt(category) {
  const map = {
    DEPOSIT:
      `💳 <b>DEPOSIT SUPPORT</b>\n\n` +
      `Send:\n1. Game ID\n2. TRX ID\n3. Deposit Amount\n4. Payment Screenshot`,

    WITHDRAW:
      `💸 <b>WITHDRAW SUPPORT</b>\n\n` +
      `Send:\n1. Game ID\n2. Amount\n3. Method\n4. Screenshot if needed`,

    LOGIN:
      `🆔 <b>LOGIN / GAME ID SUPPORT</b>\n\n` +
      `Send:\n1. Game ID\n2. Problem Description\n3. Screenshot if available`,

    OTHER:
      `🛠 <b>GENERAL SUPPORT</b>\n\n` +
      `Describe your issue clearly.\nYou can also send screenshot, video, or file.`
  };

  return map[category] || helpText();
}

// ==============================
// GROUP TICKET FORMAT
// ==============================
function buildCompactTicketMessage(msg, category, ticketId, preview) {
  const magicId = makeMagicId(msg.chat.id, msg.message_id);
  const userLink = getUserLink(msg);

  return (
    `🔔 <b>GOWIN SUPPORT TICKET</b>\n` +
    `🎟 <b>${ticketId}</b>\n` +
    `👤 ${userLink}\n` +
    `📂 <b>${escapeHtml(category)}</b>\n\n` +
    `💬 <b>Message:</b>\n` +
    `<blockquote>${escapeHtml(preview || "No text")}</blockquote>\n\n` +
    `🆔 <code>${magicId}</code>`
  );
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
  const category = getCategory(userId);
  const ticketId = makeTicketId();

  setLastTicket(userId, ticketId);
  setLastTicketStatus(userId, "OPEN");

  const msgWithCaption = bucket.messages.find((m) => m.caption);
  const originalCaption = msgWithCaption?.caption || "Album / Multiple Media";

  const media = bucket.messages.map((m, index) => {
    const caption = index === 0 && msgWithCaption?.caption ? m.caption : undefined;

    if (m.photo) {
      return {
        type: "photo",
        media: m.photo[m.photo.length - 1].file_id,
        caption
      };
    }

    if (m.video) {
      return {
        type: "video",
        media: m.video.file_id,
        caption
      };
    }

    return null;
  }).filter(Boolean);

  await api("sendMediaGroup", {
    chat_id: MAIN_GROUP_ID,
    media
  });

  await api("sendMessage", {
    chat_id: MAIN_GROUP_ID,
    text: buildCompactTicketMessage(firstMsg, category, ticketId, originalCaption),
    parse_mode: "HTML"
  });

  await api("sendMessage", {
    chat_id: userId,
    text:
      `✅ <b>Support request received</b>\n\n` +
      `Ticket: <code>${ticketId}</code>\n` +
      `Category: <b>${escapeHtml(category)}</b>\n` +
      `Status: <b>OPEN</b>`,
    parse_mode: "HTML"
  });
}

// ==============================
// PRIVATE HANDLER
// ==============================
async function handlePrivateMessage(msg) {
  const userId = msg.chat.id;
  const text = msg.text || msg.caption || "";

  if (isBlocked(userId)) {
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

  if (text === BTN_DEPOSIT) {
    setCategory(userId, "DEPOSIT");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("DEPOSIT"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_WITHDRAW) {
    setCategory(userId, "WITHDRAW");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("WITHDRAW"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_LOGIN) {
    setCategory(userId, "LOGIN");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("LOGIN"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_OTHER) {
    setCategory(userId, "OTHER");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("OTHER"),
      parse_mode: "HTML"
    });
    return;
  }

  if (isHelpButton(text)) {
    await api("sendMessage", {
      chat_id: userId,
      text: helpText(),
      parse_mode: "HTML"
    });
    return;
  }

  if (isStatusButton(text)) {
    const ticketId = getLastTicket(userId);

    if (!ticketId) {
      await api("sendMessage", {
        chat_id: userId,
        text:
          `📌 <b>No recent ticket found.</b>\n\n` +
          `Please select an issue type and send your message first.`,
        parse_mode: "HTML"
      });
      return;
    }

    await api("sendMessage", {
      chat_id: userId,
      text:
        `📌 <b>YOUR LATEST TICKET</b>\n\n` +
        `🎟 Ticket: <code>${ticketId}</code>\n` +
        `📂 Category: <b>${escapeHtml(getCategory(userId))}</b>\n` +
        `📊 Status: <b>${escapeHtml(getLastTicketStatus(userId))}</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (msg.media_group_id) {
    const groupId = msg.media_group_id;

    if (!albumBucket[groupId]) {
      albumBucket[groupId] = {
        firstMsg: msg,
        messages: [],
        timer: setTimeout(() => sendAlbumGroup(groupId), 1800)
      };
    }

    albumBucket[groupId].messages.push(msg);
    return;
  }

  const category = getCategory(userId);
  const ticketId = makeTicketId();

  setLastTicket(userId, ticketId);
  setLastTicketStatus(userId, "OPEN");

  if (text && !msg.photo && !msg.video && !msg.voice && !msg.document && !msg.sticker) {
    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text: buildCompactTicketMessage(msg, category, ticketId, text),
      parse_mode: "HTML",
      disable_web_page_preview: true
    });

    await api("sendMessage", {
      chat_id: userId,
      text:
        `✅ <b>Support request received</b>\n\n` +
        `Ticket: <code>${ticketId}</code>\n` +
        `Category: <b>${escapeHtml(category)}</b>\n` +
        `Status: <b>OPEN</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  await api("copyMessage", {
    chat_id: MAIN_GROUP_ID,
    from_chat_id: userId,
    message_id: msg.message_id
  });

  await api("sendMessage", {
    chat_id: MAIN_GROUP_ID,
    text: buildCompactTicketMessage(
      msg,
      category,
      ticketId,
      msg.caption || "Media / File"
    ),
    parse_mode: "HTML"
  });

  await api("sendMessage", {
    chat_id: userId,
    text:
      `✅ <b>Support request received</b>\n\n` +
      `Ticket: <code>${ticketId}</code>\n` +
      `Category: <b>${escapeHtml(category)}</b>\n` +
      `Status: <b>OPEN</b>`,
    parse_mode: "HTML"
  });
}

// ==============================
// GROUP HANDLER
// ==============================
async function handleGroupMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const senderId = msg.from?.id;

  if (text === "/id") {
    await api("sendMessage", {
      chat_id: chatId,
      text: `🆔 <b>Group ID:</b> <code>${chatId}</code>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (chatId !== MAIN_GROUP_ID || !msg.reply_to_message) return;

  const admin = await isGroupAdmin(chatId, senderId);
  if (!admin) return;

  const meta = extractMetaFromText(
    msg.reply_to_message.text || msg.reply_to_message.caption || ""
  );

  if (!meta.userId) return;

  if (text === "/block") {
    const ok = blockUser(meta.userId);

    await api("sendMessage", {
      chat_id: chatId,
      text: ok
        ? `🚫 <b>User blocked successfully</b>\nUser ID: <code>${meta.userId}</code>`
        : `❌ <b>Block failed</b>`,
      parse_mode: "HTML"
    });

    if (ok) {
      await api("sendMessage", {
        chat_id: meta.userId,
        text: `🚫 <b>You have been blocked by GOWIN Support.</b>`,
        parse_mode: "HTML"
      });
    }
    return;
  }

  if (text === "/unblock") {
    const ok = unblockUser(meta.userId);

    await api("sendMessage", {
      chat_id: chatId,
      text: ok
        ? `✅ <b>User unblocked successfully</b>\nUser ID: <code>${meta.userId}</code>`
        : `❌ <b>Unblock failed</b>`,
      parse_mode: "HTML"
    });

    if (ok) {
      setLastTicketStatus(meta.userId, "OPEN");
      await api("sendMessage", {
        chat_id: meta.userId,
        text: `✅ <b>You have been unblocked by GOWIN Support.</b>\n\nYou can send messages now.`,
        parse_mode: "HTML"
      });
    }
    return;
  }

  if (text === "/close") {
    setLastTicketStatus(meta.userId, "CLOSED");

    await api("sendMessage", {
      chat_id: chatId,
      text: `✅ <b>Ticket closed.</b>`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: meta.userId,
      text: `✅ <b>Your support request is now closed.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/pending") {
    setLastTicketStatus(meta.userId, "PENDING");

    await api("sendMessage", {
      chat_id: chatId,
      text: `⏳ <b>Ticket marked as pending.</b>`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: meta.userId,
      text: `⏳ <b>Your support request is under review.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/open") {
    setLastTicketStatus(meta.userId, "OPEN");

    await api("sendMessage", {
      chat_id: chatId,
      text: `🔓 <b>Ticket reopened.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (isBlocked(meta.userId)) {
    await api("sendMessage", {
      chat_id: chatId,
      text: `⚠️ This user is blocked. Use /unblock first.`,
      parse_mode: "HTML"
    });
    return;
  }

  if (!meta.userMsgId) return;

  const replyKey = `reply_${chatId}_${msg.message_id}`;
  if (processedReplyKeys.has(replyKey)) return;
  processedReplyKeys.add(replyKey);

  await api("copyMessage", {
    chat_id: meta.userId,
    from_chat_id: chatId,
    message_id: msg.message_id,
    reply_to_message_id: meta.userMsgId
  });

  await api("setMessageReaction", {
    chat_id: chatId,
    message_id: msg.message_id,
    reaction: [{ type: "emoji", emoji: "⚡" }]
  });
}

// ==============================
// STARTUP
// ==============================
async function startup() {
  await api("deleteWebhook", { drop_pending_updates: true });
  blockedUsers = loadBlockedUsers();

  // fresh start হলে old duplicate memory clear
  botState.lastUpdateId = 0;
  saveState();
}

// ==============================
// POLL
// ==============================
async function poll() {
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      if (!data.ok) {
        await sleep(3000);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        botState.lastUpdateId = update.update_id;
        saveState();

        const msg = update.message;
        if (!msg) continue;
        if (msg.from?.is_bot) continue;

        if (msg.chat.type === "private") {
          await handlePrivateMessage(msg);
        } else if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
          await handleGroupMessage(msg);
        }
      }
    } catch (e) {
      console.error("Poll error:", e.message);
      await sleep(3000);
    }
  }
}

(async () => {
  await startup();
  await poll();
})();
