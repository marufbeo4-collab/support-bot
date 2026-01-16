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

// অ্যালবাম জমা রাখার বাকেট
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

// --- অ্যালবাম পাঠানোর ফাংশন ---
async function sendAlbumGroup(groupId, chatId, name) {
    const messages = albumBucket[groupId].messages;
    delete albumBucket[groupId]; 

    if (!messages || messages.length === 0) return;

    const mediaArray = messages.map(msg => {
        // এই ফরমেটটি রিপ্লাই এর জন্য জরুরি
        const caption = `👤 <b>${name}</b>\n(Album Media)\n🆔 #UID${chatId}`;
        
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
  let activeGroupId = MAIN_GROUP_ID;

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

        // গ্রুপ কমান্ড
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            if (text === "/setgroup") {
                await api("sendMessage", { chat_id: chatId, text: `✅ <b>Connected!</b>`, parse_mode: "HTML" });
            }
            continue;
        }

        // ==============================
        // 👤 ইউজার সাইড (Auto Reply + Forward)
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

          // অটো রিপ্লাই
          if (text === CMD_DEPOSIT) await api("sendMessage", { chat_id: chatId, text: "💳 <b>ডিপোজিট সমস্যা?</b>\n\n১. গেম আইডি\n২. TrxID\n৩. স্ক্রিনশট দিন", parse_mode: "HTML" });
          else if (text === CMD_WITHDRAW) await api("sendMessage", { chat_id: chatId, text: "💰 <b>উইথড্র সমস্যা?</b>\n\n১. গেম আইডি\n২. টাকার পরিমাণ\n৩. মেথড (Bkash/Nagad) লিখুন", parse_mode: "HTML" });
          else if (text === CMD_GAMEID) await api("sendMessage", { chat_id: chatId, text: "👣 <b>গেম আইডি সমস্যা?</b>\n\nসঠিক আইডি এবং স্ক্রিনশট দিন।", parse_mode: "HTML" });


          // --- ALBUM LOGIC ---
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

          // --- SINGLE MESSAGE FORWARDING ---
          
          // ইউজারের নামের লিংক
          const userLink = `<a href="tg://user?id=${chatId}">${name}</a>`;
          // ⚠️ এই লাইনটি খেয়াল করুন: ID এখন পরিষ্কারভাবে নিচে থাকবে
          const idTag = `🆔 #UID${chatId}`;

          // ১. টেক্সট মেসেজ
          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
              const prettyMsg = `👤 <b>${userLink}</b>\n\n${text}\n\n${idTag}`;
              
              await api("sendMessage", {
                  chat_id: activeGroupId,
                  text: prettyMsg,
                  parse_mode: "HTML",
                  disable_web_page_preview: true
              });
          } 
          // ২. ছবি / ভিডিও / ডকুমেন্ট
          else if (msg.photo || msg.video || msg.document) {
              const mediaCaption = (msg.caption || "") + `\n\n👤 <b>${userLink}</b>\n${idTag}`;
              await api("copyMessage", {
                  chat_id: activeGroupId,
                  from_chat_id: chatId,
                  message_id: msg.message_id,
                  caption: mediaCaption,
                  parse_mode: "HTML"
              });
          }
          // ৩. ভয়েস / স্টিকার (আলাদা ট্যাগ সহ)
          else {
              await api("copyMessage", { chat_id: activeGroupId, from_chat_id: chatId, message_id: msg.message_id });
              await api("sendMessage", { 
                  chat_id: activeGroupId, 
                  text: `👤 <b>${userLink}</b> 👆 sent media\n${idTag}`, 
                  parse_mode: "HTML" 
              });
          }
          continue;
        }

        // ==============================
        // 👨‍💻 অ্যাডমিন রিপ্লাই (FIXED & DEBUGGED)
        // ==============================
        if (activeGroupId && chatId === activeGroupId && msg.reply_to_message) {
           // আসল মেসেজ বা ক্যাপশন বের করা
           let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
           
           // আইডি খোঁজা (Regex: #UID এর পর সংখ্যা)
           const match = originalText.match(/#UID(\d+)/);

           if (match) {
             const userId = match[1];
             
             // কপি মেসেজ (যাতে ছবি/স্টিকার/টেক্সট সব রিপ্লাই হিসেবে যায়)
             const sent = await api("copyMessage", {
                 chat_id: userId,
                 from_chat_id: chatId,
                 message_id: msg.message_id
             });

             // যদি কপি করতে না পারে (যেমন ইউজার বট ব্লক করলে)
             if (!sent || !sent.ok) {
                 await api("sendMessage", { chat_id: activeGroupId, text: `❌ <b>Failed!</b> User blocked bot or error.`, parse_mode: "HTML" });
             } else {
                 // সফল হলে টিক চিহ্ন
                 await api("setMessageReaction", {
                     chat_id: chatId,
                     message_id: msg.message_id,
                     reaction: [{ type: "emoji", emoji: "⚡" }]
                 });
             }

           } else {
             // ⚠️ যদি আইডি না পায়, তাহলে গ্রুপে জানাবে
             await api("sendMessage", { 
                 chat_id: activeGroupId, 
                 text: `⚠️ <b>Error:</b> User ID not found in the message you replied to.\nMake sure you are replying to a message containing <b>#UID...</b>`, 
                 parse_mode: "HTML" 
             });
           }
        }
      }
    } catch (err) {
      console.error("🔥 Error:", err.message);
      await sleep(3000);
    }
  }
}

poll();
