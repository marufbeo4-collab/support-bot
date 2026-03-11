const TOKEN = "8620612566:AAEUrh1-gK4oW1KiH1QHhxRuL_RMGQcmTUY";
const API = `https://api.telegram.org/bot${TOKEN}`;
const MAIN_GROUP_ID = -5184100145;

const http = require("http");
const fs = require("fs");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("GOWIN Support Bot is running...");
});
server.listen(process.env.PORT || 8080);

console.log("🚀 GOWIN Support Bot Started");

// ==========================
// FILES
// ==========================
const BLOCK_FILE = "blocked.json";
const STATE_FILE = "state.json";
const PROFILE_FILE = "profiles.json";
const TICKET_FILE = "tickets.json";

let blockedUsers = new Set();
let botState = { lastUpdateId: 0 };
let userProfile = {};
let tickets = {};
let albumBucket = {};
let recentGuard = new Map();
let blockedNoticeCooldown = new Map();

// ==========================
// LOAD / SAVE
// ==========================
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

function loadData() {
  blockedUsers = new Set(loadJson(BLOCK_FILE, []));
  botState = loadJson(STATE_FILE, { lastUpdateId: 0 });
  userProfile = loadJson(PROFILE_FILE, {});
  tickets = loadJson(TICKET_FILE, {});
}

function saveBlocked() {
  saveJson(BLOCK_FILE, [...blockedUsers]);
}

function saveState() {
  saveJson(STATE_FILE, botState);
}

function saveProfiles() {
  saveJson(PROFILE_FILE, userProfile);
}

function saveTickets() {
  saveJson(TICKET_FILE, tickets);
}

loadData();

// ==========================
// API / HELPERS
// ==========================
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

function shortText(text, max = 120) {
  if (!text) return "Media/File";
  return text.length > max ? text.slice(0, max) + "..." : text;
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

function setCategory(userId, category) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].category = category;
  saveProfiles();
}

function getCategory(userId) {
  return userProfile[userId]?.category || "Not Selected";
}

function setLastTicket(userId, ticketId) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].lastTicketId = ticketId;
  saveProfiles();
}

function getLastTicket(userId) {
  return userProfile[userId]?.lastTicketId || null;
}

function createTicket(userId, category, msgId) {
  const ticketId = makeTicketId();
  tickets[ticketId] = {
    userId,
    category,
    status: "OPEN",
    createdAt: Date.now(),
    lastMsgId: msgId
  };
  setLastTicket(userId, ticketId);
  saveTickets();
  return ticketId;
}

function setTicketStatus(ticketId, status) {
  if (!ticketId || !tickets[ticketId]) return false;
  tickets[ticketId].status = status;
  saveTickets();
  return true;
}

function getLastTicketInfo(userId) {
  const ticketId = getLastTicket(userId);
  if (!ticketId || !tickets[ticketId]) return null;
  return { ticketId, ...tickets[ticketId] };
}

function messageFingerprint(msg) {
  const body = msg.text || msg.caption || "";
  return `${msg.chat.id}:${msg.message_id}:${msg.media_group_id || ""}:${body}`;
}

function isDuplicate(msg) {
  const key = messageFingerprint(msg);
  const now = Date.now();
  const prev = recentGuard.get(key);

  if (prev && now - prev < 15000) return true;

  recentGuard.set(key, now);

  if (recentGuard.size > 500) {
    const cutoff = now - 30000;
    for (const [k, v] of recentGuard.entries()) {
      if (v < cutoff) recentGuard.delete(k);
    }
  }

  return false;
}

async function sendTyping(chatId) {
  await api("sendChatAction", { chat_id: chatId, action: "typing" });
}

async function isGroupAdmin(chatId, userId) {
  const res = await api("getChatMember", {
    chat_id: chatId,
    user_id: userId
  });

  if (!res || !res.ok) return false;

  const status = res.result?.status;
  return status === "creator" || status === "administrator";
}

function quotedBlock(text) {
  return `<blockquote>${escapeHtml(shortText(text, 300))}</blockquote>`;
}

// ==========================
// MENU
// ==========================
const BTN_DEPOSIT = "Deposit Issue";
const BTN_WITHDRAW = "Withdraw Issue";
const BTN_LOGIN = "Login / Game ID Issue";
const BTN_OTHER = "Other Support";
const BTN_STATUS = "My Ticket Status";
const BTN_HELP = "How To Submit";

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
  return (
    `🎯 <b>Welcome to GOWIN Official Support</b>\n\n` +
    `Hello <b>${escapeHtml(name)}</b>,\n` +
    `Please choose your issue type from the menu below.\n\n` +
    `Our team will review and respond as soon as possible.`
  );
}

function helpText() {
  return (
    `📘 <b>How To Submit Properly</b>\n\n` +
    `Please send:\n` +
    `• Game ID\n` +
    `• Short issue description\n` +
    `• TRX ID if payment related\n` +
    `• Screenshot / proof if available\n\n` +
    `✅ Clear details help us solve faster.`
  );
}

