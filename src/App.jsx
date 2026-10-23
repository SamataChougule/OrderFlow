import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const initialOrder = { symbol: "AAPL", side: "BUY", type: "LIMIT", price: "", quantity: "" };
const watchlist = ["AAPL", "MSFT", "NVDA", "TSLA"];
const isValidSymbol = (value) => /^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(value.trim().toUpperCase());
const money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const savedSymbol = () => {
  try { return window.localStorage.getItem("orderflow.market")?.trim().toUpperCase() || "AAPL"; }
  catch { return "AAPL"; }
};

function App() {
  const [symbol, setSymbol] = useState(savedSymbol);
  const [order, setOrder] = useState(() => ({ ...initialOrder, symbol: savedSymbol() }));
  const [book, setBook] = useState({ buyOrders: [], sellOrders: [] });
  const [trades, setTrades] = useState([]);
  const [tapePaused, setTapePaused] = useState(false);
  const [queuedTradeCount, setQueuedTradeCount] = useState(0);
  const [showAllTrades, setShowAllTrades] = useState(true);
  const [apiConnected, setApiConnected] = useState(false);
  const [apiError, setApiError] = useState("");
  const [bookLoading, setBookLoading] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const requestId = useRef(0);
  const tapePausedRef = useRef(false);
  const queuedTrades = useRef([]);

  const notify = useCallback((message, kind = "success") => {
    setToast({ message, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const dismissToast = (event) => {
      if (event.key === "Escape") {
        window.clearTimeout(toastTimer.current);
        setToast(null);
      }
    };
    window.addEventListener("keydown", dismissToast);
    return () => window.removeEventListener("keydown", dismissToast);
  }, []);

  useEffect(() => {
    tapePausedRef.current = tapePaused;
    if (!tapePaused && queuedTrades.current.length) {
      const queued = queuedTrades.current;
      queuedTrades.current = [];
      setQueuedTradeCount(0);
      setTrades((current) => [...queued, ...current].slice(0, 30));
    }
  }, [tapePaused]);

  useEffect(() => {
    try { window.localStorage.setItem("orderflow.market", symbol); }
    catch { /* Market selection remains available if storage is disabled. */ }
  }, [symbol]);

  const loadOrderBook = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setBookLoading(true);
    try {
      const response = await fetch(`/api/orderbook?symbol=${encodeURIComponent(symbol)}`);
      if (!response.ok) throw new Error(`Order book request failed (${response.status})`);
      const data = await response.json();
      if (currentRequest !== requestId.current) return;
      setBook({ buyOrders: data.buyOrders || [], sellOrders: data.sellOrders || [] });
      setApiConnected(true);
      setApiError("");
      setLastUpdated(new Date());
    } catch (error) {
      if (currentRequest === requestId.current) {
        setApiConnected(false);
        setApiError(error.message || "Could not reach the OrderFlow backend.");
      }
    } finally {
      if (currentRequest === requestId.current) setBookLoading(false);
    }
  }, [symbol]);

  const refreshOrderBook = async () => {
    setRefreshing(true);
    await loadOrderBook();
    setRefreshing(false);
  };

  useEffect(() => {
    setBook({ buyOrders: [], sellOrders: [] });
    const initialLoad = window.setTimeout(loadOrderBook, 0);
    const interval = window.setInterval(loadOrderBook, 2500);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(interval); };
  }, [loadOrderBook]);

  useEffect(() => {
    let socket;
    let retryTimer;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${window.location.host}/ws/market-data`);
      socket.onopen = () => setStreamConnected(true);
      socket.onmessage = ({ data }) => {
        try {
          const trade = JSON.parse(data);
          if (trade.symbol && Number.isFinite(Number(trade.price))) {
            const incoming = { ...trade, receivedAt: Date.now(), key: `${Date.now()}-${Math.random()}` };
            if (tapePausedRef.current) {
              queuedTrades.current = [incoming, ...queuedTrades.current].slice(0, 30);
              setQueuedTradeCount(queuedTrades.current.length);
            }
            else setTrades((current) => [incoming, ...current].slice(0, 30));
          }
        } catch { /* The server's initial connection notice is informational. */ }
      };
      socket.onclose = () => {
        setStreamConnected(false);
        if (!disposed) retryTimer = window.setTimeout(connect, 2200);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { disposed = true; window.clearTimeout(retryTimer); socket?.close(); };
  }, []);

  const sortedBuyOrders = useMemo(
    () => [...book.buyOrders].sort((left, right) => Number(right.price) - Number(left.price)),
    [book.buyOrders],
  );
  const sortedSellOrders = useMemo(
    () => [...book.sellOrders].sort((left, right) => Number(left.price) - Number(right.price)),
    [book.sellOrders],
  );
  const bestBid = sortedBuyOrders[0];
  const bestAsk = sortedSellOrders[0];
  const spread = bestBid && bestAsk ? Number(bestAsk.price) - Number(bestBid.price) : null;
  const activeCount = book.buyOrders.length + book.sellOrders.length;
  const orderRows = useMemo(() => [
    ...sortedSellOrders.map((item) => ({ ...item, side: "SELL" })),
    ...sortedBuyOrders.map((item) => ({ ...item, side: "BUY" })),
  ], [sortedBuyOrders, sortedSellOrders]);
  const visibleTrades = useMemo(
    () => showAllTrades ? trades : trades.filter((trade) => trade.symbol.toUpperCase() === symbol.toUpperCase()),
    [showAllTrades, trades, symbol],
  );
  const referencePrice = order.type === "LIMIT"
    ? Number(order.price)
    : Number(order.side === "BUY" ? bestAsk?.price : bestBid?.price);
  const estimatedValue = Number(order.quantity) > 0 && Number.isFinite(referencePrice) && referencePrice > 0
    ? Number(order.quantity) * referencePrice
    : null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setOrder((current) => ({ ...current, [name]: name === "symbol" ? value.toUpperCase() : value }));
    if (name === "symbol") setSymbol(value.toUpperCase());
  };

  const selectSymbol = (nextSymbol) => {
    setSymbol(nextSymbol);
    setOrder((current) => ({ ...current, symbol: nextSymbol }));
  };

  const useBestLimitPrice = () => {
    const price = order.side === "BUY" ? bestBid?.price : bestAsk?.price;
    if (price !== undefined) setOrder((current) => ({ ...current, price: String(price) }));
  };

  const resetOrderForm = () => setOrder({ ...initialOrder, symbol });

  const selectBookPrice = (side, price) => {
    setOrder((current) => ({ ...current, symbol, side, type: "LIMIT", price: String(price) }));
  };

  const exportTrades = () => {
    if (visibleTrades.length === 0) return;
    const escapeCsv = (value) => {
      const text = String(value ?? "");
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["Time", "Symbol", "Price", "Quantity", "Notional"],
      ...visibleTrades.map((trade) => [new Date(trade.receivedAt).toISOString(), trade.symbol, trade.price, trade.quantity, Number(trade.price) * Number(trade.quantity)]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    const marketLabel = showAllTrades ? "all-symbols" : symbol.toLowerCase();
    link.download = `orderflow-trades-${marketLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const placeOrder = async (event) => {
    event.preventDefault();
    const quantity = Number(order.quantity);
    const price = Number(order.price);
    if (!isValidSymbol(order.symbol)) {
      notify("Use 1–10 letters, numbers, dots, or dashes for the market symbol.", "error");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || (order.type === "LIMIT" && (!Number.isFinite(price) || price <= 0))) {
      notify("Enter a whole share quantity and a valid limit price.", "error");
      return;
    }
    setSubmitting(true);
    const orderData = {
      orderId: Date.now(), symbol: order.symbol.trim(), side: order.side, type: order.type,
      price: order.type === "LIMIT" ? price : 0, quantity,
    };
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderData),
      });
      if (!response.ok) {
        let message = `Could not place order (${response.status})`;
        try { message = (await response.json()).error || message; } catch { /* Keep fallback. */ }
        throw new Error(message);
      }
      notify(`${order.side} ${order.quantity} ${order.symbol} order accepted`);
      setOrder((current) => ({ ...initialOrder, symbol: current.symbol, side: current.side, type: current.type }));
      window.setTimeout(loadOrderBook, 350);
    } catch (error) {
      notify(error.message || "Order could not be sent. Check the backend connection.", "error");
    } finally { setSubmitting(false); }
  };

  const cancelOrder = async (orderId) => {
    setCancelling(orderId);
    try {
      const response = await fetch(`/api/orderbook/${orderId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(response.status === 404 ? "Order was already filled or removed" : `Cancel failed (${response.status})`);
      }
      notify(`Order #${orderId} cancelled`);
      loadOrderBook();
    } catch (error) { notify(error.message, "error"); }
    finally { setCancelling(null); }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="OrderFlow home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>order<span className="brand-accent">flow</span><small>MARKET TERMINAL</small></span>
        </a>
        <div className="topbar-right">
          <label className="symbol-picker"><span>MARKET</span><input aria-label="Market symbol" value={symbol} maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9.-]{0,9}" onChange={handleChange} name="symbol" /></label>
          <div className="connection" role="status" aria-live="polite" aria-label={`Order book API ${apiConnected ? "connected" : "offline"}`}><i aria-hidden="true" className={apiConnected ? "connected" : ""} />API {apiConnected ? "CONNECTED" : "OFFLINE"}</div>
          <div className="connection" role="status" aria-live="polite" aria-label={`Market data stream ${streamConnected ? "live" : "reconnecting"}`}><i aria-hidden="true" className={streamConnected ? "connected" : ""} />STREAM {streamConnected ? "LIVE" : "RECONNECTING"}</div>
        </div>
      </header>

      <main id="top" className="workspace">
        <div className="page-heading"><div><div className="eyebrow">TRADING WORKSPACE <span> / </span> {symbol || "MARKET"}</div><h1>Market overview</h1><p>Live order flow, market depth, and execution activity.</p></div><div className="refresh-group"><span className="last-updated" aria-live="polite">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting for market data"}</span><button className={`refresh-button ${refreshing ? "refreshing" : ""}`} onClick={refreshOrderBook} disabled={refreshing} aria-label="Refresh order book"><span>↻</span>{refreshing ? "Refreshing" : "Refresh"}</button></div></div>

        <nav className="watchlist" aria-label="Quick market selection">{watchlist.map((item) => <button key={item} type="button" className={symbol === item ? "active" : ""} aria-pressed={symbol === item} onClick={() => selectSymbol(item)}>{item}</button>)}</nav>

        <section className="metric-grid" aria-label="Market summary">
          <Metric label="BEST BID" value={bestBid ? money(bestBid.price) : "—"} detail={bestBid ? `${bestBid.quantity} shares` : "No buy orders"} tone="green" />
          <Metric label="BEST ASK" value={bestAsk ? money(bestAsk.price) : "—"} detail={bestAsk ? `${bestAsk.quantity} shares` : "No sell orders"} tone="red" />
          <Metric label="SPREAD" value={spread === null ? "—" : money(spread)} detail={spread === null ? "Awaiting both sides" : "Bid / ask difference"} />
          <Metric label="ACTIVE ORDERS" value={activeCount.toLocaleString()} detail={`${sortedBuyOrders.length} bids · ${sortedSellOrders.length} asks`} />
        </section>

        <div className="main-grid">
          <section className="panel order-panel">
            <div className="panel-heading"><div><div className="eyebrow">EXECUTION</div><h2>Place an order</h2></div><button className="reset-order" type="button" onClick={resetOrderForm}>Reset form</button></div>
            <form className="order-form" onSubmit={placeOrder}>
              <div className="field"><label htmlFor="order-symbol">Instrument</label><input id="order-symbol" name="symbol" value={order.symbol} onChange={handleChange} maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9.-]{0,9}" title="Use 1–10 letters, numbers, dots, or dashes." required autoComplete="off" /></div>
              <div className="field"><label>Direction</label><div className="segmented"><button type="button" aria-pressed={order.side === "BUY"} className={order.side === "BUY" ? "selected buy-selected" : ""} onClick={() => setOrder((current) => ({ ...current, side: "BUY" }))}>Buy</button><button type="button" aria-pressed={order.side === "SELL"} className={order.side === "SELL" ? "selected sell-selected" : ""} onClick={() => setOrder((current) => ({ ...current, side: "SELL" }))}>Sell</button></div></div>
              <div className="field"><label htmlFor="order-type">Order type</label><select id="order-type" name="type" value={order.type} onChange={handleChange}><option value="LIMIT">Limit</option><option value="MARKET">Market</option></select></div>
              <div className="field"><label htmlFor="order-quantity">Quantity</label><input id="order-quantity" name="quantity" type="number" min="1" step="1" placeholder="0" value={order.quantity} onChange={handleChange} required /><div className="quantity-presets" aria-label="Quick quantity selection">{[10, 25, 100].map((quantity) => <button key={quantity} type="button" onClick={() => setOrder((current) => ({ ...current, quantity: String(quantity) }))}>{quantity}</button>)}</div></div>
              {order.type === "LIMIT" && <div className="field"><label htmlFor="order-price">Limit price <button className="price-fill" type="button" onClick={useBestLimitPrice} disabled={order.side === "BUY" ? !bestBid : !bestAsk}>Use best {order.side === "BUY" ? "bid" : "ask"}</button></label><div className="price-input"><span>$</span><input id="order-price" name="price" type="number" min="0.01" step="0.01" placeholder="0.00" value={order.price} onChange={handleChange} required /></div></div>}
              {order.type === "MARKET" && <div className="market-note"><span>◎</span><span>Market orders execute against the best available price.</span></div>}
              <div className="order-estimate" aria-live="polite"><span>ESTIMATED ORDER VALUE</span><strong>{estimatedValue === null ? "—" : money(estimatedValue)}</strong><small>{order.type === "LIMIT" ? "Quantity × limit price · before fees" : estimatedValue === null ? `No ${order.side === "BUY" ? "ask" : "bid"} available to estimate` : `Based on current best ${order.side === "BUY" ? "ask" : "bid"} · before fees`}</small></div>
              <button className={`submit-button ${order.side === "SELL" ? "submit-sell" : ""}`} type="submit" disabled={submitting || !apiConnected}>{submitting ? "Sending order…" : `${order.side === "BUY" ? "Buy" : "Sell"} ${order.symbol || "shares"}` }<span>→</span></button>
            </form>
          </section>

          <section className="panel book-panel">
            <div className="panel-heading"><div><div className="eyebrow">LIQUIDITY</div><h2>Order book <span className="heading-symbol">{symbol}</span></h2></div><span className="live-pill"><i /> LIVE</span></div>
            {bookLoading && orderRows.length === 0 ? <EmptyState title={`Loading ${symbol} book`} detail="Getting the latest bid and ask orders…" /> : orderRows.length === 0 ? <EmptyState title={apiConnected ? "Book is clear" : "Backend unavailable"} detail={apiConnected ? `No active orders for ${symbol}. Place an order to get started.` : apiError || "The order book will appear when the backend is available."} action={!apiConnected ? loadOrderBook : undefined} actionLabel="Try again" /> : <div className="book-sides">
              <BookSide title="ASKS · SELL" orders={sortedSellOrders.slice(0, 7)} side="SELL" onCancel={cancelOrder} onSelectPrice={selectBookPrice} cancelling={cancelling} />
              <div className="spread-line"><span>SPREAD</span><strong>{spread === null ? "—" : money(spread)}</strong><span>{spread === null ? "" : "USD"}</span></div>
              <BookSide title="BIDS · BUY" orders={sortedBuyOrders.slice(0, 7)} side="BUY" onCancel={cancelOrder} onSelectPrice={selectBookPrice} cancelling={cancelling} />
            </div>}
          </section>
        </div>

        <section className="panel activity-panel">
          <div className="panel-heading activity-heading"><div><div className="eyebrow">TAPE</div><h2>Recent executions <span className="trade-count">{visibleTrades.length}</span></h2></div><div className="activity-controls"><button className="export-button" type="button" onClick={exportTrades} disabled={visibleTrades.length === 0}>Export CSV</button><button className="clear-tape" type="button" onClick={() => { setTrades([]); queuedTrades.current = []; setQueuedTradeCount(0); }} disabled={trades.length === 0 && queuedTradeCount === 0}>Clear</button><button className="tape-filter" type="button" aria-pressed={!showAllTrades} onClick={() => setShowAllTrades((value) => !value)}>{showAllTrades ? "ALL SYMBOLS" : `${symbol} ONLY`}</button><button className="tape-pause" type="button" aria-pressed={tapePaused} onClick={() => setTapePaused((paused) => !paused)}>{tapePaused ? `Resume${queuedTradeCount ? ` (${queuedTradeCount})` : ""}` : "Pause"}</button><span className={`live-pill ${tapePaused ? "paused" : ""}`}><i /> {tapePaused ? "PAUSED" : "LIVE FEED"}</span></div></div>
          {trades.length === 0 ? <EmptyState title="No executions yet" detail="Completed trades will stream here in real time." /> : visibleTrades.length === 0 ? <EmptyState title={`No ${symbol} executions`} detail="Switch to all symbols to see the latest market activity." /> : <div className="table-wrap"><table><thead><tr><th>Time</th><th>Instrument</th><th>Price</th><th>Quantity</th><th>Notional</th><th>Feed</th></tr></thead><tbody>{visibleTrades.map((trade) => <tr key={trade.key}><td className="mono">{new Date(trade.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td><strong className="ticker">{trade.symbol}</strong></td><td className="mono">{money(trade.price)}</td><td className="mono">{Number(trade.quantity).toLocaleString()}</td><td className="mono">{money(Number(trade.price) * Number(trade.quantity))}</td><td><span className="execution-tag"><i /> MATCHED</span></td></tr>)}</tbody></table></div>}
        </section>
        <footer><span>ORDERFLOW <b>·</b> MATCHING ENGINE</span><span>Market data is for demonstration purposes</span></footer>
      </main>
      {toast && <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}><span aria-hidden="true">{toast.kind === "error" ? "!" : "✓"}</span>{toast.message}<button onClick={() => { window.clearTimeout(toastTimer.current); setToast(null); }} aria-label="Dismiss notification">×</button></div>}
    </div>
  );
}

