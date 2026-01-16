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

    // প্রতিটি ছবির সাথে নাম এবং UID যুক্ত করা
    const mediaArray = messages.map(msg => {
        // ⚠️ এই ফরম্যাটটি চেঞ্জ করবেন না, রিপ্লাই কাজ করার জন্য এটা জরুরি
        const caption = `👤 <b>${name}</b> | #UID${chatId}`;
        
        if (msg.photo) {
            return {
                type: 'photo',
                media: msg.photo[msg.photo.length - 1].file_id,
                caption: caption,
                parse_mode: 'HTML'
            };
        } else if (msg.video) {
            return {
                type: 'video',
                media: msg.video.file_id,
                caption: caption,
                parse_mode: 'HTML'
            };
        }
        return null;
    }).filter(m => m !== null);

    if (mediaArray.length > 0) {
        await api("sendMediaGroup", {
            chat_id: MAIN_GROUP_ID,
            media: mediaArray
        });
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
        // 👤 ইউজার সাইড (Auto Reply + Album)
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

          // --- SINGLE MESSAGE LOGIC (Simple & Fix Reply) ---
          
          // ১. টেক্সট মেসেজ
          if (text && !msg.photo && !msg.video && !msg.voice && !msg.document) {
              const userLink = `<a href="tg://user?id=${chatId}">${name}</a>`;
              // ⚠️ #UID এখন দৃশ্যমান থাকবে যাতে রিপ্লাই কাজ করে
              const prettyMsg = `👤 <b>${userLink}:</b> ${text}\n\n#UID${chatId}`;
              
              await api("sendMessage", {
                  chat_id: activeGroupId,
                  text: prettyMsg,
                  parse_mode: "HTML"
              });
          } 
          // ২. সিঙ্গেল মিডিয়া
          else {
              const userLink = `<a href="tg://user?id=${chatId}">${name}</a>`;
              
              if (msg.voice || msg.sticker) {
                   await api("copyMessage", { chat_id: activeGroupId, from_chat_id: chatId, message_id: msg.message_id });
                   // রিপ্লাই ট্যাগ আলাদা পাঠানো (ভয়েসের সাথে ক্যাপশন হয় না তাই)
                   await api("sendMessage", { chat_id: activeGroupId, text: `👤 <b>${userLink}</b> 👆 Media\n#UID${chatId}`, parse_mode: "HTML" });
              } else {
                   // ছবি বা ভিডিও
                   const mediaCaption = (msg.caption || "") + `\n\n👤 <b>${userLink}</b> | #UID${chatId}`;
                   await api("copyMessage", {
                       chat_id: activeGroupId,
                       from_chat_id: chatId,
                       message_id: msg.message_id,
                       caption: mediaCaption,
                       parse_mode: "HTML"
                   });
              }
          }
          continue;
        }

        // ==============================
        // 👨‍💻 অ্যাডমিন রিপ্লাই (FIXED)
        // ==============================
        if (activeGroupId && chatId === activeGroupId && msg.reply_to_message) {
           // টেক্সট বা ক্যাপশন চেক করা
           let originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
           
           // UID খোঁজা (Regex)
           const match = originalText.match(/#UID(\d+)/);

           if (match) {
             const userId = match[1];
             
             // কপি মেসেজ (যাতে ছবি/স্টিকার/টেক্সট সব যায়)
             await api("copyMessage", {
                 chat_id: userId,
                 from_chat_id: chatId,
                 message_id: msg.message_id
             });
             
             // রিপ্লাই কনফার্মেশন (বোঝার সুবিধার্থে)
             await api("sendMessage", { chat_id: activeGroupId, text: "✅ <i>Sent.</i>", parse_mode: "HTML" });
           } else {
             // যদি UID না পায় (মানে হয়তো ভয়েসের ওপর রিপ্লাই দিয়েছেন যেটাতে ট্যাগ নেই)
             // ভয়েস মেসেজের ক্ষেত্রে "👤 Name... #UID" লেখা ছোট্ট মেসেজটার ওপর রিপ্লাই দিতে হবে
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
