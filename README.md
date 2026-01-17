# Instagram Protocol Analysis

A comprehensive reverse engineering study of Instagram's private mobile API through network traffic analysis and protocol examination. This project documents the request/response structures, authentication mechanisms, and communication protocols used by the Instagram mobile application.

## 🎯 Project Goals

1. **Learn reverse engineering** - Understand how to analyze mobile app network traffic
2. **Document Instagram's private API** - Map out endpoints, headers, and authentication
3. **Build a minimal CLI client** - Apply learnings to create a functional messaging client
4. **Reduce doomscrolling** - Create a distraction-free way to message friends

## 📁 Project Structure

```
instagram-protocol-analysis/
├── docs/
│   ├── api-endpoints.md         # Documented API endpoints
│   ├── headers.md               # Required headers & their purposes
│   ├── mqtt-protocol.md         # Notes on MQTT real-time messaging
│   ├── setup-guide.md           # Environment setup instructions
│   └── authentication.md        # Auth flow documentation
├── captures/
│   ├── instagram_capture.flow   # Raw mitmproxy captures
│   └── exported/                # Exported requests (readable format)
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── auth/                    # Authentication module
│   ├── messaging/               # Direct messaging module
│   └── utils/                   # Helper utilities
├── research/
│   ├── library-analysis.md      # Notes from studying existing libraries
│   └── detection-mechanisms.md  # Instagram's anti-bot detection
├── scripts/
│   └── export-flow.py           # Script to export mitmproxy flows
└── package.json
```

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- (For traffic capture) Android Studio, mitmproxy

### Installation
```bash
git clone https://github.com/AlexsVargas-CS/Instagram-protocol-analysis.git
cd Instagram-protocol-analysis
npm install
```

### Development
```bash
npm run dev      # Run in development mode
npm run build    # Build for production
npm run test     # Run tests
```

## 📚 Documentation

- [Setup Guide](docs/setup-guide.md) - How to set up the traffic interception environment
- [API Endpoints](docs/api-endpoints.md) - Discovered API endpoints and their usage
- [Headers Reference](docs/headers.md) - Required headers for API requests
- [MQTT Protocol](docs/mqtt-protocol.md) - Real-time messaging protocol analysis
- [Authentication](docs/authentication.md) - Login flow and session management

## 🔬 Research Notes

This project builds upon the work of several open-source projects:
- [instagram-private-api](https://github.com/dilame/instagram-private-api) - Node.js Instagram API
- [instagram_mqtt](https://github.com/Nerixyz/instagram_mqtt) - MQTT real-time support
- [instagram-cli](https://github.com/supreme-gg-gg/instagram-cli) - Terminal UI client

## ⚠️ Disclaimer

This project is for **educational purposes only**. It is not affiliated with, authorized, or endorsed by Instagram or Meta. Using this code may violate Instagram's Terms of Service. Use at your own risk.

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

## 🤝 Contributing

This is a personal learning project, but suggestions and discussions are welcome! Feel free to open an issue.

---

*Part of my cybersecurity studies at Cal Poly San Luis Obispo*
