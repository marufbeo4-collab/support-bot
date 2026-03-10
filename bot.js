const TOKEN = "8620612566:AAF7RX5-RevFdYDR9TdUbL9axBEe3pKrM4k";
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

// ===============================
// STORAGE
// ===============================
const BLOCK_FILE = "blocked.json";
let blockedUsers = new Set();

const albumBucket = {};
const userState = {}; // category memory
const userLastMessageAt = {}; // anti-spam / cooldown

// ===============================
// CONFIG
// ===============================
const COOLDOWN_MS = 1200;

// ===============================
// MENU BUTTONS - FULLY UPDATED
// ===============================
const BTN_DEPOSIT = "💳 ডিপোজিট সংক্রান্ত সমস্যা";
const BTN_WITHDRAW = "💸 উইথড্র সংক্রান্ত সমস্যা";
const BTN_GAMEID = "🆔 গেম আইডি / লগইন সমস্যা";
const BTN_PAYMENT = "📤 পেমেন্ট প্রুফ / ট্রানজেকশন";
const BTN_ACCOUNT = "🔐 একাউন্ট / সিকিউরিটি সমস্যা";
const BTN_OTHER = "📝 অন্যান্য সমস্যা";
const BTN_STATUS = "📌 আমার আগের মেসেজের অবস্থা";
const BTN_HELP = "ℹ️ কীভাবে তথ্য পাঠাবো";

const mainKeyboard = {
  keyboard: [
    [{ text: BTN_DEPOSIT }, { text: BTN_WITHDRAW }],
    [{ text: BTN_GAMEID }, { text: BTN_PAYMENT }],
    [{ text: BTN_ACCOUNT }, { text: BTN_OTHER }],
    [{ text: BTN_STATUS }, { text: BTN_HELP }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

// ===============================
// LOAD BLOCKED USERS
// ===============================
try {
  if (fs.existsSync(BLOCK_FILE)) {
    const data = fs.readFileSync(BLOCK_FILE, "utf8");
    blockedUsers = new Set(JSON.parse(data));
    console.log(`🔒 Loaded ${blockedUsers.size} blocked users`);
  }
} catch (err) {
  console.error("⚠️ Failed to load blocked users:", err.message);
}

function saveBlockList() {
  try {
    fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers], null, 2));
  } catch (err) {
    console.error("⚠️ Failed to save blocked users:", err.message);
  }
}

