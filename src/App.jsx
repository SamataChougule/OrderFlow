import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [orders, setOrders] = useState([]);
  const [trades, setTrades] = useState([]);
  const [backendConnected, setBackendConnected] = useState(false);

  const [order, setOrder] = useState({
    orderId: "",
    symbol: "AAPL",
    side: "BUY",
    type: "LIMIT",
    price: "",
    quantity: ""
  });

  // =========================
  // LOAD ORDER BOOK
  // =========================
  const loadOrderBook = async () => {
    try {
      const response = await fetch("/api/orderbook");

      if (!response.ok) {
        throw new Error("Order book request failed");
      }

      const data = await response.json();

      const allOrders = [
        ...(data.buyOrders || []),
        ...(data.sellOrders || [])
      ];

      setOrders(allOrders);
      setBackendConnected(true);

    } catch (error) {
      console.error("Order book error:", error);
      setBackendConnected(false);
    }
  };

  // =========================
  // WEBSOCKET
  // =========================
  useEffect(() => {
    loadOrderBook();

    const socket = new WebSocket(
      "ws://localhost:5173/ws/market-data"
    );

    socket.onopen = () => {
      console.log("Connected to OrderFlow WebSocket");
    };

    socket.onmessage = (event) => {
      try {
        const trade = JSON.parse(event.data);

        if (trade.symbol) {
          setTrades((previousTrades) => [
            trade,
            ...previousTrades
          ]);
        }

      } catch (error) {
        console.log("WebSocket message:", event.data);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      socket.close();
    };
  }, []);

  // =========================
  // HANDLE INPUT
  // =========================
  const handleChange = (event) => {
    setOrder({
      ...order,
      [event.target.name]: event.target.value
    });
  };

  // =========================
  // PLACE ORDER
  // =========================
  const placeOrder = async (event) => {
    event.preventDefault();

    const orderData = {
      orderId: Number(order.orderId),
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      price: Number(order.price),
      quantity: Number(order.quantity)
    };

    try {
      const response = await fetch(
        "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(orderData)
        }
      );

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}`
        );
      }

      const result = await response.text();

      alert(result);

      setOrder({
        orderId: "",
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: "",
        quantity: ""
      });

      // Give Disruptor time to process the order
      setTimeout(() => {
        loadOrderBook();
      }, 500);

    } catch (error) {
      console.error("Order error:", error);

      alert(
        "ERROR: " + error.message
      );
    }
  };

  // =========================
  // CANCEL ORDER
  // =========================
  const cancelOrder = async (orderId) => {
    try {
      const response = await fetch(
        `/api/orderbook/${orderId}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}`
        );
      }

      const result = await response.text();

      alert(result);

      loadOrderBook();

    } catch (error) {
      console.error("Cancel error:", error);

      alert(
        "ERROR: " + error.message
      );
    }
  };

  return (
    <div className="app">

      {/* ================= HEADER ================= */}

      <header className="header">

        <div>
          <h1>OrderFlow</h1>

          <p>
            High-Throughput Matching Engine & Market Data Gateway
          </p>
        </div>

        <div className="status">

          <span
            className="status-dot"
            style={{
              background: backendConnected
                ? "#22c55e"
                : "#ef4444"
            }}
          ></span>

          {backendConnected
            ? "Backend Connected"
            : "Backend Disconnected"}

        </div>

      </header>

      <main>

        {/* ================= PLACE ORDER ================= */}

        <section className="card">

          <h2>Place Order</h2>

          <form onSubmit={placeOrder}>

            {/* ORDER ID */}

            <div className="form-group">

              <label>Order ID</label>

              <input
                name="orderId"
                type="number"
                placeholder="Example: 1001"
                value={order.orderId}
                onChange={handleChange}
                required
              />

            </div>

            {/* SYMBOL */}

            <div className="form-group">

              <label>Symbol</label>

              <input
                name="symbol"
                type="text"
                placeholder="AAPL"
                value={order.symbol}
                onChange={handleChange}
                required
              />

            </div>

            {/* SIDE */}

            <div className="form-group">

              <label>Side</label>

              <select
                name="side"
                value={order.side}
                onChange={handleChange}
              >

                <option value="BUY">
                  BUY
                </option>

                <option value="SELL">
                  SELL
                </option>

              </select>

            </div>

            {/* TYPE */}

            <div className="form-group">

              <label>Order Type</label>

              <select
                name="type"
                value={order.type}
                onChange={handleChange}
              >

                <option value="LIMIT">
                  LIMIT
                </option>

                <option value="MARKET">
                  MARKET
                </option>

              </select>

            </div>

            {/* PRICE */}

            <div className="form-group">

              <label>Price</label>

              <input
                name="price"
                type="number"
                step="0.01"
                placeholder="100.00"
                value={order.price}
                onChange={handleChange}
                required
              />

            </div>

            {/* QUANTITY */}

            <div className="form-group">

              <label>Quantity</label>

              <input
                name="quantity"
                type="number"
                placeholder="50"
                value={order.quantity}
                onChange={handleChange}
                required
              />

            </div>

            {/* BUTTON */}

            <button
              className="place-button"
              type="submit"
            >
              Place Order
            </button>

          </form>

        </section>


        {/* ================= ORDER BOOK ================= */}

        <section className="card">

          <div className="section-header">

            <h2>Order Book</h2>

            <button
              className="refresh-button"
              onClick={loadOrderBook}
            >
              Refresh
            </button>

          </div>

          {orders.length === 0 ? (

            <div className="empty">
              No active orders
            </div>

          ) : (

            <div className="table-container">

              <table>

                <thead>

                  <tr>
                    <th>ID</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Quantity</th>
                    <th>Action</th>
                  </tr>

                </thead>

                <tbody>

                  {orders.map((item) => (

                    <tr key={item.orderId}>

                      <td>
                        {item.orderId}
                      </td>

                      <td>
                        <strong>
                          {item.symbol}
                        </strong>
                      </td>

                      <td>

                        <span
                          className={
                            item.side === "BUY"
                              ? "buy"
                              : "sell"
                          }
                        >
                          {item.side}
                        </span>

                      </td>

                      <td>
                        {item.type}
                      </td>

                      <td>
                        ${Number(item.price).toFixed(2)}
                      </td>

                      <td>
                        {item.quantity}
                      </td>

                      <td>

                        <button
                          className="cancel-button"
                          onClick={() =>
                            cancelOrder(item.orderId)
                          }
                        >
                          Cancel
                        </button>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </section>


        {/* ================= LIVE TRADES ================= */}

        <section className="card">

          <div className="section-header">

            <h2>Live Trades</h2>

            <span className="live-label">
              ● LIVE
            </span>

          </div>

          {trades.length === 0 ? (

            <div className="empty">
              Waiting for live trades...
            </div>

          ) : (

            <div className="table-container">

              <table>

                <thead>

                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Quantity</th>
                  </tr>

                </thead>

                <tbody>

                  {trades.map(
                    (trade, index) => (

                      <tr key={index}>

                        <td>
                          <strong>
                            {trade.symbol}
                          </strong>
                        </td>

                        <td>
                          ${Number(trade.price).toFixed(2)}
                        </td>

                        <td>
                          {trade.quantity}
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </section>

      </main>

    </div>
  );
}

export default App;