# Embeddable Donation Button Example

This example demonstrates how to create a simple embeddable donation widget that interacts with a Tributary split on the Stellar network using the `tributary-sdk`.

## How it Works

The widget is a plain HTML/JavaScript application. It searches the page for a specific container element (e.g., `<div id="tributary-donation-widget" data-split-id="1"></div>`) and mounts a "Donate" button inside it.

When the user clicks "Donate", the widget:
1. Connects to the user's [Freighter](https://www.freighter.app/) wallet.
2. Initializes the Tributary client using the `tributary-sdk`.
3. Builds a `pay` transaction for the specified split ID.
4. Prompts the user to sign the transaction via Freighter.
5. Submits the transaction to the network.

## Usage

To embed this widget on your own page, you need to:

1. Include a container element where the widget should render, specifying the `split-id`:
   ```html
   <div id="tributary-donation-widget" data-split-id="1" data-network="testnet"></div>
   ```

2. Load the bundled JavaScript for the widget on your page.

## Running Locally

To run this example locally:

1. Ensure you have Node.js installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the displayed local URL in your browser with the Freighter extension installed.

## Customization

You can modify `src/main.ts` to support different tokens (e.g., USDC), handle mainnet interactions by changing the `rpcUrl` and `networkConfig`, or restyle the widget to match your brand's aesthetics.