// ===============================
// HELPERS
// ===============================
async function api(method, data = {}) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (err) {
    console.error(`⚠️ API Error (${method}):`, err.message);
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

function getDisplayName(msg) {
  const firstName = msg.from?.first_name || "User";
  const username = msg.from?.username ? ` (@${msg.from.username})` : "";
  return `${firstName}${username}`;
}

function getUserLink(msg) {
  const uid = msg.chat.id;
  const label = escapeHtml(getDisplayName(msg));
  return `<a href="tg://user?id=${uid}">${label}</a>`;
}

function getReplyPreview(msg) {
  if (!msg.reply_to_message) return "";
  let t =
    msg.reply_to_message.text ||
    msg.reply_to_message.caption ||
    "Media/File";
  if (t.length > 35) t = t.slice(0, 35) + "...";
  return `\n↩️ <b>Reply Context:</b> <i>${escapeHtml(t)}</i>`;
}

function generateTicket(chatId, msgId) {
  return `GW-${chatId}-${msgId}`;
}

function getMagicId(chatId, msgId) {
  return `#ID${chatId}_${msgId}`;
}

function isRateLimited(chatId) {
  const now = Date.now();
  const last = userLastMessageAt[chatId] || 0;
  if (now - last < COOLDOWN_MS) return true;
  userLastMessageAt[chatId] = now;
  return false;
}

function setCategory(chatId, category) {
  userState[chatId] = {
    ...(userState[chatId] || {}),
    category,
    updatedAt: Date.now()
  };
}

function getCategory(chatId) {
  return userState[chatId]?.category || "Not Selected";
}

async function sendTyping(chatId) {
  await api("sendChatAction", {
    chat_id: chatId,
    action: "typing"
  });
}

function supportGuideText() {
  return (
    `ℹ️ <b>GOWIN Support Guide</b>\n\n` +
    `দ্রুত সমাধানের জন্য একসাথে পাঠান:\n\n` +
    `• <b>Game ID</b>\n` +
    `• <b>সমস্যার সংক্ষিপ্ত বিবরণ</b>\n` +
    `• <b>TRX ID</b> (যদি payment issue হয়)\n` +
    `• <b>Screenshot / Video</b> (যদি থাকে)\n\n` +
    `✅ যত তথ্য পরিষ্কার হবে, সমাধান তত দ্রুত হবে।`
  );
}

function welcomeText(name) {
  return (
    `🎯 <b>Welcome to GOWIN Official Support</b>\n\n` +
    `প্রিয় <b>${escapeHtml(name)}</b>,\n` +
    `আপনার সমস্যার ধরন নিচের মেনু থেকে নির্বাচন করুন।\n\n` +
    `আমাদের সাপোর্ট টিম আপনার তথ্য দেখে দ্রুত সহায়তা করবে।`
  );
}

function categoryPrompt(category) {
  const map = {
    "Deposit": (
      `💳 <b>GOWIN Deposit Support</b>\n\n` +
      `নিচের তথ্যগুলো পাঠান:\n` +
      `1. <b>Game ID</b>\n` +
      `2. <b>TRX ID</b>\n` +
      `3. <b>Payment Screenshot</b>\n` +
      `4. <b>কত টাকা পাঠিয়েছেন</b>\n\n` +
      `✅ সব তথ্য একসাথে দিলে দ্রুত চেক করা হবে।`
    ),
    "Withdraw": (
      `💸 <b>GOWIN Withdraw Support</b>\n\n` +
      `নিচের তথ্যগুলো পাঠান:\n` +
      `1. <b>Game ID</b>\n` +
      `2. <b>Amount</b>\n` +
      `3. <b>Method</b> (Bkash / Nagad / Others)\n` +
      `4. প্রয়োজন হলে <b>Screenshot</b>\n\n` +
      `✅ সঠিক তথ্য দিলে দ্রুত প্রসেস হবে।`
    ),
    "Game ID": (
      `🆔 <b>GOWIN Game ID / Login Support</b>\n\n` +
      `আপনার:\n` +
      `1. <b>Game ID</b>\n` +
      `2. <b>সমস্যার বিবরণ</b>\n` +
      `3. <b>Screenshot</b> (যদি থাকে)\n\n` +
      `পাঠিয়ে দিন।`
    ),
    "Payment Proof": (
      `📤 <b>GOWIN Payment Proof / Transaction Support</b>\n\n` +
      `পাঠান:\n` +
      `1. <b>Game ID</b>\n` +
      `2. <b>TRX ID</b>\n` +
      `3. <b>Payment Proof Screenshot</b>\n` +
      `4. <b>Amount</b>\n\n` +
      `✅ আমরা যাচাই করে জানাবো।`
    ),
    "Account": (
      `🔐 <b>GOWIN Account / Security Support</b>\n\n` +
      `সমস্যার ধরন লিখুন:\n` +
      `• login সমস্যা\n` +
      `• account access সমস্যা\n` +
      `• password / security issue\n\n` +
      `প্রয়োজনে screenshot দিন।`
    ),
    "Other": (
      `📝 <b>GOWIN General Support</b>\n\n` +
      `আপনার সমস্যাটি পরিষ্কারভাবে লিখে পাঠান।\n` +
      `প্রয়োজনে screenshot / video / document দিন।`
    )
  };

  return map[category] || supportGuideText();
}

async function sendMenu(chatId, firstName) {
  await sendTyping(chatId);
  await api("sendMessage", {
    chat_id: chatId,
    text: welcomeText(firstName),
    parse_mode: "HTML",
    reply_markup: mainKeyboard
  });
}

async function sendCategorySelection(chatId, category) {
  setCategory(chatId, category);
  await sendTyping(chatId);
  await api("sendMessage", {
    chat_id: chatId,
    text: categoryPrompt(category),
    parse_mode: "HTML"
  });
}

function isMenuText(text) {
  return [
    BTN_DEPOSIT,
    BTN_WITHDRAW,
    BTN_GAMEID,
    BTN_PAYMENT,
    BTN_ACCOUNT,
    BTN_OTHER,
    BTN_STATUS,
    BTN_HELP
  ].includes(text);
}

// ===============================
// ALBUM HANDLER
// ===============================
async function sendAlbumGroup(groupId) {
  const bucket = albumBucket[groupId];
  if (!bucket || !bucket.messages || bucket.messages.length === 0) return;

  delete albumBucket[groupId];

  const firstMsg = bucket.firstMsg;
  const chatId = firstMsg.chat.id;
  const userLink = getUserLink(firstMsg);
  const replyContext = getReplyPreview(firstMsg);
  const category = escapeHtml(getCategory(chatId));
  const ticket = generateTicket(chatId, firstMsg.message_id);
  const magicId = getMagicId(chatId, firstMsg.message_id);

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

  if (media.length > 0) {
    await api("sendMediaGroup", {
      chat_id: MAIN_GROUP_ID,
      media
    });

    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text:
        `🔔 <b>GOWIN New Support Ticket</b>\n\n` +
        `🎟️ <b>Ticket:</b> <code>${ticket}</code>\n` +
        `👤 <b>User:</b> ${userLink}\n` +
        `🧩 <b>Category:</b> ${category}${replyContext}\n` +
        `📎 <b>Content:</b> Album / Multiple Media\n` +
        `🆔 <code>${magicId}</code>`,
      parse_mode: "HTML"
    });

    await api("sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>GOWIN Support পেয়েছে আপনার মিডিয়া</b>\n\n` +
        `🎟️ Ticket: <code>${ticket}</code>\n` +
        `আমাদের টিম এটি রিভিউ করবে।`,
      parse_mode: "HTML"
    });
  }
}

