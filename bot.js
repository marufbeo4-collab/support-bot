const TOKEN = "8620612566:AAEUrh1-gK4oW1KiH1QHhxRuL_RMGQcmTUY";
const API = `https://api.telegram.org/bot${TOKEN}`;

const MAIN_GROUP_ID = -5184100145;

// Put your Telegram user ID(s) here
const ADMIN_IDS = [123456789];

const http = require("http");
const fs = require("fs");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("GOWIN Support Bot is running...");
});
server.listen(process.env.PORT || 8080);

console.log("🚀 GOWIN Support Bot Started");

// =========================
// FILES
// =========================
const BLOCK_FILE = "blocked.json";
const STATE_FILE = "state.json";
const TICKET_FILE = "tickets.json";

let blockedUsers = new Set();
let botState = {
  lastUpdateId: 0
};

let tickets = {}; // ticketId -> { userId, status, category, createdAt, lastMsgId }
let userProfile = {}; // userId -> { category, lastTicketId }
let albumBucket = {};
let recentMessageGuard = new Map(); // anti-duplicate short-term guard

// =========================
// LOAD / SAVE
// =========================
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
    console.error(`Failed to save ${file}:`, e.message);
  }
}

function loadData() {
  const blocked = loadJson(BLOCK_FILE, []);
  blockedUsers = new Set(blocked);

  botState = loadJson(STATE_FILE, { lastUpdateId: 0 });
  tickets = loadJson(TICKET_FILE, {});
}

function saveBlocked() {
  saveJson(BLOCK_FILE, [...blockedUsers]);
}

function saveState() {
  saveJson(STATE_FILE, botState);
}

function saveTickets() {
  saveJson(TICKET_FILE, tickets);
}

loadData();

// =========================
// HELPERS
// =========================
async function api(method, data = {}) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
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

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function getUserLabel(msg) {
  const firstName = msg.from?.first_name || "User";
  const username = msg.from?.username ? ` (@${msg.from.username})` : "";
  return `${firstName}${username}`;
}

function getUserLink(msg) {
  return `<a href="tg://user?id=${msg.chat.id}">${escapeHtml(getUserLabel(msg))}</a>`;
}

function makeMagicId(userId, msgId) {
  return `#ID${userId}_${msgId}`;
}

function makeTicketId() {
  return "GW" + Date.now().toString().slice(-8);
}

function shortText(text, max = 40) {
  if (!text) return "Media/File";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function getReplyContext(msg) {
  if (!msg.reply_to_message) return "";
  const t =
    msg.reply_to_message.text ||
    msg.reply_to_message.caption ||
    "Media/File";
  return `\n↩️ <b>Reply To:</b> <i>${escapeHtml(shortText(t, 35))}</i>`;
}

function setCategory(userId, category) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].category = category;
}

function getCategory(userId) {
  return userProfile[userId]?.category || "Not Selected";
}

function setLastTicket(userId, ticketId) {
  userProfile[userId] = userProfile[userId] || {};
  userProfile[userId].lastTicketId = ticketId;
}

function getLastTicket(userId) {
  return userProfile[userId]?.lastTicketId || null;
}

function messageFingerprint(msg) {
  const text = msg.text || msg.caption || "";
  const mediaGroup = msg.media_group_id || "";
  return `${msg.chat.id}:${msg.message_id}:${text}:${mediaGroup}`;
}

function isDuplicateMessage(msg) {
  const key = messageFingerprint(msg);
  const now = Date.now();
  const prev = recentMessageGuard.get(key);

  if (prev && now - prev < 15000) return true;

  recentMessageGuard.set(key, now);

  // cleanup
  if (recentMessageGuard.size > 500) {
    const entries = [...recentMessageGuard.entries()];
    const cutoff = now - 30000;
    for (const [k, v] of entries) {
      if (v < cutoff) recentMessageGuard.delete(k);
    }
  }

  return false;
}

async function sendTyping(chatId) {
  await api("sendChatAction", { chat_id: chatId, action: "typing" });
}

// =========================
// MENU - FEWER + CLEANER
// =========================
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
    `Choose the correct issue type from the menu below.\n\n` +
    `Our team will review your request and reply as soon as possible.`
  );
}

function guideText() {
  return (
    `📘 <b>How To Submit Properly</b>\n\n` +
    `Please send these details clearly:\n` +
    `• Game ID\n` +
    `• Short problem description\n` +
    `• TRX ID (if payment related)\n` +
    `• Screenshot / proof if available\n\n` +
    `✅ Clear information = faster support`
  );
}

function categoryText(category) {
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
      `Please describe your issue clearly.\n` +
      `You can also send screenshot, video, or file.`
    )
  };

  return map[category] || guideText();
}