function categoryPrompt(category) {
  const map = {
    "Deposit": (
      `💳 <b>Deposit Support</b>\n\n` +
      `Please send:\n` +
      `1. Game ID\n` +
      `2. TRX ID\n` +
      `3. Deposit amount\n` +
      `4. Payment screenshot`
    ),
    "Withdraw": (
      `💸 <b>Withdraw Support</b>\n\n` +
      `Please send:\n` +
      `1. Game ID\n` +
      `2. Amount\n` +
      `3. Method\n` +
      `4. Screenshot if needed`
    ),
    "Login / Game ID": (
      `🆔 <b>Login / Game ID Support</b>\n\n` +
      `Please send:\n` +
      `1. Game ID\n` +
      `2. Problem description\n` +
      `3. Screenshot if available`
    ),
    "Other": (
      `📝 <b>General Support</b>\n\n` +
      `Please describe the issue clearly.\n` +
      `You may also send screenshot, video, or file.`
    )
  };

  return map[category] || helpText();
}

// ==========================
// MESSAGE FORMATTERS
// ==========================
function buildMarkerMessage({ msg, ticketId, category, contentType = "Text", preview = "" }) {
  const userId = msg.chat.id;
  const magicId = makeMagicId(userId, msg.message_id);
  const userLink = getUserLink(msg);

  return (
    `🔔 <b>GOWIN New Ticket</b>\n\n` +
    `🎟️ <b>Ticket:</b> <code>${ticketId}</code>\n` +
    `👤 <b>User:</b> ${userLink}\n` +
    `📂 <b>Category:</b> ${escapeHtml(category)}\n` +
    `📎 <b>Type:</b> ${escapeHtml(contentType)}\n\n` +
    `${preview ? `<b>Preview:</b>\n${preview}\n\n` : ""}` +
    `🆔 <code>${magicId}</code>`
  );
}

