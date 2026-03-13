const TOKEN = "YOUR_NEW_BOT_TOKEN_HERE";
const API = `https://api.telegram.org/bot${TOKEN}`;

const MAIN_GROUP_ID = -1003888768369;
const WITHDRAW_GROUP_ID = -1003813028897;

const http = require("http");
const fs = require("fs");
const path = require("path");

// ==============================
// RENDER / HEALTH SERVER
// ==============================
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(
      JSON.stringify({
        status: "ok",
        service: "MARUF BOSS SUPPORT BOT",
        uptime: process.uptime(),
        time: new Date().toISOString(),
      })
    );
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("MARUF BOSS SUPPORT BOT RUNNING");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`🚀 MARUF BOSS Support Bot Started...`);
});

// ==============================
// FILES / MEMORY
// ==============================
const BLOCK_FILE = path.join(__dirname, "blocked.json");

let blockedUsers = new Set();
const albumBucket = Object.create(null);

// user current selected category
const userCategory = new Map(); // chatId => "deposit" | "withdraw" | "gameid" | "others"

// batching system
const userBatch = new Map(); // chatId => { items: [], timer, targetGroupId, firstMsgId, firstAt, userLink }

// anti spam
const duplicateTracker = new Map(); // chatId => { text, count, time }
const lastUserReplyNotice = new Map(); // chatId => timestamp

// ==============================
// LOAD BLOCK LIST
// ==============================
try {
  if (fs.existsSync(BLOCK_FILE)) {
    const data = fs.readFileSync(BLOCK_FILE, "utf8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) blockedUsers = new Set(parsed);
    console.log(`🔒 Loaded ${blockedUsers.size} blocked users.`);
  }
} catch (err) {
  console.error("⚠️ Error loading blocked list:", err.message);
}

function saveBlockList() {
  try {
    fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers], null, 2), "utf8");
  } catch (err) {
    console.error("⚠️ Error saving blocked list:", err.message);
  }
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

    const json = await res.json().catch(() => null);

    if (!res.ok || !json || json.ok === false) {
      console.error(`⚠️ Telegram API Error [${method}]`, json || res.statusText);
    }

    return json;
  } catch (e) {
    console.error(`⚠️ API Error (${method}):`, e.message);
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const userId = msg.from?.id || msg.chat?.id;
  const fullName = escapeHtml(getUserName(msg));
  return `<a href="tg://user?id=${userId}">${fullName}</a>`;
}

function makeMagicId(chatId, msgId) {
  return `#ID${chatId}_${msgId}`;
}

