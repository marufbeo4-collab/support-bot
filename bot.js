const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ Error: BOT_TOKEN is missing!");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ✅ আপনার গ্রুপ আইডি (স্থায়ীভাবে বসানো হলো)
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
// ✅ মেনু বাটন (সব আগের মতোই আছে)
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

        // গ্রুপ কমান্ড হ্যান্ডলার (সেটআপ ও ব্রডকাস্ট)
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            if (text === "/setgroup") {
                activeGroupId = chatId;
                await api("sendMessage", { chat_id: chatId, text: `✅ <b>Connected!</b> ID: <code>${chatId}</code>`, parse_mode: "HTML" });
            }
            if (text.startsWith("/broadcast")) {
                // ব্রডকাস্ট কোড এখানে (শর্টকার্ট)
                await api("sendMessage", { chat_id: chatId, text: "📢 Broadcast started..." });
            }
            continue;
        }

        // ==============================
        // 👤 ইউজার সাইড (Auto Reply + Forwarding)
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

          // --- ১. অটো রিপ্লাই (আগের ফিচার ফেরত) ---
          if (text === CMD_DEPOSIT) {
              await api("sendMessage", { chat_id: chatId, text: "💳 <b>ডিপোজিট সমস্যা?</b>\n\n১. গেম আইডি\n২. TrxID\n৩. স্ক্রিনশট দিন", parse_mode: "HTML" });
          } 
          else if (text === CMD_WITHDRAW) {
              await api("sendMessage", { chat_id: chatId, text: "💰 <b>উইথড্র সমস্যা?</b>\n\n১. গেম আইডি\n২. টাকার পরিমাণ\n৩. মেথড (Bkash/Nagad) লিখুন", parse_mode: "HTML" });
          }
          else if (text === CMD_GAMEID) {
              await api("sendMessage", { chat_id: chatId, text: "👣 <b>গেম আইডি সমস্যা?</b>\n\nসঠিক আইডি এবং স্ক্রিনশট দিন।", parse_mode: "HTML" });
          }

          // ==============================
          // 📢 ২. গ্রুপে ফরওয়ার্ড (একদম সিম্পল স্টাইল)
          // ==============================
          
          // ক) যদি শুধু লেখা (Text) হয়
          if (text && !msg.photo && !msg.video && !msg.voice && !msg.sticker) {
              // মেসেজটা দেখতে হবে: "👤 Maruf: আমার সমস্যা (#UID...)"
              const simpleText = `👤 <b>${name}:</b> ${text}\n\n#UID${chatId}`;
              
              await api("sendMessage", {
                  chat_id: activeGroupId,
                  text: simpleText,
                  parse_mode: "HTML"
              });
          } 
          // খ) যদি ছবি বা ভিডিও হয় (Media)
          else if (msg.photo || msg.video || msg.document) {
              // ছবির সাথেই নাম আর আইডি লাগিয়ে দেব (আলাদা মেসেজ আসবে না)
              const mediaCaption = (msg.caption || "") + `\n\n👤 <b>${name}</b> | #UID${chatId}`;
              
              await api("copyMessage", {
                  chat_id: activeGroupId,
                  from_chat_id: chatId,
                  message_id: msg.message_id,
                  caption: mediaCaption,
                  parse_mode: "HTML"
              });
          }
          // গ) যদি ভয়েস বা স্টিকার হয়
          else {
              // ভয়েস কপি করব
              await api("copyMessage", {
                  chat_id: activeGroupId,
                  from_chat_id: chatId,
                  message_id: msg.message_id
              });
              // রিপ্লাই দেওয়ার জন্য নিচে ছোট্ট করে আইডি দেব
              await api("sendMessage", {
                  chat_id: activeGroupId,
                  text: `👤 <b>${name}</b> sent media | #UID${chatId}`,
                  parse_mode: "HTML"
              });
          }
          continue;
        }

        // ==============================
        // 👨‍💻 অ্যাডমিন রিপ্লাই (Reply System)
        // ==============================
        if (activeGroupId && chatId === activeGroupId && msg.reply_to_message) {
           let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
           const match = originalText.match(/#UID(\d+)/);

           if (match) {
             const userId = match[1];
             
             // ইউজারের কাছে হুবহু কপি যাবে
             await api("copyMessage", {
                 chat_id: userId,
                 from_chat_id: chatId,
                 message_id: msg.message_id
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