// =========================
// TICKET FUNCTIONS
// =========================
function createTicket(userId, category, msgId) {
  const ticketId = makeTicketId();
  tickets[ticketId] = {
    userId,
    status: "OPEN",
    category,
    createdAt: Date.now(),
    lastMsgId: msgId
  };
  setLastTicket(userId, ticketId);
  saveTickets();
  return ticketId;
}

function setTicketStatus(ticketId, status) {
  if (!tickets[ticketId]) return false;
  tickets[ticketId].status = status;
  saveTickets();
  return true;
}

function getTicketStatusByUser(userId) {
  const lastTicket = getLastTicket(userId);
  if (!lastTicket || !tickets[lastTicket]) {
    return null;
  }
  return {
    ticketId: lastTicket,
    ...tickets[lastTicket]
  };
}

// =========================
// ALBUM HANDLER
// =========================
async function sendAlbumGroup(groupId) {
  const bucket = albumBucket[groupId];
  if (!bucket || !bucket.messages?.length) return;

  delete albumBucket[groupId];

  const firstMsg = bucket.firstMsg;
  const userId = firstMsg.chat.id;
  const category = getCategory(userId);
  const ticketId = createTicket(userId, category, firstMsg.message_id);
  const userLink = getUserLink(firstMsg);
  const magicId = makeMagicId(userId, firstMsg.message_id);
  const replyContext = getReplyContext(firstMsg);

  const msgWithCaption = bucket.messages.find((m) => m.caption);
  const originalCaption = msgWithCaption ? msgWithCaption.caption : "";

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

  await api("sendMessage", {
    chat_id: MAIN_GROUP_ID,
    text:
      `🔔 <b>GOWIN New Ticket</b>\n\n` +
      `🎟️ <b>Ticket:</b> <code>${ticketId}</code>\n` +
      `👤 <b>User:</b> ${userLink}\n` +
      `📂 <b>Category:</b> ${escapeHtml(category)}${replyContext}\n` +
      `📎 <b>Type:</b> Album / Media Group\n` +
      `🆔 <code>${magicId}</code>`,
    parse_mode: "HTML"
  });

  await api("sendMessage", {
    chat_id: userId,
    text:
      `✅ <b>Message received</b>\n\n` +
      `Ticket: <code>${ticketId}</code>\n` +
      `Category: <b>${escapeHtml(category)}</b>\n` +
      `Status: <b>OPEN</b>`,
    parse_mode: "HTML"
  });
}

// =========================
// ADMIN PANEL HELP
// =========================
function adminHelpText() {
  return (
    `🛠️ <b>GOWIN Admin Controls</b>\n\n` +
    `Reply to a ticket marker message with:\n` +
    `• <code>/block</code>\n` +
    `• <code>/unblock</code>\n` +
    `• <code>/close</code>\n` +
    `• <code>/pending</code>\n` +
    `• <code>/open</code>\n\n` +
    `Also available:\n` +
    `• <code>/id</code>\n` +
    `• <code>/panel</code>`
  );
}

// =========================
// STARTUP SAFETY
// =========================
async function startup() {
  // If webhook was set before, remove it
  await api("deleteWebhook", { drop_pending_updates: false });
}