function extractMetaFromMarker(text = "") {
  const idMatch = text.match(/#ID(\d+)_(\d+)/);
  const ticketMatch = text.match(/Ticket:<\/b>\s*<code>(GW\d+)<\/code>/);

  return {
    userId: idMatch ? Number(idMatch[1]) : null,
    userMsgId: idMatch ? Number(idMatch[2]) : null,
    ticketId: ticketMatch ? ticketMatch[1] : null
  };
}

// ==========================
// ALBUM
// ==========================
async function sendAlbumGroup(groupId) {
  const bucket = albumBucket[groupId];
  if (!bucket || !bucket.messages?.length) return;

  delete albumBucket[groupId];

  const firstMsg = bucket.firstMsg;
  const userId = firstMsg.chat.id;
  const category = getCategory(userId);
  const ticketId = createTicket(userId, category, firstMsg.message_id);

  const msgWithCaption = bucket.messages.find((m) => m.caption);
  const originalCaption = msgWithCaption?.caption || "";

  const media = bucket.messages.map((m, index) => {
    const caption = index === 0 && originalCaption ? originalCaption : undefined;

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

  const preview = originalCaption ? quotedBlock(originalCaption) : quotedBlock("Album / Multiple Media");

  await api("sendMessage", {
    chat_id: MAIN_GROUP_ID,
    text: buildMarkerMessage({
      msg: firstMsg,
      ticketId,
      category,
      contentType: "Album / Media Group",
      preview
    }),
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

// ==========================
// PRIVATE SIDE
// ==========================
async function handlePrivateMessage(msg) {
  const userId = msg.chat.id;
  const text = msg.text || msg.caption || "";

  if (blockedUsers.has(userId)) {
    const last = blockedNoticeCooldown.get(userId) || 0;
    const now = Date.now();

    if (now - last > 300000) {
      blockedNoticeCooldown.set(userId, now);
      await api("sendMessage", {
        chat_id: userId,
        text: `🚫 <b>Your access to GOWIN Support is restricted.</b>`,
        parse_mode: "HTML"
      });
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

  if (text === BTN_DEPOSIT) {
    setCategory(userId, "Deposit");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("Deposit"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_WITHDRAW) {
    setCategory(userId, "Withdraw");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("Withdraw"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_LOGIN) {
    setCategory(userId, "Login / Game ID");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("Login / Game ID"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_OTHER) {
    setCategory(userId, "Other");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryPrompt("Other"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_HELP) {
    await api("sendMessage", {
      chat_id: userId,
      text: helpText(),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_STATUS) {
    const info = getLastTicketInfo(userId);

    if (!info) {
      await api("sendMessage", {
        chat_id: userId,
        text:
          `📌 <b>No recent ticket found.</b>\n\n` +
          `Please choose an issue type and send your message first.`,
        parse_mode: "HTML"
      });
      return;
    }

    await api("sendMessage", {
      chat_id: userId,
      text:
        `📌 <b>Your Latest Ticket</b>\n\n` +
        `Ticket: <code>${info.ticketId}</code>\n` +
        `Category: <b>${escapeHtml(info.category)}</b>\n` +
        `Status: <b>${escapeHtml(info.status)}</b>`,
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
        timer: setTimeout(() => sendAlbumGroup(groupId), 2200)
      };
    }

    albumBucket[groupId].messages.push(msg);
    return;
  }

  const category = getCategory(userId);
  const ticketId = createTicket(userId, category, msg.message_id);

  if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
    const preview = quotedBlock(text);

    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text: buildMarkerMessage({
        msg,
        ticketId,
        category,
        contentType: "Text",
        preview
      }),
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } else {
    await api("copyMessage", {
      chat_id: MAIN_GROUP_ID,
      from_chat_id: userId,
      message_id: msg.message_id
    });

    const mediaText = msg.caption || "Media / File";
    const preview = quotedBlock(mediaText);

    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text: buildMarkerMessage({
        msg,
        ticketId,
        category,
        contentType: "Media / File",
        preview
      }),
      parse_mode: "HTML"
    });
  }

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

// ==========================
// GROUP SIDE
// ==========================
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

  const originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
  const meta = extractMetaFromMarker(originalText);

  if (!meta.userId) return;

  const admin = await isGroupAdmin(chatId, senderId);
  if (!admin) return;

  if (text === "/block") {
    blockedUsers.add(meta.userId);
    saveBlocked();

    if (meta.ticketId) setTicketStatus(meta.ticketId, "BLOCKED");

    await api("sendMessage", {
      chat_id: chatId,
      text:
        `🚫 <b>User blocked successfully</b>\n\n` +
        `User ID: <code>${meta.userId}</code>` +
        (meta.ticketId ? `\nTicket: <code>${meta.ticketId}</code>` : ""),
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: meta.userId,
      text: `🚫 <b>You have been blocked by GOWIN Support.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/unblock") {
    blockedUsers.delete(meta.userId);
    saveBlocked();

    if (meta.ticketId) setTicketStatus(meta.ticketId, "OPEN");

    await api("sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>User unblocked successfully</b>\n\n` +
        `User ID: <code>${meta.userId}</code>` +
        (meta.ticketId ? `\nTicket: <code>${meta.ticketId}</code>` : ""),
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: meta.userId,
      text: `✅ <b>You have been unblocked by GOWIN Support.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/close") {
    if (meta.ticketId) setTicketStatus(meta.ticketId, "CLOSED");

    await api("sendMessage", {
      chat_id: chatId,
      text: meta.ticketId
        ? `✅ Ticket <code>${meta.ticketId}</code> closed.`
        : `✅ Ticket closed.`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: meta.userId,
      text: meta.ticketId
        ? `✅ <b>Your ticket is now closed.</b>\n\nTicket: <code>${meta.ticketId}</code>`
        : `✅ <b>Your support request is now closed.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/pending") {
    if (meta.ticketId) setTicketStatus(meta.ticketId, "PENDING");

    await api("sendMessage", {
      chat_id: chatId,
      text: meta.ticketId
        ? `⏳ Ticket <code>${meta.ticketId}</code> marked pending.`
        : `⏳ Ticket marked pending.`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: meta.userId,
      text: meta.ticketId
        ? `⏳ <b>Your ticket is under review.</b>\n\nTicket: <code>${meta.ticketId}</code>`
        : `⏳ <b>Your request is under review.</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/open") {
    if (meta.ticketId) setTicketStatus(meta.ticketId, "OPEN");

    await api("sendMessage", {
      chat_id: chatId,
      text: meta.ticketId
        ? `🔓 Ticket <code>${meta.ticketId}</code> reopened.`
        : `🔓 Ticket reopened.`,
      parse_mode: "HTML"
    });
    return;
  }

  if (blockedUsers.has(meta.userId)) {
    await api("sendMessage", {
      chat_id: chatId,
      text: `⚠️ This user is blocked. Use /unblock first.`,
      parse_mode: "HTML"
    });
    return;
  }

  if (!meta.userMsgId) return;

  const sent = await api("copyMessage", {
    chat_id: meta.userId,
    from_chat_id: chatId,
    message_id: msg.message_id,
    reply_to_message_id: meta.userMsgId
  });

  if (sent && sent.ok) {
    await api("setMessageReaction", {
      chat_id: chatId,
      message_id: msg.message_id,
      reaction: [{ type: "emoji", emoji: "⚡" }]
    });
  }
}

// ==========================
// STARTUP
// ==========================
async function startup() {
  await api("deleteWebhook", { drop_pending_updates: false });
}

// ==========================
// POLL
// ==========================
async function poll() {
  let offset = (botState.lastUpdateId || 0) + 1;

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      if (!data.ok) {
        await sleep(3000);
        continue;
      }

      for (const update of data.result) {
        botState.lastUpdateId = update.update_id;
        saveState();
        offset = update.update_id + 1;

        const msg = update.message;
        if (!msg) continue;
        if (msg.from?.is_bot) continue;
        if (isDuplicate(msg)) continue;

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