// ===============================
// MAIN POLL LOOP
// ===============================
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

      for (const u of data.result) {
        offset = u.update_id + 1;

        const msg = u.message;
        if (!msg) continue;
        if (msg.from?.is_bot) continue;

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || "";
        const isPrivate = msg.chat.type === "private";
        const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

        // =========================
        // PRIVATE SIDE
        // =========================
        if (isPrivate) {
          if (blockedUsers.has(chatId)) {
            await api("sendMessage", {
              chat_id: chatId,
              text:
                `🚫 <b>GOWIN Notice</b>\n\n` +
                `আপনাকে বর্তমানে সাপোর্ট সিস্টেম থেকে block করা হয়েছে।`,
              parse_mode: "HTML"
            });
            continue;
          }

          if (isRateLimited(chatId) && !isMenuText(text) && text !== "/start") {
            continue;
          }

          if (text === "/start") {
            await sendMenu(chatId, msg.from?.first_name || "User");
            continue;
          }

          if (text === BTN_DEPOSIT) {
            await sendCategorySelection(chatId, "Deposit");
            continue;
          }

          if (text === BTN_WITHDRAW) {
            await sendCategorySelection(chatId, "Withdraw");
            continue;
          }

          if (text === BTN_GAMEID) {
            await sendCategorySelection(chatId, "Game ID");
            continue;
          }

          if (text === BTN_PAYMENT) {
            await sendCategorySelection(chatId, "Payment Proof");
            continue;
          }

          if (text === BTN_ACCOUNT) {
            await sendCategorySelection(chatId, "Account");
            continue;
          }

          if (text === BTN_OTHER) {
            await sendCategorySelection(chatId, "Other");
            continue;
          }

          if (text === BTN_STATUS) {
            const cat = escapeHtml(getCategory(chatId));
            await api("sendMessage", {
              chat_id: chatId,
              text:
                `📌 <b>GOWIN Support Status</b>\n\n` +
                `আপনার সর্বশেষ নির্বাচিত category:\n` +
                `👉 <b>${cat}</b>\n\n` +
                `যদি নতুন সমস্যা থাকে, নতুন category নির্বাচন করে আবার পাঠান।`,
              parse_mode: "HTML"
            });
            continue;
          }

          if (text === BTN_HELP) {
            await api("sendMessage", {
              chat_id: chatId,
              text: supportGuideText(),
              parse_mode: "HTML"
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
                timer: setTimeout(() => sendAlbumGroup(groupId), 2200)
              };
            }
            albumBucket[groupId].messages.push(msg);
            continue;
          }

          const category = escapeHtml(getCategory(chatId));
          const userLink = getUserLink(msg);
          const ticket = generateTicket(chatId, msg.message_id);
          const magicId = getMagicId(chatId, msg.message_id);
          const replyContext = getReplyPreview(msg);

          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
            await api("sendMessage", {
              chat_id: MAIN_GROUP_ID,
              text:
                `🔔 <b>GOWIN New Support Ticket</b>\n\n` +
                `🎟️ <b>Ticket:</b> <code>${ticket}</code>\n` +
                `👤 <b>User:</b> ${userLink}\n` +
                `🧩 <b>Category:</b> ${category}${replyContext}\n\n` +
                `📝 <b>Message:</b>\n${escapeHtml(text)}\n\n` +
                `🆔 <code>${magicId}</code>`,
              parse_mode: "HTML",
              disable_web_page_preview: true
            });
          } else {
            await api("copyMessage", {
              chat_id: MAIN_GROUP_ID,
              from_chat_id: chatId,
              message_id: msg.message_id
            });

            await api("sendMessage", {
              chat_id: MAIN_GROUP_ID,
              text:
                `🔔 <b>GOWIN New Support Ticket</b>\n\n` +
                `🎟️ <b>Ticket:</b> <code>${ticket}</code>\n` +
                `👤 <b>User:</b> ${userLink}\n` +
                `🧩 <b>Category:</b> ${category}${replyContext}\n` +
                `📎 <b>Content:</b> Media / File\n` +
                `🆔 <code>${magicId}</code>`,
              parse_mode: "HTML"
            });
          }

          await api("sendMessage", {
            chat_id: chatId,
            text:
              `✅ <b>GOWIN Support আপনার মেসেজ পেয়েছে</b>\n\n` +
              `🎟️ Ticket: <code>${ticket}</code>\n` +
              `🧩 Category: <b>${category}</b>\n\n` +
              `আমাদের টিম যত দ্রুত সম্ভব রিপ্লাই দেবে।`,
            parse_mode: "HTML"
          });

          continue;
        }

        // =========================
        // GROUP SIDE
        // =========================
        if (isGroup) {
          if (text === "/id") {
            await api("sendMessage", {
              chat_id: chatId,
              text: `🆔 <b>Group ID:</b> <code>${chatId}</code>`,
              parse_mode: "HTML"
            });
            continue;
          }

          if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
            const originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
            const matchForBlock = originalText.match(/#ID(\d+)_/);

            if (matchForBlock) {
              const targetUserId = parseInt(matchForBlock[1], 10);

              if (text === "/block") {
                blockedUsers.add(targetUserId);
                saveBlockList();

                await api("sendMessage", {
                  chat_id: chatId,
                  text:
                    `🚫 <b>GOWIN Admin Action</b>\n\n` +
                    `User <code>${targetUserId}</code> has been blocked.`,
                  parse_mode: "HTML"
                });

                await api("sendMessage", {
                  chat_id: targetUserId,
                  text:
                    `🚫 <b>GOWIN Notice</b>\n\n` +
                    `আপনাকে admin block করেছেন।`,
                  parse_mode: "HTML"
                });
                continue;
              }

              if (text === "/unblock") {
                blockedUsers.delete(targetUserId);
                saveBlockList();

                await api("sendMessage", {
                  chat_id: chatId,
                  text:
                    `✅ <b>GOWIN Admin Action</b>\n\n` +
                    `User <code>${targetUserId}</code> has been unblocked.`,
                  parse_mode: "HTML"
                });

                await api("sendMessage", {
                  chat_id: targetUserId,
                  text:
                    `✅ <b>GOWIN Notice</b>\n\n` +
                    `আপনাকে admin unblock করেছেন।`,
                  parse_mode: "HTML"
                });
                continue;
              }
            }
          }

          if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
            const originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
            const match = originalText.match(/#ID(\d+)_(\d+)/);

            if (match) {
              const userId = Number(match[1]);
              const userMsgId = Number(match[2]);

              if (blockedUsers.has(userId)) {
                await api("sendMessage", {
                  chat_id: chatId,
                  text:
                    `⚠️ <b>Reply blocked</b>\n\n` +
                    `এই user বর্তমানে blocked আছে। আগে unblock করুন।`,
                  parse_mode: "HTML"
                });
                continue;
              }

              const sent = await api("copyMessage", {
                chat_id: userId,
                from_chat_id: chatId,
                message_id: msg.message_id,
                reply_to_message_id: userMsgId
              });

              if (sent && sent.ok) {
                await api("setMessageReaction", {
                  chat_id: chatId,
                  message_id: msg.message_id,
                  reaction: [{ type: "emoji", emoji: "⚡" }]
                });
              }
            }
          }

          continue;
        }
      }
    } catch (err) {
      console.error("🔥 Poll Error:", err.message);
      await sleep(3000);
    }
  }
}

poll();
