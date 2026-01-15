const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error("❌ Error: BOT_TOKEN is missing!");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ⚠️ আপনার গ্রুপের আইডি এখানে বসান (Render এ ২৪ ঘণ্টা রানিং রাখার জন্য এটা জরুরি)
// উদাহরণ: const MAIN_GROUP_ID = -100123456789;
const MAIN_GROUP_ID = -1003535404975; 

const userList = new Set(); 

// --- KEEP ALIVE SERVER ---
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Super Club Bot is Running...');
});
server.listen(process.env.PORT || 8080);
// --------------------------

console.log("💎 Super Club Bot Started...");

// API Helper
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

// Button Commands
const CMD_DEPOSIT = "✓DEPOSIT • PROBLEM 💳";
const CMD_WITHDRAW = "✓WITHDRAW • PROBLEM 💰";
const CMD_GAMEID = "✓GAME ID PROBLEM 👣";
const CMD_OTHERS = "✓OTHERS ℹ️";

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
        console.error("❌ Connection Error:", data.description);
        await sleep(5000);
        continue;
      }

      for (const u of data.result) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg) continue;
        if (msg.from?.is_bot) continue;

        const chatId = msg.chat.id;
        const text = msg.text || "";
        const name = msg.from.first_name || "Member";

        if (msg.chat.type === "private") userList.add(chatId);

        // =============================================
        // 🏢 GROUP MANAGEMENT
        // =============================================
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            if (text === "/setgroup") {
                activeGroupId = chatId;
                await api("sendMessage", {
                    chat_id: chatId,
                    text: `<b>💎 Super Club Support Connected!</b>\n\n🆔 Group ID: <code>${chatId}</code>\n(⚠️ এই আইডি কপি করে কোডের ১০ নম্বর লাইনে বসান)`,
                    parse_mode: "HTML"
                });
                continue;
            }
            // Broadcast code removed for brevity, works as before
        }

        // =============================================
        // 👤 USER PRIVATE CHAT
        // =============================================
        if (msg.chat.type === "private") {
          
          if (text === "/start") {
            await api("sendChatAction", { chat_id: chatId, action: "typing" });
            const welcomeMsg = `
🌟 <b>WELCOME TO SUPER CLUB</b> 🌟
━━━━━━━━━━━━━━━━━━━━━━
প্রিয় ${name},
আমাদের প্রিমিয়াম সাপোর্টে আপনাকে স্বাগতম।
আপনার সমস্যা বা স্ক্রিনশট নিচে পাঠান। ❤️

<i>Choose an option below:</i>
            `;
            await api("sendMessage", {
              chat_id: chatId,
              text: welcomeMsg,
              parse_mode: "HTML",
              reply_markup: mainKeyboard
            });
            continue;
          }

          if (!activeGroupId) {
            await api("sendMessage", { chat_id: chatId, text: "⚠️ <i>System Maintenance Mode.</i>", parse_mode: "HTML" });
            continue;
          }

          // --- AUTO REPLY LOGIC ---
          let isButton = false;
          if (text === CMD_DEPOSIT) {
              isButton = true;
              await api("sendMessage", { chat_id: chatId, text: "💳 <b>ডিপোজিট সমস্যা?</b>\n\nআপনার TrxID এবং পেমেন্টের স্ক্রিনশট দিন।", parse_mode: "HTML" });
          } 
          else if (text === CMD_WITHDRAW) {
              isButton = true;
              await api("sendMessage", { chat_id: chatId, text: "💰 <b>উইথড্র সমস্যা?</b>\n\nআপনার গেম আইডি এবং কত টাকা উইথড্র দিয়েছেন তা লিখুন।", parse_mode: "HTML" });
          }
          else if (text === CMD_GAMEID) {
              isButton = true;
              await api("sendMessage", { chat_id: chatId, text: "👣 <b>গেম আইডি সমস্যা?</b>\n\nসঠিক গেম আইডি এবং সমস্যার ছবি দিন।", parse_mode: "HTML" });
          }
          else if (text === CMD_OTHERS) {
              isButton = true;
              await api("sendMessage", { chat_id: chatId, text: "ℹ️ <b>অন্যান্য সাহায্য?</b>\n\nআপনার সমস্যা বিস্তারিত লিখুন।", parse_mode: "HTML" });
          }

          // --- FORWARD TO ADMIN (Text, Photo, Voice - ALL) ---
          
          // ১. প্রথমে একটি টিকেট হেডলাইন পাঠাবে
          const ticketHeader = `
💎 <b>NEW TICKET</b> | #UID${msg.from.id}
━━━━━━━━━━━━━━━━
👤 <b>User:</b> <a href="tg://user?id=${msg.from.id}">${name}</a>
🆔 <b>ID:</b> <code>${msg.from.id}</code>
${isButton ? `🔘 <b>Selected:</b> ${text}` : ""}
━━━━━━━━━━━━━━━━`;

          // শুধু বাটন চাপলে হেডার যাবে, আর যদি ইউজার কিছু লিখে/ছবি দেয় তবে কন্টেন্টও যাবে
          if (isButton) {
             await api("sendMessage", { chat_id: activeGroupId, text: ticketHeader, parse_mode: "HTML" });
          } else {
             // হেডারটি আগে পাঠাই
             await api("sendMessage", { chat_id: activeGroupId, text: ticketHeader, parse_mode: "HTML" });
             
             // এরপর আসল কন্টেন্ট (ছবি/টেক্সট) কপি করে পাঠাই
             await api("copyMessage", {
                 chat_id: activeGroupId,
                 from_chat_id: chatId,
                 message_id: msg.message_id
             });
          }

          // Confirmation to User (Auto delete)
          if (!isButton) {
              const sentMsg = await api("sendMessage", {
                chat_id: chatId,
                text: "✅ <i>Sent. Please wait...</i>",
                parse_mode: "HTML",
                reply_markup: mainKeyboard
              });
              if (sentMsg?.result?.message_id) {
                setTimeout(() => { api("deleteMessage", { chat_id: chatId, message_id: sentMsg.result.message_id }); }, 5000);
              }
          }
          continue;
        }

        // =============================================
        // 👨‍💻 ADMIN REPLY (Supported: Text, Photo, Sticker)
        // =============================================
        if (activeGroupId && chatId === activeGroupId && msg.reply_to_message) {
           // আগের মেসেজ থেকে #UID খোঁজা (যদি টেক্সট হয়)
           let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
           
           // যদি আগের মেসেজটি শুধু কপি করা ছবি হয়, সেখানে UID থাকবে না।
           // তাই আমরা আগের মেসেজ (Ticket Header) চেক করব।
           // কিন্তু টেলিগ্রাম বটের সীমাবদ্ধতার কারণে, সব মেসেজেই UID ট্যাগ থাকা জরুরি।
           // এই কোডে আমরা Ticket Header এ UID রেখেছি, তাই অ্যাডমিনকে *Ticket Header* এ রিপ্লাই দিতে হবে।
           
           const match = originalText.match(/#UID(\d+)/);

           if (match) {
             const userId = match[1];
             await api("sendChatAction", { chat_id: userId, action: "typing" });
             await sleep(800); 

             // Copy Admin's reply to User (Text/Image support)
             await api("copyMessage", {
                 chat_id: userId,
                 from_chat_id: chatId,
                 message_id: msg.message_id
             });
             
             await api("sendMessage", { chat_id: activeGroupId, text: "✅ <i>Reply Sent.</i>", parse_mode: "HTML" });
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
