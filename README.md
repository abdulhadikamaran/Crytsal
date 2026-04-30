# ✦ Crystal AI — The Invisible Editor

**Stop fixing typos. Let AI do it in under 500ms.**  
Crystal is an open-source, completely free Chrome extension that uses Groq's lightning-fast AI to instantly correct your writing anywhere on the web.

🌐 **[Visit the Website](https://abdulhadikamaran.github.io/Crystal/)** (or wherever you host the landing page)  
⚡ **[Download the Latest Release](https://github.com/abdulhadikamaran/Crytsal/releases/tag/v1.0.0)**

---

## 🤔 Why Crystal over Grammarly?

Grammarly is great, but it has problems: it puts distracting red squiggly lines everywhere, slows down your browser, requires an expensive monthly subscription for "advanced" AI rewriting, and sends all your writing to their proprietary servers.

**Crystal takes a completely different approach:**

1. **Zero Distractions (No UI):** No popups, no squiggly lines, no floating bubbles. Crystal stays invisible until the exact moment you need it.
2. **One-Press Magic:** Don't click through suggestions one by one. Just press `Shift + A` and your entire paragraph is instantly fixed.
3. **100% Free & Open Source:** It uses the exact same level of AI as premium subscriptions (Llama 3.1 70B), but because you plug in your own free Groq API key, you never pay a subscription fee.
4. **Absolute Privacy:** Crystal has no database. No telemetry. Your API keys are stored locally in your browser, and your text goes straight to Groq via an encrypted connection.
5. **Insanely Fast:** Powered by Groq's specialized AI hardware, corrections return in an average of ~500ms.

---

## 🚀 Features

- **Instant Correction:** Press `Shift+A` on any text input, textarea, or content-editable div (like Notion or Google Docs).
- **Instant Undo:** Not happy? Press `Shift+Q` to immediately revert to your original text.
- **Smart Key Rotation:** Enter up to 5 free Groq API keys. Crystal automatically balances the load and rotates them if one gets rate-limited.
- **Context-Aware:** Uses a fast 8B model for short typos, and a massive 70B model for complex, technical paragraphs.
- **Selection Mode:** Highlight just a single messy sentence, and Crystal will only fix the highlighted text.

---

## 📦 Installation (Takes 60 Seconds)

Because Crystal gives you direct, unmonitored access to AI models, it is currently available via GitHub releases.

1. Go to the [Releases page](https://github.com/abdulhadikamaran/Crytsal/releases/tag/v1.0.0) and download `crystal-v1.0.0.zip`.
2. Unzip the file on your computer.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the folder you just unzipped.
6. Click the Crystal icon in your Chrome toolbar, paste in a free key from [console.groq.com/keys](https://console.groq.com/keys), and you're done!

---

## 🛠️ Development

Want to build on top of Crystal?

```bash
# Clone the repository
git clone https://github.com/abdulhadikamaran/Crytsal.git
cd Crytsal

# Install dependencies
npm install

# Run the development server (auto-reloads extension)
npm run dev

# Build the final production version
npm run build
```

### 📁 Architecture
- `background/` - The Service Worker that handles API calls, circuit breaking, and load balancing.
- `content/` - Vanilla JS content script for high-performance DOM manipulation and keyboard listeners.
- `components/` - React 19 UI for the extension popup and settings.
- `services/worker-core/` - The brain: API client, key management, and caching layer.

---

## 🔒 Privacy Guarantee

- **No Servers:** We do not host any backend servers.
- **Local Storage:** API keys are saved strictly to `chrome.storage.local`.
- **Direct Connection:** When you press `Shift+A`, the request goes directly from your local browser to Groq's API endpoint. 
- **No Tracking:** Zero analytics. Read the code yourself to verify!

---

## 📄 License
MIT License - feel free to use, fork, modify, and distribute!

Made with ❤️ for better writing.