const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ Error: BOT_TOKEN is missing!");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ✅ আপনার গ্রুপ আইডি
const MAIN_GROUP_ID = -1003535404975; 

// --- KEEP ALIVE ---
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is Running...');
});
server.listen(process.env.PORT || 8080);
// ------------------

console.log("🚀 Bot Started...");

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

// --- অ্যালবাম পাঠানোর ফাংশন ---
async function sendAlbumGroup(groupId, chatId, firstName, username, firstMsgId) {
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

        // 🔥 ম্যাজিক আইডি: UserID এবং MessageID একসাথে রাখা হচ্ছে
        const magicId = `#ID${chatId}_${firstMsgId}`;

        const finalMsg = `👤 <b>${userLink}</b> sent photos 👆\n🆔 <code>${magicId}</code>`;

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
        // 🏢 GROUP SIDE (Admin to User)
        // ==============================
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            if (text === "/id") {
                await api("sendMessage", { chat_id: chatId, text: `🆔 ID: <code>${chatId}</code>`, parse_mode: "HTML" });
                continue;
            }

            // 🔥 NATURAL REPLY LOGIC 🔥
            if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
                // ১. গ্রুপ মেসেজ থেকে ম্যাজিক আইডি (#ID123_456) খুঁজে বের করা
                let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
                
                // Regex দিয়ে UserID এবং MessageID আলাদা করা
                const match = originalText.match(/#ID(\d+)_(\d+)/);

                if (match) {
                    const userId = match[1];     // ইউজারের চ্যাট আইডি
                    const userMsgId = match[2];  // ইউজারের আসল মেসেজ আইডি

                    // ২. এডমিনের মেসেজ কাস্টমারের কাছে পাঠানো (Copy)
                    // এবং 'reply_to_message_id' ব্যবহার করে ন্যাচারাল রিপ্লাই দেওয়া
                    const sent = await api("copyMessage", {
                        chat_id: userId,
                        from_chat_id: chatId,
                        message_id: msg.message_id,
                        reply_to_message_id: userMsgId // ✅ এটাই আসল ম্যাজিক!
                    });

                    if (sent && sent.ok) {
                        await api("setMessageReaction", {
                            chat_id: chatId,
                            message_id: msg.message_id,
                            reaction: [{ type: "emoji", emoji: "⚡" }]
                        });
                    } else {
                        await api("sendMessage", { chat_id: chatId, text: `❌ Failed`, parse_mode: "HTML" });
                    }
                }
            }
            continue;
        }

        // ==============================
        // 👤 USER SIDE (User to Admin)
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


          // ALBUM HANDLING
          if (msg.media_group_id) {
              const groupId = msg.media_group_id;
              if (!albumBucket[groupId]) {
                  albumBucket[groupId] = {
                      messages: [],
                      // এখানে প্রথম মেসেজের আইডি পাঠাচ্ছি যাতে রিপ্লাই দেওয়া যায়
                      timer: setTimeout(() => sendAlbumGroup(groupId, chatId, firstName, username, msg.message_id), 2500)
                  };
              }
              albumBucket[groupId].messages.push(msg);
              continue;
          }

          // SINGLE MESSAGE LOGIC
          const userHandle = username ? `(@${username})` : "";
          const fullName = escapeHtml(`${firstName} ${userHandle}`);
          const userLink = `<a href="tg://user?id=${chatId}">${fullName}</a>`;

          // 🔥 ম্যাজিক আইডি জেনারেট করা (UserID + MessageID)
          // এটা গ্রুপে দেখা যাবে, কিন্তু এটাই আমাদের ডাটাবেসের কাজ করবে
          const magicId = `#ID${chatId}_${msg.message_id}`;

          // ১. টেক্সট
          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
              const prettyMsg = `👤 <b>${userLink}</b>:\n\n${escapeHtml(text)}\n\n🆔 <code>${magicId}</code>`;
              await api("sendMessage", { chat_id: MAIN_GROUP_ID, text: prettyMsg, parse_mode: "HTML", disable_web_page_preview: true });
          } 
          // ২. মিডিয়া
          else {
              await api("copyMessage", { 
                  chat_id: MAIN_GROUP_ID, 
                  from_chat_id: chatId, 
                  message_id: msg.message_id 
              });

              await api("sendMessage", { 
                  chat_id: MAIN_GROUP_ID, 
                  text: `👤 <b>${userLink}</b> sent this 👆\n🆔 <code>${magicId}</code>`, 
                  parse_mode: "HTML" 
              });
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
