const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ Error: BOT_TOKEN is missing!");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const MAIN_GROUP_ID = -1003535404975; 

const http = require('http');
const fs = require('fs'); // ফাইল সিস্টেম মডিউল

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is Running...');
});
server.listen(process.env.PORT || 8080);

console.log("🚀 Bot Started...");

// --- 🔒 BLOCK SYSTEM MEMORY ---
const BLOCK_FILE = 'blocked.json';
let blockedUsers = new Set();

// 1. সার্ভার অন হলে আগের ব্লক লিস্ট লোড করা
try {
    if (fs.existsSync(BLOCK_FILE)) {
        const data = fs.readFileSync(BLOCK_FILE);
        blockedUsers = new Set(JSON.parse(data));
        console.log(`🔒 Loaded ${blockedUsers.size} blocked users.`);
    }
} catch (err) {
    console.error("⚠️ Error loading block list:", err);
}

// 2. ব্লক লিস্ট সেভ করার ফাংশন
function saveBlockList() {
    try {
        fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers]));
    } catch (err) {
        console.error("⚠️ Error saving block list:", err);
    }
}

// অ্যালবাম বাকেট
const albumBucket = {}; 

async function api(method, data) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  } catch (e) {
    console.error(`⚠️ API Error (${method}):`, e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==============================
// ✅ মেনু বাটন
// ==============================
const CMD_DEPOSIT = "DEPOSIT • PROBLEM 💳";
const CMD_WITHDRAW = "WITHDRAW • PROBLEM 💰";
const CMD_GAMEID = "GAME ID PROBLEM 👣";
const CMD_OTHERS = "OTHERS ℹ️";

const mainKeyboard = {
    keyboard: [
        [{ text: CMD_DEPOSIT }, { text: CMD_WITHDRAW }],
        [{ text: CMD_GAMEID }, { text: CMD_OTHERS }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};

async function sendAlbumGroup(groupId, chatId, firstName, username, firstMsgId, replyContext) {
    const messages = albumBucket[groupId].messages;
    delete albumBucket[groupId]; 

    if (!messages || messages.length === 0) return;

    const msgWithCaption = messages.find(m => m.caption);
    const originalCaption = msgWithCaption ? msgWithCaption.caption : "";

    const mediaArray = messages.map((msg, index) => {
        let caption = "";
        if (index === 0 && originalCaption) caption = originalCaption; 

        if (msg.photo) return { type: 'photo', media: msg.photo[msg.photo.length - 1].file_id, caption: caption };
        else if (msg.video) return { type: 'video', media: msg.video.file_id, caption: caption };
        return null;
    }).filter(m => m !== null);

    if (mediaArray.length > 0) {
        await api("sendMediaGroup", { chat_id: MAIN_GROUP_ID, media: mediaArray });
        
        const userHandle = username ? `(@${username})` : "";
        const fullName = escapeHtml(`${firstName} ${userHandle}`);
        const userLink = `<a href="tg://user?id=${chatId}">${fullName}</a>`;

        const magicId = `#ID${chatId}_${firstMsgId}`;
        const finalMsg = `👤 <b>${userLink}</b> sent photos 👆${replyContext}\n🆔 <code>${magicId}</code>`;

        await api("sendMessage", { 
            chat_id: MAIN_GROUP_ID, 
            text: finalMsg, 
            parse_mode: "HTML" 
        });
    }
}

async function poll() {
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      if (!data.ok) {
        await sleep(5000);
        continue;
      }

      for (const u of data.result) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg) continue;
        if (msg.from?.is_bot) continue;

        const chatId = msg.chat.id;
        const text = msg.text || msg.caption || ""; 
        const firstName = msg.from.first_name || "Member";
        const username = msg.from.username || ""; 

        // ==============================
        // 🚫 BLOCK CHECK (সবার আগে চেক করবে)
        // ==============================
        if (msg.chat.type === "private" && blockedUsers.has(chatId)) {
            // ব্লকড ইউজার মেসেজ দিলে তাকে কিছুই দেখাবো না, বা চাইলে একটা வার্নিং দিতে পারেন
            // await api("sendMessage", { chat_id: chatId, text: "🚫 You are blocked." });
            continue; // নিচে আর যাবে না
        }


        // ==============================
        // 🏢 GROUP SIDE (Admin Commands)
        // ==============================
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            if (text === "/id") {
                await api("sendMessage", { chat_id: chatId, text: `🆔 ID: <code>${chatId}</code>`, parse_mode: "HTML" });
                continue;
            }

            // 🛑 BLOCK / UNBLOCK COMMANDS 🛑
            if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
                let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
                const match = originalText.match(/#ID(\d+)_/); // আইডি বের করা

                if (match) {
                    const targetUserId = parseInt(match[1]);

                    // Block Command
                    if (text === "/block") {
                        blockedUsers.add(targetUserId);
                        saveBlockList(); // ফাইলে সেভ
                        
                        await api("sendMessage", { chat_id: chatId, text: `🚫 User <code>${targetUserId}</code> has been <b>BLOCKED</b>.`, parse_mode: "HTML" });
                        await api("sendMessage", { chat_id: targetUserId, text: `🚫 <b>You have been blocked by the admin.</b>`, parse_mode: "HTML" });
                        continue;
                    }

                    // Unblock Command
                    if (text === "/unblock") {
                        blockedUsers.delete(targetUserId);
                        saveBlockList(); // ফাইলে সেভ

                        await api("sendMessage", { chat_id: chatId, text: `✅ User <code>${targetUserId}</code> has been <b>UNBLOCKED</b>.`, parse_mode: "HTML" });
                        await api("sendMessage", { chat_id: targetUserId, text: `✅ <b>You have been unblocked.</b>`, parse_mode: "HTML" });
                        continue;
                    }
                }
            }

            // 🔥 NATURAL REPLY 🔥
            if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
                let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
                const match = originalText.match(/#ID(\d+)_(\d+)/);

                if (match) {
                    const userId = match[1];     
                    const userMsgId = match[2];  

                    // রিপ্লাই পাঠানোর আগে চেক করা, ইউজার ব্লকড কিনা
                    if (blockedUsers.has(parseInt(userId))) {
                         await api("sendMessage", { chat_id: chatId, text: "⚠️ This user is blocked. Unblock first.", parse_mode: "HTML" });
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

        // ==============================
        // 👤 USER SIDE
        // ==============================
        if (msg.chat.type === "private") {
          
          if (text === "/start") {
            await api("sendMessage", {
              chat_id: chatId,
              text: `🌟 <b>WELCOME TO SUPER CLUB</b>\nপ্রিয় ${escapeHtml(firstName)}, আপনার সমস্যাটি নিচে বাটন সিলেক্ট করে জানান।`,
              parse_mode: "HTML",
              reply_markup: mainKeyboard
            });
            continue;
          }

          if (text === CMD_DEPOSIT) await api("sendMessage", { chat_id: chatId, text: "💳 <b>ডিপোজিট সমস্যা?</b>\n\n১. গেম আইডি\n২. TrxID\n৩. স্ক্রিনশট দিন", parse_mode: "HTML" });
          else if (text === CMD_WITHDRAW) await api("sendMessage", { chat_id: chatId, text: "💰 <b>উইথড্র সমস্যা?</b>\n\n১. গেম আইডি\n২. টাকার পরিমাণ\n৩. মেথড (Bkash/Nagad) লিখুন", parse_mode: "HTML" });
          else if (text === CMD_GAMEID) await api("sendMessage", { chat_id: chatId, text: "👣 <b>গেম আইডি সমস্যা?</b>\n\nসঠিক আইডি এবং স্ক্রিনশট দিন।", parse_mode: "HTML" });

          // REPLY CONTEXT
          let replyContext = "";
          if (msg.reply_to_message) {
              let rText = msg.reply_to_message.text || msg.reply_to_message.caption || "🖼️ Media";
              if (rText.length > 25) rText = rText.substring(0, 25) + "...";
              replyContext = `\n↩️ <b>Replying to:</b> <i>"${escapeHtml(rText)}"</i>`;
          }

          // ALBUM HANDLING
          if (msg.media_group_id) {
              const groupId = msg.media_group_id;
              if (!albumBucket[groupId]) {
                  albumBucket[groupId] = {
                      messages: [],
                      timer: setTimeout(() => sendAlbumGroup(groupId, chatId, firstName, username, msg.message_id, replyContext), 2500)
                  };
              }
              albumBucket[groupId].messages.push(msg);
              continue;
          }

          // SINGLE MESSAGE
          const userHandle = username ? `(@${username})` : "";
          const fullName = escapeHtml(`${firstName} ${userHandle}`);
          const userLink = `<a href="tg://user?id=${chatId}">${fullName}</a>`;
          const magicId = `#ID${chatId}_${msg.message_id}`;

          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
              const prettyMsg = `👤 <b>${userLink}</b>:${replyContext}\n\n${escapeHtml(text)}\n\n🆔 <code>${magicId}</code>`;
              await api("sendMessage", { chat_id: MAIN_GROUP_ID, text: prettyMsg, parse_mode: "HTML", disable_web_page_preview: true });
          } 
          else {
              await api("copyMessage", { chat_id: MAIN_GROUP_ID, from_chat_id: chatId, message_id: msg.message_id });
              await api("sendMessage", { chat_id: MAIN_GROUP_ID, text: `👤 <b>${userLink}</b> sent this 👆${replyContext}\n🆔 <code>${magicId}</code>`, parse_mode: "HTML" });
          }
          continue;
        }
      }
    } catch (err) {
      console.error("🔥 Error:", err.message);
      await sleep(3000);
    }
  }
}

poll();
