const TOKEN = process.env.BOT_TOKEN;

// 1. Check Token
if (!TOKEN) {
  console.error("❌ Error: BOT_TOKEN is missing!");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// ⚠️ আপনার গ্রুপের আইডি এখানে বসান (Render এ ২৪ ঘণ্টা রানিং রাখার জন্য এটা জরুরি)
// উদাহরণ: const MAIN_GROUP_ID = -100123456789;
const MAIN_GROUP_ID = null; 

// ব্রডকাস্ট মেমোরি
const userList = new Set(); 

// --- KEEP ALIVE SERVER (Render 24/7) ---
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Super Club Bot is Running...');
});
server.listen(process.env.PORT || 8080);
// ----------------------------------------

console.log("💎 Super Club Bot Started Successfully...");

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

// 3. বাটনগুলোর নাম (Variables) - যেন ভুল না হয়
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

// 4. Main Loop
async function poll() {
  let offset = 0;
  // কোডে আইডি না বসালে টেম্পোরারি ভেরিয়েবল ব্যবহার হবে
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

        // ইউজার লিস্টে সেভ (Broadcast এর জন্য)
        if (msg.chat.type === "private") userList.add(chatId);

        // =============================================
        // 🏢 GROUP MANAGEMENT (ADMIN SIDE)
        // =============================================
        if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            
            // সেটআপ কমান্ড
            if (text === "/setgroup") {
                activeGroupId = chatId;
                await api("sendMessage", {
                    chat_id: chatId,
                    text: `<b>💎 Super Club Support Connected!</b>\n\n🆔 Group ID: <code>${chatId}</code>\n(⚠️ কপি করে কোডের ১০ নম্বর লাইনে বসিয়ে দিন)`,
                    parse_mode: "HTML"
                });
                continue;
            }

            // ব্রডকাস্ট কমান্ড
            if (text.startsWith("/broadcast")) {
                const noticeText = text.replace("/broadcast", "").trim();
                if (!noticeText) continue;

                await api("sendMessage", { chat_id: chatId, text: `📢 Sending notice to ${userList.size} users...` });

                for (const userId of userList) {
                    await api("sendMessage", {
                        chat_id: userId,
                        text: `📢 <b>OFFICIAL NOTICE</b>\n━━━━━━━━━━━━━━━━\n\n${noticeText}\n\n━━━━━━━━━━━━━━━━\n<i>Authorized by Super Club Admin</i>`,
                        parse_mode: "HTML"
                    });
                    await sleep(50);
                }
                await api("sendMessage", { chat_id: chatId, text: "✅ Broadcast Complete." });
                continue;
            }
        }

        // =============================================
        // 👤 USER PRIVATE CHAT (CLIENT SIDE)
        // =============================================
        if (msg.chat.type === "private") {
          
          // A. Start Command
          if (text === "/start") {
            await api("sendChatAction", { chat_id: chatId, action: "typing" });
            
            const welcomeMsg = `
🌟 <b>WELCOME TO SUPER CLUB</b> 🌟
━━━━━━━━━━━━━━━━━━━━━━
প্রিয় ${name},
আমাদের প্রিমিয়াম সাপোর্টে আপনাকে স্বাগতম।

নিচের মেনু থেকে আপনার সমস্যার বিষয়টি সিলেক্ট করুন। আমাদের দক্ষ এজেন্টরা ২৪/৭ আপনার সেবায় নিয়োজিত। ❤️

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

          // B. Offline Check
          if (!activeGroupId) {
            await api("sendMessage", {
              chat_id: chatId,
              text: "⚠️ <i>System Maintenance Mode. Please try again later.</i>",
              parse_mode: "HTML"
            });
            continue;
          }

          // C. AUTO-REPLY LOGIC (User Side) & TAGGING (Admin Side)
          let categoryTag = "💬 <b>User Message:</b>"; // সাধারণ মেসেজ হলে
          let isButton = false;

          // ১. ডিপোজিট বাটন
          if (text === CMD_DEPOSIT) {
              isButton = true;
              categoryTag = `💳 <b>Category:</b> ${CMD_DEPOSIT}`; // গ্রুপে এভাবে যাবে
              await api("sendMessage", {
                  chat_id: chatId,
                  text: "💳 <b>ডিপোজিট সমস্যা?</b>\n\nঅনুগ্রহ করে নিচে তথ্যগুলো দিন:\n1. আপনার গেম আইডি\n2. ট্রানজেকশন আইডি (TrxID)\n3. পেমেন্টের স্ক্রিনশট",
                  parse_mode: "HTML"
              });
          } 
          // ২. উইথড্র বাটন
          else if (text === CMD_WITHDRAW) {
              isButton = true;
              categoryTag = `💰 <b>Category:</b> ${CMD_WITHDRAW}`; // গ্রুপে এভাবে যাবে
              await api("sendMessage", {
                  chat_id: chatId,
                  text: "💰 <b>উইথড্র সমস্যা?</b>\n\nঅনুগ্রহ করে নিচে তথ্যগুলো দিন:\n1. আপনার গেম আইডি\n2. কত টাকা উইথড্র দিয়েছেন?\n3. কোন মেথডে (Bkash/Nagad) দিয়েছেন?",
                  parse_mode: "HTML"
              });
          }
          // ৩. গেম আইডি বাটন
          else if (text === CMD_GAMEID) {
              isButton = true;
              categoryTag = `👣 <b>Category:</b> ${CMD_GAMEID}`;
              await api("sendMessage", {
                  chat_id: chatId,
                  text: "👣 <b>গেম আইডি সমস্যা?</b>\n\nআপনার সঠিক গেম আইডিটি লিখে পাঠান এবং সমস্যার স্ক্রিনশট দিন।",
                  parse_mode: "HTML"
              });
          }
          // ৪. অন্যান্য বাটন
          else if (text === CMD_OTHERS) {
              isButton = true;
              categoryTag = `ℹ️ <b>Category:</b> ${CMD_OTHERS}`;
              await api("sendMessage", {
                  chat_id: chatId,
                  text: "ℹ️ <b>অন্যান্য সাহায্য</b>\n\nআপনার সমস্যাটি বিস্তারিত লিখে জানান। আমাদের এজেন্ট শীঘ্রই রিপ্লাই দিবে।",
                  parse_mode: "HTML"
              });
          }

          // D. Forward to Admin Group (এখানেই গ্রুপে ফুল টেক্সট যাবে)
          const adminMsg = `
💎 <b>NEW TICKET</b> | #UID${msg.from.id}
━━━━━━━━━━━━━━━━
👤 <b>User:</b> <a href="tg://user?id=${msg.from.id}">${name}</a>
🆔 <b>ID:</b> <code>${msg.from.id}</code>
━━━━━━━━━━━━━━━━
${categoryTag}
${isButton ? "" : text} 
          `;
          // isButton ? "" : text -> মানে বাটন চাপলে মেসেজ বডিতে টেক্সট রিপিট হবে না, শুধু ক্যাটাগরি দেখাবে।
          // আর যদি ইউজার নিজের হাতে কিছু লিখে, তাহলে সেটা দেখাবে।

          await api("sendMessage", {
            chat_id: activeGroupId,
            text: adminMsg,
            parse_mode: "HTML"
          });

          // E. Confirmation (সাধারণ মেসেজের জন্য)
          if (!isButton) {
              const sentMsg = await api("sendMessage", {
                chat_id: chatId,
                text: "✅ <i>মেসেজ রিসিভ হয়েছে। অপেক্ষা করুন।</i>",
                parse_mode: "HTML",
                reply_markup: mainKeyboard
              });
              
              if (sentMsg?.result?.message_id) {
                setTimeout(() => {
                  api("deleteMessage", { chat_id: chatId, message_id: sentMsg.result.message_id });
                }, 5000);
              }
          }
          continue;
        }

        // =============================================
        // 👨‍💻 ADMIN REPLY (ANONYMOUS)
        // =============================================
        if (activeGroupId && chatId === activeGroupId && msg.reply_to_message) {
           const originalText = msg.reply_to_message.text || "";
           const match = originalText.match(/#UID(\d+)/);

           if (match) {
             const userId = match[1];
             
             await api("sendChatAction", { chat_id: userId, action: "typing" });
             await sleep(800); 

             await api("sendMessage", {
               chat_id: userId,
               text: text
             });
             
             await api("sendMessage", {
                chat_id: activeGroupId,
                text: "✅ <i>Reply Sent.</i>",
                parse_mode: "HTML"
             });
           }
        }
      }
    } catch (err) {
      console.error("🔥 System Error:", err.message);
      await sleep(3000);
    }
  }
}

poll();