function Metric({ label, value, detail, tone = "" }) {
  return <article className="metric-card"><div className="metric-label">{label}<span className={`metric-indicator ${tone}`} /></div><strong>{value}</strong><small>{detail}</small></article>;
}

function BookSide({ title, orders, side, onCancel, onSelectPrice, cancelling }) {
  const isBuy = side === "BUY";
  const maximum = Math.max(...orders.map((item) => Number(item.quantity)), 1);
  let cumulativeQuantity = 0;
  return <div className={`book-side ${isBuy ? "bids" : "asks"}`}>
    <div className="book-title"><span>{title}</span><span>PRICE</span><span>SIZE</span><span>TOTAL</span><span /></div>
    {orders.length ? orders.map((item) => {
      cumulativeQuantity += Number(item.quantity) || 0;
      return <div className="book-row" key={item.orderId} style={{ "--depth": `${Math.max(16, Number(item.quantity) / maximum * 100)}%` }}>
        <button className="book-price book-price-select" type="button" onClick={() => onSelectPrice(isBuy ? "BUY" : "SELL", item.price)} aria-label={`Use ${money(item.price)} ${isBuy ? "bid" : "ask"} as limit price`}>{money(item.price)}</button><span className="book-size">{Number(item.quantity).toLocaleString()}</span><span className="book-total">{cumulativeQuantity.toLocaleString()}</span>
        <button className="book-cancel" onClick={() => onCancel(item.orderId)} disabled={cancelling === item.orderId} aria-label={`Cancel order ${item.orderId}`}>×</button>
      </div>;
    }) : <div className="book-empty">No {isBuy ? "bids" : "asks"}</div>}
  </div>;
}

function EmptyState({ title, detail, action, actionLabel }) {
  return <div className="empty-state"><span className="empty-mark">⌁</span><strong>{title}</strong><p>{detail}</p>{action && <button className="empty-action" type="button" onClick={action}>{actionLabel || "Retry"}</button>}</div>;
}

export default App;
