# ✨ Crystal AI - Text Correction Extension

A Chrome extension that uses AI to instantly fix typos, grammar, and spelling in any text field. Powered by Groq's ultra-fast Llama models.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)

## 🚀 Features

- **Instant Correction**: Press `Shift+A` on any text input to fix it
- **Smart Model Selection**: Auto-routes between fast 8B and powerful 70B models
- **5 Worker Slots**: Use up to 5 API keys for parallel processing
- **Rate Limit Handling**: Automatic key rotation when rate limited
- **Offline Detection**: Handles network issues gracefully
- **Debug Log**: See all requests with timing and status
- **Undo Support**: Press `Shift+Q` to undo the last fix

## 📦 Installation

### Option 1: Quick Install (Pre-built)
1. Download the latest release ZIP
2. Unzip the file
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked**
6. Select the unzipped folder

### Option 2: Build from Source
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/crystal-ai-extension.git
cd crystal-ai-extension

# Install dependencies
npm install

# Build the extension
npm run build

# Load the 'dist' folder in Chrome
```

## 🔑 Setup API Key

1. Click the Crystal AI extension icon
2. Either:
   - **Use the free shared key** shown in the popup (just copy & paste)
   - **Get your own free key** at [console.groq.com/keys](https://console.groq.com/keys)
3. Click any worker slot (the gray boxes)
4. Paste your API key and click Save
5. The slot turns green when ready!

## 🎮 Usage

| Shortcut | Action |
|----------|--------|
| `Shift + A` | Fix text in current input |
| `Shift + Q` | Undo last fix |

### Supported Fields
- Text inputs (`<input type="text">`)
- Text areas (`<textarea>`)
- ContentEditable elements (like Google Docs, Notion)

## 🛠️ Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## 📁 Project Structure

```
├── background/        # Service worker (API handling)
├── content/          # Content script (keyboard shortcuts)
├── components/       # React popup UI
├── services/
│   └── worker-core/  # API client, key management, caching
├── dist/             # Built extension (load this in Chrome)
└── manifest.json     # Extension manifest
```

## ⚙️ Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS
- **Build**: Vite + CRXJS
- **AI**: Groq API (Llama 3.1 8B & 70B)
- **Storage**: Chrome Local Storage

## 🔒 Privacy

- API keys are stored **locally** in your browser only
- Text is sent to Groq for processing (not stored)
- No analytics or tracking
- No data is shared between users

## 📄 License

MIT License - feel free to use, modify, and distribute!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Open a Pull Request

---

Made with ❤️ for better writing