function shortText(text, max = 70) {
  if (!text) return "Media";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function getReplyContext(msg) {
  if (!msg.reply_to_message) return "";
  const rText =
    msg.reply_to_message.text ||
    msg.reply_to_message.caption ||
    "🖼️ Media";
  return `\n↩️ <b>Reply:</b> <i>${escapeHtml(shortText(rText, 40))}</i>`;
}

function now() {
  return Date.now();
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isLowValueGreeting(text = "") {
  const t = normalizeText(text);

  const uselessPhrases = [
    "hi",
    "hello",
    "helo",
    "hii",
    "hlw",
    "hey",
    "assalamu alaikum",
    "as-salamu alaikum",
    "salam",
    "slm",
    "vai",
    "vhai",
    "bhai",
    "oi vai",
    "oi bhai",
    "vai achen",
    "bhai achen",
    "bhai",
    "bro",
    "bro achen",
    "achen",
    "koi",
    "kew achen",
    "keu achen",
    "admin achen",
    "how are you",
    "kemon achen",
    "kmn achen",
    "kmn aso",
    "kemon aso",
    "reply den",
    "reply dao",
    "seen koren",
    "ektu dekhen",
  ];

  return uselessPhrases.includes(t);
}

function shouldSuppressDuplicate(chatId, text = "") {
  const t = normalizeText(text);
  if (!t) return false;

  const item = duplicateTracker.get(chatId);
  const ts = now();

  if (!item) {
    duplicateTracker.set(chatId, { text: t, count: 1, time: ts });
    return false;
  }

  if (item.text === t && ts - item.time < 15000) {
    item.count += 1;
    item.time = ts;
    duplicateTracker.set(chatId, item);
    return true;
  }

  duplicateTracker.set(chatId, { text: t, count: 1, time: ts });
  return false;
}

function getTargetGroupId(chatId) {
  return userCategory.get(chatId) === "withdraw"
    ? WITHDRAW_GROUP_ID
    : MAIN_GROUP_ID;
}

function getCategoryLabel(chatId) {
  const cat = userCategory.get(chatId);
  if (cat === "withdraw") return "Withdraw";
  if (cat === "deposit") return "Deposit";
  if (cat === "gameid") return "Game ID";
  if (cat === "others") return "Other Issues";
  return "Unselected";
}

function describeMessage(msg) {
  const text = (msg.text || msg.caption || "").trim();

  if (text && !msg.photo && !msg.video && !msg.voice && !msg.document && !msg.sticker) {
    return `📝 ${escapeHtml(shortText(text, 120))}`;
  }

  if (msg.photo) {
    return text
      ? `🖼️ Photo — ${escapeHtml(shortText(text, 90))}`
      : `🖼️ Photo`;
  }

  if (msg.video) {
    return text
      ? `🎥 Video — ${escapeHtml(shortText(text, 90))}`
      : `🎥 Video`;
  }

  if (msg.voice) return `🎤 Voice`;
  if (msg.document) return `📄 Document`;
  if (msg.sticker) return `🌟 Sticker`;
  if (msg.animation) return `🎞️ Animation`;

  return `📎 Media / File`;
}

async function maybeUserAck(chatId) {
  const last = lastUserReplyNotice.get(chatId) || 0;
  if (now() - last < 20000) return;

  lastUserReplyNotice.set(chatId, now());

  await api("sendMessage", {
    chat_id: chatId,
    text:
      `✅ <b>GOWIN Support Received Your Message</b>\n\n` +
      `আমাদের টিম আপনার message পেয়েছে। একটু অপেক্ষা করুন।`,
    parse_mode: "HTML",
  });
}

// ==============================
// MENU BUTTONS
// ==============================
const CMD_DEPOSIT = "💳 Deposit Problem";
const CMD_WITHDRAW = "💰 Withdraw Problem";
const CMD_GAMEID = "🆔 Game ID Problem";
const CMD_OTHERS = "📩 Other Issues";

const mainKeyboard = {
  keyboard: [
    [{ text: CMD_DEPOSIT }, { text: CMD_WITHDRAW }],
    [{ text: CMD_GAMEID }, { text: CMD_OTHERS }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

// ==============================
// PRESET USER MESSAGES
// ==============================
const TEXTS = {
  welcome: (name) =>
    `🎯 <b>Welcome to GOWIN Support</b>\n\n` +
    `প্রিয় <b>${escapeHtml(name)}</b>,\n` +
    `আপনার সমস্যার ধরন নিচের বাটন থেকে নির্বাচন করুন।\n\n` +
    `📌 আমাদের টিম যত দ্রুত সম্ভব আপনাকে সহায়তা করবে।`,

  deposit:
    `💳 <b>GOWIN Deposit Support</b>\n\n` +
    `নিচের তথ্যগুলো একসাথে পাঠান:\n` +
    `1. <b>Game ID</b>\n` +
    `2. <b>TRX ID</b>\n` +
    `3. <b>Payment Screenshot</b>\n\n` +
    `✅ সব তথ্য সঠিক দিলে দ্রুত সমাধান হবে।`,

  withdraw:
    `💰 <b>GOWIN Withdraw Support</b>\n\n` +
    `নিচের তথ্যগুলো পাঠান:\n` +
    `1. <b>Game ID</b>\n` +
    `2. <b>Amount</b>\n` +
    `3. <b>Method</b> (Bkash / Nagad)\n` +
    `4. প্রয়োজনে <b>Screenshot</b>\n\n` +
    `✅ সঠিক তথ্য দিন, দ্রুত চেক করা হবে।`,

  gameid:
    `🆔 <b>GOWIN Game ID Support</b>\n\n` +
    `আপনার <b>সঠিক Game ID</b> এবং\n` +
    `সমস্যার <b>স্ক্রিনশট</b> পাঠান।`,

  others:
    `📩 <b>GOWIN General Support</b>\n\n` +
    `আপনার সমস্যাটি বিস্তারিত লিখে পাঠান।\n` +
    `প্রয়োজনে screenshot / video / document ও পাঠাতে পারেন।`,

  blockedUser:
    `🚫 <b>Access Restricted</b>\n\n` +
    `আপনাকে বর্তমানে GOWIN Support থেকে block করা হয়েছে।`,

  adminBlocked:
    `🚫 <b>GOWIN Notice</b>\n\nআপনাকে admin block করেছেন।`,

  adminUnblocked:
    `✅ <b>GOWIN Notice</b>\n\nআপনাকে admin unblock করেছেন।`,
};

// ==============================
// BATCH SYSTEM
// ==============================
function addToBatch(msg) {
  const chatId = msg.chat.id;
  const targetGroupId = getTargetGroupId(chatId);

  if (!userBatch.has(chatId)) {
    userBatch.set(chatId, {
      items: [],
      timer: null,
      targetGroupId,
      firstMsgId: msg.message_id,
      firstAt: new Date(),
      userLink: getUserLink(msg),
      firstMsg: msg,
    });
  }

  const batch = userBatch.get(chatId);
  batch.targetGroupId = targetGroupId;
  batch.items.push({
    type: "summary",
    text: describeMessage(msg),
  });

  clearTimeout(batch.timer);
  batch.timer = setTimeout(() => flushUserBatch(chatId), 8000);
}

async function flushUserBatch(chatId) {
  const batch = userBatch.get(chatId);
  if (!batch || !batch.items.length) return;

  userBatch.delete(chatId);

  const category = getCategoryLabel(chatId);
  const targetGroupId = batch.targetGroupId;
  const magicId = makeMagicId(chatId, batch.firstMsgId);
  const replyContext = getReplyContext(batch.firstMsg);

  const listText = batch.items
    .map((item, i) => `${i + 1}. ${item.text}`)
    .join("\n");

  await api("sendMessage", {
    chat_id: targetGroupId,
    text:
      `🔔 <b>GOWIN Support Request</b>\n\n` +
      `👤 <b>User:</b> ${batch.userLink}${replyContext}\n` +
      `📂 <b>Category:</b> ${escapeHtml(category)}\n` +
      `📨 <b>Total Messages:</b> ${batch.items.length}\n\n` +
      `${listText}\n\n` +
      `🆔 <code>${magicId}</code>`,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  await maybeUserAck(chatId);
}

// ==============================
// SEND ALBUM GROUP
// ==============================
async function sendAlbumGroup(groupId) {
  const bucket = albumBucket[groupId];
  if (!bucket || !bucket.messages?.length) return;

  delete albumBucket[groupId];

  const messages = bucket.messages;
  const firstMsg = bucket.firstMsg;
  const chatId = firstMsg.chat.id;
  const userLink = getUserLink(firstMsg);
  const magicId = makeMagicId(chatId, firstMsg.message_id);
  const replyContext = getReplyContext(firstMsg);
  const targetGroupId = getTargetGroupId(chatId);
  const category = getCategoryLabel(chatId);

  const msgWithCaption = messages.find((m) => m.caption);
  const originalCaption = msgWithCaption ? msgWithCaption.caption : "";

  const media = messages
    .map((msg, index) => {
      const caption = index === 0 ? originalCaption : undefined;

      if (msg.photo) {
        return {
          type: "photo",
          media: msg.photo[msg.photo.length - 1].file_id,
          caption,
          parse_mode: caption ? "HTML" : undefined,
        };
      }

      if (msg.video) {
        return {
          type: "video",
          media: msg.video.file_id,
          caption,
          parse_mode: caption ? "HTML" : undefined,
        };
      }

      return null;
    })
    .filter(Boolean);

  if (media.length > 0) {
    await api("sendMediaGroup", {
      chat_id: targetGroupId,
      media,
    });

    await api("sendMessage", {
      chat_id: targetGroupId,
      text:
        `🔔 <b>GOWIN Support Request</b>\n\n` +
        `👤 <b>User:</b> ${userLink}${replyContext}\n` +
        `📂 <b>Category:</b> ${escapeHtml(category)}\n` +
        `🖼️ <b>Sent:</b> Album / Multiple Media (${media.length})\n` +
        `🆔 <code>${magicId}</code>`,
      parse_mode: "HTML",
    });
  }

  await maybeUserAck(chatId);
}

// ==============================
// MAIN POLL LOOP
// ==============================
async function poll() {
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      if (!data.ok) {
        console.error("⚠️ getUpdates failed:", data);
        await sleep(4000);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;

        const msg =
          update.message ||
          update.edited_message ||
          update.channel_post ||
          update.edited_channel_post;

        if (!msg) continue;
        if (msg.from?.is_bot) continue;

        const chatId = msg.chat.id;
        const text = (msg.text || msg.caption || "").trim();
        const isPrivate = msg.chat.type === "private";
        const isGroup =
          msg.chat.type === "group" || msg.chat.type === "supergroup";

        // ==============================
        // BLOCK CHECK
        // ==============================
        if (isPrivate && blockedUsers.has(chatId)) {
          await api("sendMessage", {
            chat_id: chatId,
            text: TEXTS.blockedUser,
            parse_mode: "HTML",
          });
          continue;
        }

        // ==============================
        // GROUP SIDE
        // ==============================
        if (isGroup) {
          if (text === "/id") {
            await api("sendMessage", {
              chat_id: chatId,
              text: `🆔 <b>Group ID:</b> <code>${chatId}</code>`,
              parse_mode: "HTML",
            });
            continue;
          }

          // admin reply / block / unblock from both support groups
          if (
            (chatId === MAIN_GROUP_ID || chatId === WITHDRAW_GROUP_ID) &&
            msg.reply_to_message
          ) {
            const repliedText =
              msg.reply_to_message.text || msg.reply_to_message.caption || "";

            const match = repliedText.match(/#ID(-?\d+)_(\d+)/);

            if (match) {
              const targetUserId = Number(match[1]);
              const targetUserMsgId = Number(match[2]);

              if (text === "/block") {
                blockedUsers.add(targetUserId);
                saveBlockList();

                await api("sendMessage", {
                  chat_id: chatId,
                  text:
                    `🚫 <b>Blocked Successfully</b>\n\n` +
                    `User ID: <code>${targetUserId}</code>`,
                  parse_mode: "HTML",
                });

                await api("sendMessage", {
                  chat_id: targetUserId,
                  text: TEXTS.adminBlocked,
                  parse_mode: "HTML",
                });
                continue;
              }

              if (text === "/unblock") {
                blockedUsers.delete(targetUserId);
                saveBlockList();

                await api("sendMessage", {
                  chat_id: chatId,
                  text:
                    `✅ <b>Unblocked Successfully</b>\n\n` +
                    `User ID: <code>${targetUserId}</code>`,
                  parse_mode: "HTML",
                });

                await api("sendMessage", {
                  chat_id: targetUserId,
                  text: TEXTS.adminUnblocked,
                  parse_mode: "HTML",
                });
                continue;
              }

              const sent = await api("copyMessage", {
                chat_id: targetUserId,
                from_chat_id: chatId,
                message_id: msg.message_id,
                reply_to_message_id: targetUserMsgId,
              });

              if (sent && sent.ok) {
                await api("setMessageReaction", {
                  chat_id: chatId,
                  message_id: msg.message_id,
                  reaction: [{ type: "emoji", emoji: "⚡" }],
                });
              }

              continue;
            }
          }

          continue;
        }

        // ==============================
        // USER SIDE
        // ==============================
        if (isPrivate) {
          const firstName = msg.from?.first_name || "User";

          if (text === "/start") {
            userCategory.delete(chatId);

            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.welcome(firstName),
              parse_mode: "HTML",
              reply_markup: mainKeyboard,
            });
            continue;
          }

          // useless greeting ignore
          if (text && isLowValueGreeting(text)) {
            await api("sendMessage", {
              chat_id: chatId,
              text:
                `📩 <b>GOWIN Support</b>\n\n` +
                `দয়া করে শুধু hello/vai টাইপ message না পাঠিয়ে আপনার সমস্যাটি বিস্তারিত লিখুন।`,
              parse_mode: "HTML",
              reply_markup: mainKeyboard,
            });
            continue;
          }

          // duplicate spam ignore
          if (text && shouldSuppressDuplicate(chatId, text)) {
            continue;
          }

          if (text === CMD_DEPOSIT) {
            userCategory.set(chatId, "deposit");

            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.deposit,
              parse_mode: "HTML",
            });
            continue;
          }

          if (text === CMD_WITHDRAW) {
            userCategory.set(chatId, "withdraw");

            await api("sendMessage", {
              chat_id: chatId,
              text:
                TEXTS.withdraw +
                `\n\n📌 <b>Note:</b> আপনার withdraw message আলাদা team-এ পাঠানো হবে।`,
              parse_mode: "HTML",
            });
            continue;
          }

          if (text === CMD_GAMEID) {
            userCategory.set(chatId, "gameid");

            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.gameid,
              parse_mode: "HTML",
            });
            continue;
          }

          if (text === CMD_OTHERS) {
            userCategory.set(chatId, "others");

            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.others,
              parse_mode: "HTML",
            });
            continue;
          }

          // Album handling
          if (msg.media_group_id) {
            const groupId = msg.media_group_id;

            if (!albumBucket[groupId]) {
              albumBucket[groupId] = {
                firstMsg: msg,
                messages: [],
                timer: setTimeout(() => sendAlbumGroup(groupId), 2500),
              };
            }

            albumBucket[groupId].messages.push(msg);
            continue;
          }

          // Batch normal messages instead of sending too many
          addToBatch(msg);
          continue;
        }
      }
    } catch (err) {
      console.error("🔥 Polling Error:", err.message);
      await sleep(3000);
    }
  }
}

poll();
