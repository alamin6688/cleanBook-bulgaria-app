# Stripe Payment Integration Setup Guide

## Step 1: Install Stripe Package

```bash
npm install stripe
```

## Step 2: Configure Environment Variables

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLIC_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
```

### How to Get These Keys:

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/
2. **Login** to your Stripe account
3. **Navigate to Settings → API Keys**
4. **Copy:**
   - Secret Key (starts with `sk_test_` or `sk_live_`)
   - Publishable Key (starts with `pk_test_` or `pk_live_`)

5. **Webhook Secret:**
   - Go to Settings → Webhooks
   - Create a new endpoint: `https://yourdomain.com/api/v1/payments/webhook`
   - Subscribe to events: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy the Signing Secret (starts with `whsec_`)

## Step 3: Payment Flow

### Backend Flow (Server-Side)

```
1. Customer creates booking
   POST /api/v1/bookings
   ├─ Creates booking with PENDING status
   └─ paymentStatus: "PENDING"

2. Customer requests payment intent
   POST /api/v1/payments/:bookingId/intent
   ├─ Creates Stripe PaymentIntent
   ├─ Returns clientSecret + paymentIntentId
   └─ Stores paymentIntentId in database

3. Stripe processes payment (frontend handles)

4. Stripe webhook notifies backend
   POST /api/v1/payments/webhook
   ├─ Verifies webhook signature
   ├─ Updates booking.paymentStatus = "PAID"
   └─ Updates booking.paymentIntentId

5. Customer confirms booking
   PATCH /api/v1/bookings/:id/confirm
   ├─ Requires paymentStatus = "PAID"
   └─ Updates booking.status = "CONFIRMED"
```

### Frontend Flow (Client-Side)

```javascript
// Step 1: Create booking
const booking = await fetch('/api/v1/bookings', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer TOKEN' },
  body: JSON.stringify({ ... })
});

// Step 2: Get payment intent
const paymentIntent = await fetch(
  `/api/v1/payments/${bookingId}/intent`,
  { headers: { 'Authorization': 'Bearer TOKEN' } }
);
const { clientSecret } = await paymentIntent.json();

// Step 3: Use Stripe.js to handle payment
const stripe = Stripe('pk_test_YOUR_PUBLIC_KEY');
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: elements.getElement(CardElement),
    billing_details: { name: 'John Doe' }
  }
});

// Step 4: Webhook automatically updates payment status

// Step 5: Confirm booking after payment succeeds
const confirm = await fetch(`/api/v1/bookings/${bookingId}/confirm`, {
  method: 'PATCH',
  headers: { 'Authorization': 'Bearer TOKEN' }
});
```

## API Endpoints

### 1. Create Payment Intent

```http
POST /api/v1/payments/:bookingId/intent
Authorization: Bearer JWT_TOKEN
Content-Type: application/json

Response:
{
  "statusCode": 200,
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "clientSecret": "pi_1234567890_secret_abcdef",
    "paymentIntentId": "pi_1234567890",
    "amount": 50400,
    "currency": "usd",
    "status": "requires_payment_method",
    "booking": {
      "id": "booking_id",
      "date": "2024-01-20T00:00:00.000Z",
      "startTime": "09:00",
      "endTime": "17:00",
      "charge": 480,
      "platformCharge": 24,
      "totalCharge": 504
    }
  }
}
```

### 2. Webhook Handler

```http
POST /api/v1/payments/webhook
Stripe-Signature: signature_header

Handled Events:
- payment_intent.succeeded → Updates paymentStatus to "PAID"
- payment_intent.payment_failed → Updates paymentStatus to "FAILED"
```

### 3. Refund Payment

```http
POST /api/v1/payments/:bookingId/refund
Authorization: Bearer JWT_TOKEN
Content-Type: application/json

Response:
{
  "success": true,
  "message": "Payment refunded successfully",
  "refundId": "re_1234567890"
}
```

## Database Changes

### Booking Model Updates

```prisma
model Booking {
  // ... existing fields

  charge          Float
  platformCharge  Float
  totalCharge     Float

  paymentIntentId String?  // Stripe Payment Intent ID
  status          BookingStatus @default(PENDING)
  paymentStatus   String        @default("PENDING")
  // PENDING | PAID | FAILED | REFUNDED

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## Price Breakdown Example

```
Service Price: $60/hour
Duration: 8 hours (FULL_DAY)

Calculations:
- Base Charge: $60 × 8 = $480
- Platform Fee: $480 × 5% = $24
- Total Charge: $480 + $24 = $504

Frontend displays:
- Cleaner Charge: $480
- Platform Fee: $24 (5%)
- Total to Pay: $504
```

## Testing Stripe in Test Mode

### Test Card Numbers

| Card Type      | Number              | CVC | Exp Date |
| -------------- | ------------------- | --- | -------- |
| Visa           | 4242 4242 4242 4242 | 123 | 12/35    |
| Visa (decline) | 4000 0000 0000 0002 | 123 | 12/35    |
| Mastercard     | 5555 5555 5555 4444 | 123 | 12/35    |

### Test Payment Intents

```bash
# Test successful payment
Card: 4242 4242 4242 4242
CVC: 123
Exp: 12/25

# Test failed payment
Card: 4000 0000 0000 0002
CVC: 123
Exp: 12/25

# Test requires authentication
Card: 4000 0027 6000 3184
CVC: 123
Exp: 12/25
```

## Production Checklist

- [ ] Update `.env` with live Stripe keys
- [ ] Configure webhook URL to production domain
- [ ] Test payment flow end-to-end
- [ ] Enable email notifications for payments
- [ ] Set up Stripe email templates
- [ ] Configure payment failure handling
- [ ] Test refund process
- [ ] Set up monitoring/alerts for failed payments

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook endpoint is accessible: `POST /api/v1/payments/webhook`
2. Verify webhook secret in `.env` is correct
3. Check Stripe Dashboard → Events for failed deliveries
4. Ensure raw body is passed to webhook handler

### Payment Intent Creation Fails

1. Verify `STRIPE_SECRET_KEY` is correct
2. Check booking exists and hasn't been paid
3. Ensure `totalCharge` is a valid number
4. Tests: Use test mode keys only

### Payment Status Not Updating

1. Webhook might not be authenticated
2. Check logs for webhook errors
3. Verify webhook secret matches Stripe dashboard
4. Test webhook manually in Stripe dashb oard

## Additional Resources

- [Stripe API Docs](https://stripe.com/docs/api)
- [Stripe.js Documentation](https://stripe.com/docs/js)
- [Webhook Events](https://stripe.com/docs/webhooks)
- [Testing Payments](https://stripe.com/docs/testing)