async function handlePrivateMessage(msg) {
  const userId = msg.chat.id;
  const text = msg.text || msg.caption || "";

  if (blockedUsers.has(userId)) {
    // silently ignore
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
      text: categoryText("Deposit"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_WITHDRAW) {
    setCategory(userId, "Withdraw");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryText("Withdraw"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_LOGIN) {
    setCategory(userId, "Login / Game ID");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryText("Login / Game ID"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_OTHER) {
    setCategory(userId, "Other");
    await api("sendMessage", {
      chat_id: userId,
      text: categoryText("Other"),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_HELP) {
    await api("sendMessage", {
      chat_id: userId,
      text: guideText(),
      parse_mode: "HTML"
    });
    return;
  }

  if (text === BTN_STATUS) {
    const info = getTicketStatusByUser(userId);

    if (!info) {
      await api("sendMessage", {
        chat_id: userId,
        text:
          `📌 <b>No recent ticket found</b>\n\n` +
          `Please select an issue type and send your message first.`,
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
  const userLink = getUserLink(msg);
  const magicId = makeMagicId(userId, msg.message_id);
  const replyContext = getReplyContext(msg);

  if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text:
        `🔔 <b>GOWIN New Ticket</b>\n\n` +
        `🎟️ <b>Ticket:</b> <code>${ticketId}</code>\n` +
        `👤 <b>User:</b> ${userLink}\n` +
        `📂 <b>Category:</b> ${escapeHtml(category)}${replyContext}\n\n` +
        `📝 <b>Message:</b>\n${escapeHtml(text)}\n\n` +
        `🆔 <code>${magicId}</code>`,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } else {
    await api("copyMessage", {
      chat_id: MAIN_GROUP_ID,
      from_chat_id: userId,
      message_id: msg.message_id
    });

    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text:
        `🔔 <b>GOWIN New Ticket</b>\n\n` +
        `🎟️ <b>Ticket:</b> <code>${ticketId}</code>\n` +
        `👤 <b>User:</b> ${userLink}\n` +
        `📂 <b>Category:</b> ${escapeHtml(category)}${replyContext}\n` +
        `📎 <b>Type:</b> Media / File\n` +
        `🆔 <code>${magicId}</code>`,
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

  if (chatId === MAIN_GROUP_ID && text === "/panel") {
    if (!isAdmin(senderId)) return;
    await api("sendMessage", {
      chat_id: chatId,
      text: adminHelpText(),
      parse_mode: "HTML"
    });
    return;
  }

  if (chatId !== MAIN_GROUP_ID || !msg.reply_to_message) return;

  const repliedText =
    msg.reply_to_message.text ||
    msg.reply_to_message.caption ||
    "";

  const userMatch = repliedText.match(/#ID(\d+)_(\d+)/);
  const ticketMatch = repliedText.match(/Ticket:<\/b> <code>(GW\d+)<\/code>/);

  const targetUserId = userMatch ? Number(userMatch[1]) : null;
  const targetMsgId = userMatch ? Number(userMatch[2]) : null;
  const ticketId = ticketMatch ? ticketMatch[1] : null;

  if (!targetUserId) return;

  if (text === "/block") {
    if (!isAdmin(senderId)) return;
    blockedUsers.add(targetUserId);
    saveBlocked();

    await api("sendMessage", {
      chat_id: chatId,
      text: `🚫 User <code>${targetUserId}</code> blocked.`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/unblock") {
    if (!isAdmin(senderId)) return;
    blockedUsers.delete(targetUserId);
    saveBlocked();

    await api("sendMessage", {
      chat_id: chatId,
      text: `✅ User <code>${targetUserId}</code> unblocked.`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/close") {
    if (!isAdmin(senderId)) return;
    if (ticketId) setTicketStatus(ticketId, "CLOSED");

    await api("sendMessage", {
      chat_id: chatId,
      text: ticketId
        ? `✅ Ticket <code>${ticketId}</code> closed.`
        : `✅ Marked as closed.`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: targetUserId,
      text: ticketId
        ? `✅ <b>Your ticket is now closed</b>\n\nTicket: <code>${ticketId}</code>`
        : `✅ <b>Your support request is now closed</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/pending") {
    if (!isAdmin(senderId)) return;
    if (ticketId) setTicketStatus(ticketId, "PENDING");

    await api("sendMessage", {
      chat_id: chatId,
      text: ticketId
        ? `⏳ Ticket <code>${ticketId}</code> marked pending.`
        : `⏳ Marked as pending.`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: targetUserId,
      text: ticketId
        ? `⏳ <b>Your ticket is under review</b>\n\nTicket: <code>${ticketId}</code>`
        : `⏳ <b>Your support request is under review</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  if (text === "/open") {
    if (!isAdmin(senderId)) return;
    if (ticketId) setTicketStatus(ticketId, "OPEN");

    await api("sendMessage", {
      chat_id: chatId,
      text: ticketId
        ? `🔓 Ticket <code>${ticketId}</code> reopened.`
        : `🔓 Marked as open.`,
      parse_mode: "HTML"
    });
    return;
  }

  if (blockedUsers.has(targetUserId)) {
    await api("sendMessage", {
      chat_id: chatId,
      text: `⚠️ This user is blocked. Unblock first.`,
      parse_mode: "HTML"
    });
    return;
  }

  const sent = await api("copyMessage", {
    chat_id: targetUserId,
    from_chat_id: chatId,
    message_id: msg.message_id,
    reply_to_message_id: targetMsgId
  });

  if (sent && sent.ok) {
    await api("setMessageReaction", {
      chat_id: chatId,
      message_id: msg.message_id,
      reaction: [{ type: "emoji", emoji: "⚡" }]
    });
  }
}

// =========================
// MAIN POLL
// =========================
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
        if (isDuplicateMessage(msg)) continue;

        const isPrivate = msg.chat.type === "private";
        const isGroup =
          msg.chat.type === "group" || msg.chat.type === "supergroup";

        if (isPrivate) {
          await handlePrivateMessage(msg);
        } else if (isGroup) {
          await handleGroupMessage(msg);
        }
      }
    } catch (err) {
      console.error("Poll error:", err.message);
      await sleep(3000);
    }
  }
}

(async () => {
  await startup();
  await poll();
})();
