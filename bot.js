const TOKEN = process.env.BOT_TOKEN;

// 1. Check Token
if (!TOKEN) {
  console.error("❌ Error: BOT_TOKEN is missing!");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ⚠️ আপনার গ্রুপের আইডি এখানে বসান (না হলে সার্ভার রিস্টার্ট দিলে ভুলে যাবে)
// উদাহরণ: let INBOX_CHAT_ID = -100123456789;
let INBOX_CHAT_ID = null; 

// ব্রডকাস্টের জন্য ইউজারদের আইডি মনে রাখার মেমোরি
const userList = new Set(); 

// --- KEEP ALIVE SERVER (Render এর জন্য) ---
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Super Club Bot is Active!');
});
server.listen(process.env.PORT || 8080);
// ---------------------------------------------------------

console.log("🚀 Super Club Bot Started...");

// 2. API Helper
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

// 3. বাটন মেনু (Keyboards)
const mainKeyboard = {
    keyboard: [
        [{ text: "✓DEPOSIT • PROBLEM 💳" }, { text: "✓WITHDRAW • PROBLEM 💰" }],
        [{ text: "✓GAME ID PROBLEM 👣" }, { text: "✓OTHERS ℹ️" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
};

// 4. Main Loop
async function poll() {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      if (!data.ok) {
        console.error("❌ API Error:", data.description);
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
        const name = msg.from.first_name || "User";

        // ইউজার লিস্টে আইডি সেভ করা (Broadcast এর জন্য)
        if (msg.chat.type === "private") {
            userList.add(chatId);
        }

        // ----------- GROUP SETUP & BROADCAST ------------
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            
            // A. গ্রুপ সেটআপ
            if (text === "/setgroup") {
                INBOX_CHAT_ID = chatId;
                await api("sendMessage", {
                    chat_id: chatId,
                    text: `<b>✅ Super Club Support Connected!</b>\nGroup ID: <code>${chatId}</code>\n(Please paste this ID inside bot.js code for permanent fix)`,
                    parse_mode: "HTML"
                });
                continue;
            }

            // B. ব্রডকাস্ট কমান্ড (Admin only)
            // নিয়ম: /broadcast আপনার মেসেজ
            if (text.startsWith("/broadcast")) {
                const messageToSend = text.replace("/broadcast", "").trim();
                if (!messageToSend) {
                    await api("sendMessage", { chat_id: chatId, text: "❌ Please write a message. Example:\n/broadcast Hello everyone!" });
                    continue;
                }

                let count = 0;
                await api("sendMessage", { chat_id: chatId, text: `📣 Sending broadcast to ${userList.size} users...` });

                for (const userId of userList) {
                    await api("sendMessage", {
                        chat_id: userId,
                        text: `📢 <b>NOTICE:</b>\n\n${messageToSend}`,
                        parse_mode: "HTML"
                    });
                    count++;
                    await sleep(100); // Spam prevent delay
                }

                await api("sendMessage", { chat_id: chatId, text: `✅ Broadcast sent to ${count} users successfully!` });
                continue;
            }
        }

        // ----------- USER PRIVATE CHAT ------------
        if (msg.chat.type === "private") {
          
          // A. Welcome Message (Start)
          if (text === "/start") {
            await api("sendChatAction", { chat_id: chatId, action: "typing" });
            
            const welcomeMsg = `
🌟 <b>Super Club-এ স্বাগতম!</b> 🌟
➖➖➖➖➖➖➖➖➖➖
প্রিয় ${name},
Super Club সাপোর্টে আপনাকে স্বাগতম। আপনার যেকোনো সমস্যা বা অভিযোগের বিস্তারিত নিচে লিখুন অথবা মেনু থেকে বাটন সিলেক্ট করুন।

আমাদের টিম খুব শীঘ্রই আপনার সাথে যোগাযোগ করবে। ধন্যবাদ! ❤️
            `;

            await api("sendMessage", {
              chat_id: chatId,
              text: welcomeMsg,
              parse_mode: "HTML",
              reply_markup: mainKeyboard // বাটন শো করবে
            });
            continue;
          }

          // B. Offline Check
          if (!INBOX_CHAT_ID) {
            await api("sendMessage", {
              chat_id: chatId,
              text: "⚠️ <i>System is currently updating. Please wait.</i>",
              parse_mode: "HTML"
            });
            continue;
          }

          // C. Forward to Admin Group
          const adminMsg = `
🔔 <b>New Support Ticket</b>
➖➖➖➖➖➖➖➖➖➖
👤 <b>User:</b> <a href="tg://user?id=${msg.from.id}">${name}</a>
🆔 <b>ID:</b> <code>${msg.from.id}</code>
➖➖➖➖➖➖➖➖➖➖
💬 <b>Subject/Message:</b>
${text}

#UID${msg.from.id}
          `;

          await api("sendMessage", {
            chat_id: INBOX_CHAT_ID,
            text: adminMsg,
            parse_mode: "HTML"
          });

          // D. Confirmation to User (Auto Delete)
          const sentMsg = await api("sendMessage", {
            chat_id: chatId,
            text: "✅ <i>আপনার মেসেজটি আমাদের টিমের কাছে পৌঁছেছে। অনুগ্রহ করে অপেক্ষা করুন।</i>",
            parse_mode: "HTML",
            reply_markup: mainKeyboard // বাটনগুলো আবার দেখাবে
          });

          // 5 সেকেন্ড পর কনফার্মেশন মেসেজ ডিলিট হবে
          if (sentMsg?.result?.message_id) {
            setTimeout(() => {
              api("deleteMessage", {
                chat_id: chatId,
                message_id: sentMsg.result.message_id
              });
            }, 5000);
          }
          continue;
        }

        // ----------- ADMIN REPLY SYSTEM ------------
        if (INBOX_CHAT_ID && chatId === INBOX_CHAT_ID && msg.reply_to_message) {
           const originalText = msg.reply_to_message.text || "";
           const match = originalText.match(/#UID(\d+)/);

           if (match) {
             const userId = match[1];
             
             // Typing effect
             await api("sendChatAction", { chat_id: userId, action: "typing" });
             await sleep(1000); 

             // Send Reply
             await api("sendMessage", {
               chat_id: userId,
               text: text 
             });
             
             // Admin Confirmation
             await api("sendMessage", {
                chat_id: INBOX_CHAT_ID,
                text: "✅ <i>Sent.</i>",
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
