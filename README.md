# CleanBook Bulgaria Backend

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-626CD9?style=for-the-badge&logo=Stripe&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)

A comprehensive backend API for CleanBook Bulgaria, a cleaning service booking platform tailored for Bulgaria. This application enables customers to book cleaning services, cleaners to manage their availability and services, and admins to oversee operations. Built with modern technologies for scalability, security, and real-time communication.

## Table of Contents

- [Features](#features)
- [Architecture & Folder Layout](#architecture--folder-layout)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [API Documentation](#api-documentation)
- [Usage Examples](#usage-examples)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

### 🔐 Authentication & Security
- **JWT Authentication**: Secure token-based authentication with refresh token rotation
- **Role-Based Access Control**: Support for Customer, Cleaner, Admin, and Super Admin roles
- **OTP Email Verification**: Secure email verification and password reset flows

### 🧹 Booking & Services
- **Smart Booking System**: Customers can book cleaning services with flexible scheduling
- **Cleaner Management**: Cleaners can manage availability, services, and pricing
- **Service Categories**: Dynamic property types and additional services
- **Location-Based**: Service areas and location tracking for Bulgaria

### 💬 Communication
- **Real-Time Chat**: Socket.io-powered messaging between customers and cleaners
- **Push Notifications**: Firebase Cloud Messaging for instant notifications
- **Review System**: Customer feedback and rating system for services

### 💳 Payments & Business
- **Stripe Integration**: Secure payment processing with Bulgarian currency support
- **Admin Dashboard**: Comprehensive management of categories, areas, and users
- **File Upload**: Image processing and storage with Multer

### 🛡️ Security & Performance
- **Rate Limiting**: Protection against abuse with configurable limits
- **Security Headers**: Helmet, CORS, HPP for robust security

### 🧪 Development & Testing
- **Comprehensive Testing**: Jest and Supertest for reliable code
- **API Documentation**: Interactive docs for easy integration
- **TypeScript**: Type-safe development with full IntelliSense
- **Code Quality**: ESLint and Prettier for consistent code style

## Architecture & Folder Layout

This project follows a **feature module architecture**. Each module owns its route, validation, controller, and service layers.

```
src/
├── app/
│   ├── middlewares/
│   │   ├── auth.ts
│   │   ├── globalErrorHandler.ts
│   │   ├── validateRequest.ts
│   │   └── validateImageContent.ts
│   ├── modules/
│   │   ├── Auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.interface.ts
│   │   │   ├── auth.route.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.validation.ts
│   │   ├── Booking/
│   │   ├── Chat/
│   │   ├── Payment/
│   │   └── ...
│   ├── routes/
│   │   └── index.ts
│   └── db/
│       └── seed.ts
├── config/
│   └── index.ts
├── lib/
│   ├── prisma.ts
│   ├── redisConnection.ts
│   └── swagger.ts
├── shared/
│   ├── catchAsync.ts
│   ├── sendResponse.ts
│   └── emails/
├── utils/
│   ├── generateOtp.ts
│   ├── hashAndCompareItem.ts
│   ├── jwtHelpers.ts
│   └── logger/
├── socket/
│   └── socket.ts
├── app.ts
└── server.ts
```

**Request Flow:**
```
Client → Route → Validation → Controller → Service → Database
                                               ↓
                                         Response
```

## Tech Stack

- **Runtime**: Node.js (v20+)
- **Framework**: Express.js 5
- **Language**: TypeScript
- **Database**: MongoDB with Prisma ORM
- **Authentication**: JWT with refresh token rotation
- **Validation**: Zod
- **Payment**: Stripe
- **Notifications**: Firebase Cloud Messaging
- **Real-time**: Socket.io
- **File Processing**: Multer
- **Email**: Nodemailer
- **Security**: Helmet, CORS, HPP, express-rate-limit
- **Documentation**: OpenAPI
- **Linting**: ESLint, Prettier

## Prerequisites

- Node.js 20 or higher (22 recommended)
- MongoDB (local or Atlas)
- Redis (local or remote)
- npm or pnpm

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/alamin6688/cleanBook-bulgaria-app.git
   cd cleanBook-bulgaria-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables** (see [Environment Setup](#environment-setup))

4. **Generate Prisma client**:
   ```bash
   npm run prisma:generate
   ```

5. **Push database schema**:
   ```bash
   npx prisma db push
   ```

6. **Seed the database** (optional):
   ```bash
   npm run prisma:seed
   ```

## Environment Setup

Create a `.env` file in the root directory and configure the following variables:

```env
NODE_ENV=development
PORT=8000
HOST=0.0.0.0
APP_NAME=CleanBook Bulgaria
APP_VERSION=1.0.0

# Database
DATABASE_URL=mongodb://localhost:27017/cleanbook

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Email (for OTP)
EMAIL_SENDER_EMAIL=your-email@gmail.com
EMAIL_SENDER_APP_PASS=your-gmail-app-password

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Other
PASSWORD_SALT=12
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
RATE_LIMIT_AUTH_MAX=10
```

## Running the Application

### Development Mode
```bash
npm run dev
```
The server will start on `http://localhost:8000`

### Production Build
```bash
npm run build
npm start
```

### Docker Setup
1. **Build and run with Docker Compose**:
   ```bash
   docker compose up --build -d
   ```

2. **Check logs**:
   ```bash
   docker compose logs -f app
   ```

3. **Stop services**:
   ```bash
   docker compose down
   ```

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

## API Documentation

## Usage Examples

### User Registration
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "securepassword123",
    "phone": "+359123456789",
    "role": "CUSTOMER"
  }'
```

### Email Verification
```bash
curl -X POST http://localhost:8000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "otp": "123456"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "securepassword123"
  }'
```

### Create a Booking
```bash
curl -X POST http://localhost:8000/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "cleanerId": "cleaner-id",
    "serviceDate": "2024-12-01T10:00:00Z",
    "propertyTypeId": "property-type-id",
    "additionalServiceIds": ["service-id-1"],
    "notes": "Please clean thoroughly"
  }'
```

### Process Payment with Stripe
```bash
curl -X POST http://localhost:8000/api/v1/payments/create-payment-intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "bookingId": "booking-id",
    "amount": 5000,
    "currency": "bgn"
  }'
```

### Send Message in Chat
```javascript
// Using Socket.io client
const socket = io("http://localhost:8000", {
  auth: {
    token: "YOUR_ACCESS_TOKEN",
  },
});

socket.emit("sendMessage", {
  chatRoomId: "room-id",
  message: "Hello, I need to reschedule my booking.",
});
```

## Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use strong, unique JWT secrets
- [ ] Configure production database (MongoDB Atlas)
- [ ] Set up production Redis instance
- [ ] Configure Stripe live keys
- [ ] Set up Firebase production credentials
- [ ] Configure production email service
- [ ] Set restricted CORS origins
- [ ] Enable HTTPS
- [ ] Set up monitoring and logging
- [ ] Run full test suite before deployment


## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a pull request

### Code Style
- Run linter: `npm run lint`
- Format code: `npm run format`

## License

This project is licensed under the ISC License.