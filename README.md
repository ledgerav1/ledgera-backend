# Ledgera Backend

Cash recovery and financial tracking platform for HVAC contractors and service businesses.

## Setup

```bash
npm install
```

## Environment Variables

Create a `.env` file:

```
DATABASE_URL="postgresql://user:password@localhost:5432/ledgeradb"
PORT=4000
JWT_SECRET=your_jwt_secret_key
PHANTOM_DETECTION_THRESHOLD=0.2
NODE_ENV=development
```

## Database

```bash
npm run prisma:migrate
npm run prisma:generate
```

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## Seeding

Load demo data:
```bash
npm run seed
```

Clear demo data:
```bash
npm run seed:clear
```

## API Endpoints

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `GET /companies` - List companies
- `GET /jobs` - List jobs
- `GET /invoices` - List invoices
- `GET /payments` - List payments

## Architecture

- **Services**: Business logic (phantom detection, guarantee checks)
- **Routes**: Express route handlers
- **Prisma**: Database ORM with migrations
- **Cron**: Scheduled tasks
