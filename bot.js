const TOKEN = "8620612566:AAF7RX5-RevFdYDR9TdUbL9axBEe3pKrM4k";
const API = `https://api.telegram.org/bot${TOKEN}`;
const MAIN_GROUP_ID = -5184100145;

const http = require("http");
const fs = require("fs");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("GOWIN Support Bot is Running...");
});
server.listen(process.env.PORT || 8080);

console.log("🚀 GOWIN Support Bot Started...");

// ==============================
// FILES / MEMORY
// ==============================
const BLOCK_FILE = "blocked.json";
let blockedUsers = new Set();
const albumBucket = {};

// ==============================
// LOAD BLOCK LIST
// ==============================
try {
  if (fs.existsSync(BLOCK_FILE)) {
    const data = fs.readFileSync(BLOCK_FILE, "utf8");
    blockedUsers = new Set(JSON.parse(data));
    console.log(`🔒 Loaded ${blockedUsers.size} blocked users.`);
  }
} catch (err) {
  console.error("⚠️ Error loading blocked list:", err);
}

function saveBlockList() {
  try {
    fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers], null, 2));
  } catch (err) {
    console.error("⚠️ Error saving blocked list:", err);
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
    return await res.json();
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
  const chatId = msg.chat.id;
  const fullName = escapeHtml(getUserName(msg));
  return `<a href="tg://user?id=${chatId}">${fullName}</a>`;
}

function makeMagicId(chatId, msgId) {
  return `#ID${chatId}_${msgId}`;
}

function shortText(text, max = 40) {
  if (!text) return "Media";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function getReplyContext(msg) {
  if (!msg.reply_to_message) return "";
  const rText =
    msg.reply_to_message.text ||
    msg.reply_to_message.caption ||
    "🖼️ Media";
  return `\n↩️ <b>Reply:</b> <i>${escapeHtml(shortText(rText, 35))}</i>`;
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
// SEND ALBUM GROUP
// ==============================
async function sendAlbumGroup(groupId, originalMsg) {
  const bucket = albumBucket[groupId];
  if (!bucket || !bucket.messages?.length) return;

  delete albumBucket[groupId];

  const messages = bucket.messages;
  const firstMsg = bucket.firstMsg;
  const chatId = firstMsg.chat.id;
  const userLink = getUserLink(firstMsg);
  const magicId = makeMagicId(chatId, firstMsg.message_id);
  const replyContext = getReplyContext(firstMsg);

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
      chat_id: MAIN_GROUP_ID,
      media,
    });

    await api("sendMessage", {
      chat_id: MAIN_GROUP_ID,
      text:
        `🔔 <b>GOWIN Support Request</b>\n\n` +
        `👤 <b>User:</b> ${userLink}${replyContext}\n` +
        `🆔 <code>${magicId}</code>\n` +
        `📎 <b>Sent:</b> Album / Multiple Media`,
      parse_mode: "HTML",
    });
  }
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
        await sleep(4000);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg) continue;
        if (msg.from?.is_bot) continue;

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || "";
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

          // Admin block/unblock only in main group and replying to forwarded support tag
          if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
            const repliedText =
              msg.reply_to_message.text || msg.reply_to_message.caption || "";
            const match = repliedText.match(/#ID(\d+)_/);

            if (match) {
              const targetUserId = Number(match[1]);

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
            }
          }

          // Natural admin reply to user
          if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
            const repliedText =
              msg.reply_to_message.text || msg.reply_to_message.caption || "";
            const match = repliedText.match(/#ID(\d+)_(\d+)/);

            if (match) {
              const userId = Number(match[1]);
              const userMsgId = Number(match[2]);

              if (blockedUsers.has(userId)) {
                await api("sendMessage", {
                  chat_id: chatId,
                  text:
                    `⚠️ <b>This user is currently blocked.</b>\n` +
                    `Unblock first to reply.`,
                  parse_mode: "HTML",
                });
                continue;
              }

              const sent = await api("copyMessage", {
                chat_id: userId,
                from_chat_id: chatId,
                message_id: msg.message_id,
                reply_to_message_id: userMsgId,
              });

              if (sent && sent.ok) {
                await api("setMessageReaction", {
                  chat_id: chatId,
                  message_id: msg.message_id,
                  reaction: [{ type: "emoji", emoji: "⚡" }],
                });
              }
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
            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.welcome(firstName),
              parse_mode: "HTML",
              reply_markup: mainKeyboard,
            });
            continue;
          }

          if (text === CMD_DEPOSIT) {
            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.deposit,
              parse_mode: "HTML",
            });
            continue;
          }

          if (text === CMD_WITHDRAW) {
            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.withdraw,
              parse_mode: "HTML",
            });
            continue;
          }

          if (text === CMD_GAMEID) {
            await api("sendMessage", {
              chat_id: chatId,
              text: TEXTS.gameid,
              parse_mode: "HTML",
            });
            continue;
          }

          if (text === CMD_OTHERS) {
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
                timer: setTimeout(() => sendAlbumGroup(groupId, msg), 2500),
              };
            }

            albumBucket[groupId].messages.push(msg);
            continue;
          }

          // Single message forward/copy to admin group
          const userLink = getUserLink(msg);
          const magicId = makeMagicId(chatId, msg.message_id);
          const replyContext = getReplyContext(msg);

          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
            await api("sendMessage", {
              chat_id: MAIN_GROUP_ID,
              text:
                `🔔 <b>GOWIN Support Request</b>\n\n` +
                `👤 <b>User:</b> ${userLink}${replyContext}\n\n` +
                `📝 <b>Message:</b>\n${escapeHtml(text)}\n\n` +
                `🆔 <code>${magicId}</code>`,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
          } else {
            await api("copyMessage", {
              chat_id: MAIN_GROUP_ID,
              from_chat_id: chatId,
              message_id: msg.message_id,
            });

            await api("sendMessage", {
              chat_id: MAIN_GROUP_ID,
              text:
                `🔔 <b>GOWIN Support Request</b>\n\n` +
                `👤 <b>User:</b> ${userLink}${replyContext}\n` +
                `📎 <b>Sent:</b> Media / File\n` +
                `🆔 <code>${magicId}</code>`,
              parse_mode: "HTML",
            });
          }

          // Optional confirmation to user
          await api("sendMessage", {
            chat_id: chatId,
            text:
              `✅ <b>GOWIN Support Received Your Message</b>\n\n` +
              `আমাদের টিম আপনার message পেয়েছে। একটু অপেক্ষা করুন।`,
            parse_mode: "HTML",
          });

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
