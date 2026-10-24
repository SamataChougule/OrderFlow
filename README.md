# OrderFlow

OrderFlow is a dark, responsive trading workspace for exploring a live order book, submitting simulated orders, and following recent executions. The interface is built with React and Vite and connects to a separate backend through HTTP and WebSocket endpoints.

## Highlights

- Best bid, best ask, spread, and active-order summaries
- Price-sorted order book with order cancellation controls
- Buy and sell limit or market order form with input validation and an estimated order value
- Quick market watchlist, with the selected symbol remembered in the browser
- Live execution tape with all-symbol and selected-symbol filters
- API and WebSocket connection indicators, automatic stream reconnection, and refresh timestamps
- Responsive layout and keyboard-visible focus states
- Press `R` to refresh the order book when focus is outside a text field

## Run locally

Requirements: Node.js and a compatible OrderFlow backend listening on `http://localhost:8080`.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The development server proxies `/api` requests and `/ws` WebSocket connections to the backend on port `8080`.

To use a backend at another address, copy `.env.example` to `.env.local`, set `VITE_BACKEND_URL` to its HTTP or HTTPS origin, and restart Vite. The WebSocket proxy derives its `ws` or `wss` address from the same setting.

## Backend contract

The frontend expects these backend routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/orderbook?symbol=AAPL` | Returns `buyOrders` and `sellOrders` arrays, with each order containing `orderId`, `price`, and `quantity`. |
| `POST` | `/api/orders` | Accepts an order JSON body with `orderId`, `symbol`, `side`, `type`, `price`, and `quantity`. |
| `DELETE` | `/api/orderbook/:orderId` | Cancels an active order by ID. |
| WebSocket | `/ws/market-data` | Streams JSON trade events with `symbol`, `price`, and `quantity`. |

The UI treats market data as demonstration data. A market-order estimate uses the current best opposing quote when one is available; actual execution price and fees are determined by the backend.

## Useful scripts

```bash
npm run dev      # Start the Vite development server
npm run build    # Create a production build in dist/
npm run preview  # Preview the production build locally
npm run lint     # Run ESLint
```

## Tech stack

- React 19
- Vite
- Plain CSS
- HTTP `fetch` and the browser WebSocket API
