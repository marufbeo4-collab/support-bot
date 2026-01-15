const TOKEN = process.env.BOT_TOKEN; // অথবা টেস্ট করার জন্য এখানে সরাসরি টোকেন দিতে পারেন: const TOKEN = "YOUR_TOKEN_HERE";

if (!TOKEN) {
  console.error("❌ BOT_TOKEN missing. Please set it using $env:BOT_TOKEN='...'");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
let INBOX_CHAT_ID = null;

console.log("✅ Clean Support Bot Running...");
console.log("ℹ️  Waiting for /setgroup command in your Telegram Group...");

async function send(method, data) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  } catch (e) {
    console.error("⚠️ Send Error:", e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll() {
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const data = await res.json();

      // সমস্যা থাকলে কনসোলে দেখাবে
      if (!data.ok) {
        console.error("❌ Telegram API Error:", data);
        await sleep(5000); // এরর আসলে ৫ সেকেন্ড অপেক্ষা করবে
        continue;
      }

      for (const u of data.result) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg) continue;

        if (msg.from?.is_bot) continue; // anti-duplicate

        // লগ - বট কি মেসেজ পাচ্ছে তা দেখার জন্য
        console.log(`📩 Message received from ${msg.from.first_name}: ${msg.text}`);

        // ১. গ্রুপ সেটআপ কমান্ড (/setgroup)
        if (msg.text === "/setgroup" && (msg.chat.type === "group" || msg.chat.type === "supergroup")) {
          INBOX_CHAT_ID = msg.chat.id;
          console.log("✅ Group Connected ID:", INBOX_CHAT_ID);
          await send("sendMessage", {
            chat_id: msg.chat.id,
            text: "✅ Customer support inbox connected! I will forward messages here.",
          });
          continue;
        }

        // ২. ইউজার প্রাইভেট মেসেজ দিলে -> গ্রুপে যাবে
        if (msg.chat.type === "private") {
          if (!INBOX_CHAT_ID) {
            await send("sendMessage", {
              chat_id: msg.chat.id,
              text: "⚠️ Customer support is not online right now (Group not connected).",
            });
            continue;
          }

          // গ্রুপে ফরোয়ার্ড করা
          await send("sendMessage", {
            chat_id: INBOX_CHAT_ID,
            text: `👤 ${msg.from.first_name} (ID: ${msg.from.id})\n\n💬 ${msg.text}\n\n#UID:${msg.from.id}`,
          });

          const confirm = await send("sendMessage", {
            chat_id: msg.chat.id,
            text: "📨 Message sent to support team.",
          });

          // কনফার্মেশন মেসেজটি ২ সেকেন্ড পর ডিলিট হবে
          if (confirm && confirm.ok) {
            await sleep(2000);
            await send("deleteMessage", {
              chat_id: msg.chat.id,
              message_id: confirm.result.message_id,
            });
          }
          continue;
        }

        // ৩. গ্রুপ থেকে রিপ্লাই দিলে -> ইউজারের কাছে যাবে
        if (
          INBOX_CHAT_ID &&
          msg.chat.id === INBOX_CHAT_ID &&
          msg.reply_to_message?.text
        ) {
          const m = msg.reply_to_message.text.match(/#UID:(\d+)/);
          
          if (m) {
            const userId = m[1];
            await send("sendMessage", {
              chat_id: userId,
              text: msg.text,
            });
            console.log(`📤 Reply sent to user ${userId}`);
          }
        }
      }
    } catch (error) {
      console.error("❌ Polling Error:", error.message);
      await sleep(2000);
    }
  }
}

poll();