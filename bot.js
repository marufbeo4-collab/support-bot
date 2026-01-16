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

async function sendAlbumGroup(groupId, chatId, name) {
    const messages = albumBucket[groupId].messages;
    delete albumBucket[groupId]; 

    if (!messages || messages.length === 0) return;

    const mediaArray = messages.map(msg => {
        const caption = `👤 <b>${name}</b>\n🆔 #UID${chatId}`;
        
        if (msg.photo) {
            return { type: 'photo', media: msg.photo[msg.photo.length - 1].file_id, caption: caption, parse_mode: 'HTML' };
        } else if (msg.video) {
            return { type: 'video', media: msg.video.file_id, caption: caption, parse_mode: 'HTML' };
        }
        return null;
    }).filter(m => m !== null);

    if (mediaArray.length > 0) {
        await api("sendMediaGroup", { chat_id: MAIN_GROUP_ID, media: mediaArray });
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
        const name = msg.from.first_name || "Member";

        // ==============================
        // 🏢 GROUP SIDE (Admin)
        // ==============================
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            
            // 🔍 গ্রুপ আইডি চেক করার কমান্ড
            if (text === "/id") {
                await api("sendMessage", { 
                    chat_id: chatId, 
                    text: `🆔 <b>Current Group ID:</b> <code>${chatId}</code>\n⚙️ <b>Configured ID:</b> <code>${MAIN_GROUP_ID}</code>\n\n(দুইটা আইডি একই হতে হবে)`, 
                    parse_mode: "HTML" 
                });
                continue;
            }

            // 👨‍💻 রিপ্লাই সিস্টেম (Reply System)
            if (chatId === MAIN_GROUP_ID && msg.reply_to_message) {
                
                // ১. আসল মেসেজ বের করা
                let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
                
                // ২. UID খোঁজা
                const match = originalText.match(/#UID(\d+)/);

                if (match) {
                    const userId = match[1];
                    
                    // ৩. ইউজারের কাছে পাঠানো
                    const sent = await api("copyMessage", {
                        chat_id: userId,
                        from_chat_id: chatId,
                        message_id: msg.message_id
                    });

                    // ৪. সফল হলে রিয়েকশন, ব্যর্থ হলে এরর মেসেজ
                    if (sent && sent.ok) {
                        await api("setMessageReaction", {
                            chat_id: chatId,
                            message_id: msg.message_id,
                            reaction: [{ type: "emoji", emoji: "⚡" }]
                        });
                    } else {
                        await api("sendMessage", { 
                            chat_id: chatId, 
                            text: `❌ <b>Failed!</b> User blocked the bot.`, 
                            parse_mode: "HTML" 
                        });
                    }
                } else {
                    // যদি UID না পায়
                    await api("sendMessage", { 
                        chat_id: chatId, 
                        text: `⚠️ <b>Error:</b> ID not found!\nMake sure replying to a message with <b>#UID...</b>`, 
                        parse_mode: "HTML" 
                    });
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
              text: `🌟 <b>WELCOME TO SUPER CLUB</b>\nপ্রিয় ${name}, আপনার সমস্যাটি নিচে বাটন সিলেক্ট করে জানান।`,
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
                      timer: setTimeout(() => sendAlbumGroup(groupId, chatId, name), 2000)
                  };
              }
              albumBucket[groupId].messages.push(msg);
              continue;
          }

          // SINGLE MESSAGE
          const userLink = `<a href="tg://user?id=${chatId}">${name}</a>`;
          // 🆔 পরিষ্কারভাবে আলাদা লাইনে রাখা হলো
          const idTag = `🆔 #UID${chatId}`;

          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
              const prettyMsg = `👤 <b>${userLink}</b>\n\n${text}\n\n${idTag}`;
              await api("sendMessage", { chat_id: MAIN_GROUP_ID, text: prettyMsg, parse_mode: "HTML", disable_web_page_preview: true });
          } 
          else if (msg.photo || msg.video || msg.document) {
              const mediaCaption = (msg.caption || "") + `\n\n👤 <b>${userLink}</b>\n${idTag}`;
              await api("copyMessage", { chat_id: MAIN_GROUP_ID, from_chat_id: chatId, message_id: msg.message_id, caption: mediaCaption, parse_mode: "HTML" });
          }
          else {
              await api("copyMessage", { chat_id: MAIN_GROUP_ID, from_chat_id: chatId, message_id: msg.message_id });
              await api("sendMessage", { chat_id: MAIN_GROUP_ID, text: `👤 <b>${userLink}</b> 👆 sent media\n${idTag}`, parse_mode: "HTML" });
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
