require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!KEY_ID || !KEY_SECRET) {
  console.warn(
    "\n⚠️  Razorpay keys are missing. Create a .env file before testing payments.\n"
  );
}

const razorpay = new Razorpay({
  key_id: KEY_ID || "",
  key_secret: KEY_SECRET || ""
});

/*
  IMPORTANT:
  The server owns the real product prices.
  Do not trust the price/amount sent from the browser.
*/
const PRODUCTS = {
  1: { name: "Demo Notebook", price: 49 },
  2: { name: "Coffee Mug", price: 99 },
  3: { name: "Desk Lamp", price: 199 },
  4: { name: "Mini Backpack", price: 299 }
};

function calculateOrder(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart is empty.");
  }

  let subtotal = 0;
  const safeItems = [];

  for (const item of items) {
    const productId = Number(item.id);
    const qty = Number(item.qty);

    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      throw new Error("Invalid cart item.");
    }

    const product = PRODUCTS[productId];
    if (!product) {
      throw new Error(`Unknown product: ${productId}`);
    }

    subtotal += product.price * qty;

    safeItems.push({
      id: productId,
      name: product.name,
      price: product.price,
      qty
    });
  }

  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  return { safeItems, subtotal, gst, total };
}

/*
  Serve the frontend.
*/
app.use(express.static(path.join(__dirname, "public")));

/*
  Razorpay order creation.
  Amount is calculated on the server and sent to Razorpay in paise.
*/
app.post("/api/create-order", express.json(), async (req, res) => {
  try {
    const { items, customer } = req.body || {};
    const calculated = calculateOrder(items);

    if (!customer?.name || !customer?.email || !customer?.phone) {
      return res.status(400).json({
        success: false,
        message: "Customer details are required."
      });
    }

    const order = await razorpay.orders.create({
      amount: calculated.total * 100,
      currency: "INR",
      receipt: `mini_${Date.now()}`,
      notes: {
        customer_name: String(customer.name).slice(0, 120),
        customer_email: String(customer.email).slice(0, 120),
        customer_phone: String(customer.phone).slice(0, 30)
      }
    });

    return res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: KEY_ID,
      receipt: order.receipt,
      items: calculated.safeItems,
      subtotal: calculated.subtotal,
      gst: calculated.gst,
      total: calculated.total
    });
  } catch (error) {
    console.error("Create order error:", error);

    return res.status(500).json({
      success: false,
      message: error?.error?.description || error.message || "Unable to create Razorpay order."
    });
  }
});

/*
  Payment signature verification.
  The browser sends these values after Checkout success.
*/
app.post("/api/verify-payment", express.json(), (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay payment fields."
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", KEY_SECRET)
      .update(body)
      .digest("hex");

    const valid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(razorpay_signature, "utf8")
    );

    if (!valid) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Payment signature verification failed."
      });
    }

    return res.json({
      success: true,
      verified: true,
      message: "Payment signature verified successfully.",
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id
    });
  } catch (error) {
    console.error("Verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment verification failed."
    });
  }
});

/*
  Optional payment status endpoint.
*/
app.get("/api/payment/:paymentId", async (req, res) => {
  try {
    const payment = await razorpay.payments.fetch(req.params.paymentId);

    return res.json({
      success: true,
      payment: {
        id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured
      }
    });
  } catch (error) {
    console.error("Payment status error:", error);

    return res.status(500).json({
      success: false,
      message: error?.error?.description || error.message || "Unable to fetch payment."
    });
  }
});

/*
  Webhook endpoint.

  Add RAZORPAY_WEBHOOK_SECRET to .env when you start using webhooks.
  Signature verification should be done on the raw request body.
*/
app.post("/api/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.log("Webhook received, but webhook secret is not configured.");
    return res.sendStatus(200);
  }

  const receivedSignature = req.headers["x-razorpay-signature"];

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(req.body)
    .digest("hex");

  if (receivedSignature !== expectedSignature) {
    console.warn("Invalid webhook signature.");
    return res.status(400).send("Invalid signature");
  }

  try {
    const event = JSON.parse(req.body.toString("utf8"));
    console.log("Verified Razorpay webhook:", event.event);
  } catch (error) {
    console.error("Webhook JSON error:", error);
  }

  return res.sendStatus(200);
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Razorpay demo backend is running."
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payment.html"));
});

app.listen(PORT, () => {
  console.log(`\n✅ MiniStore running at http://localhost:${PORT}`);
});
