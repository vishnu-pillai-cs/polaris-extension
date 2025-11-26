# Polaris Chrome Extension

A virtual co-worker helping you get more done across Contentstack.

## Features

- 🎯 Popup interface with clean UI matching the Polaris design
- 🍪 Automatic cookie extraction from the current domain
- 🔄 Streaming API response handling
- 🚀 Built with Plasmo framework for Chrome extensions

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Running in Development

```bash
npm run dev
```

This will:
1. Start the Plasmo development server
2. Generate the extension in the `build/chrome-mv3-dev` directory
3. Hot-reload on changes

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-dev` directory

### Building for Production

```bash
npm run build
```

The production build will be in `build/chrome-mv3-prod`.

### Packaging

```bash
npm run package
```

This creates a `.zip` file ready for Chrome Web Store submission.

## API Configuration

The extension makes POST requests to:
- **URL**: `https://localhost:8082/agents-api/run/system-agent/dxp-agent?streamWithReasoning=true`
- **Method**: POST
- **Headers**: Includes cookies from the current domain
- **Body**: Currently empty (to be configured later)

## Permissions

The extension requires:
- `cookies`: To access cookies from the current domain
- `activeTab`: To get the current tab's URL
- `<all_urls>`: To make API calls to any domain

## Architecture

- **popup.tsx**: Main popup component with UI and API logic
- **style.css**: Styles matching the Polaris design system
- **package.json**: Dependencies and Plasmo configuration
- **tsconfig.json**: TypeScript configuration

## Stream Response Handling

The extension is prepared for streaming responses. The stream handling logic will be implemented based on your specific requirements.

## Todo

- [ ] Implement custom stream response parsing
- [ ] Add request body configuration
- [ ] Add error handling UI
- [ ] Add loading states
- [ ] Implement "See what I can do" functionality

## Notes

- The extension currently uses `https://localhost:8082` for API calls
- Cookies are automatically extracted and sent with requests
- The response area will display streaming content as it arrives
