# MiniStore + Razorpay

## 1. Install Node.js

Install a current LTS version of Node.js.

## 2. Open this folder in VS Code

Open:

razorpay-payment-project

## 3. Install packages

```bash
npm install
```

## 4. Create `.env`

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then put your Razorpay credentials in `.env`.

Example:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
PORT=3000
```

DO NOT put the secret in `payment.html`.
DO NOT commit `.env` to GitHub.

## 5. Start server

```bash
npm start
```

Open:

http://localhost:3000/payment.html

## Important

The frontend file already loads Razorpay Checkout.js.

The current frontend's submit handler is intentionally still in demo mode.
For the actual payment flow, its submit handler should:

1. POST cart + customer details to `/api/create-order`
2. Receive `id`, `amount`, `currency`, `key_id`
3. Call `openRazorpayCheckout(order)`
4. On success, POST:
   - `razorpay_order_id`
   - `razorpay_payment_id`
   - `razorpay_signature`
   to `/api/verify-payment`

The backend calculates product prices itself and does not trust the browser's price.

## Learning flow

Frontend
  -> POST /api/create-order
  -> Razorpay Orders API
  -> order_id
  -> Razorpay Checkout
  -> payment
  -> POST /api/verify-payment
  -> verified payment

After that we can add:
- Webhooks
- Payment status
- Refunds
- Database order records
- Live mode
