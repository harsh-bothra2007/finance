# Finance App

A comprehensive finance management application to track expenses, income, stocks, and splitwise-style bills with friends.

## Features

- **Expense & Income Tracking**: Manage your daily finances with ease.
- **Stock Portfolio**: Track your investments and portfolio growth.
- **Splitwise Integration**: Split bills with friends and track settlements.
- **Gamification**: Earn streaks and badges for consistent tracking.
- **Charts & Insights**: Visualize your spending and savings rate.

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [NPM](https://www.npmjs.com/)
- [Docker](https://www.docker.com/) (Optional, for simplified setup)

### Local Setup (Manual)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/harsh-bothra2007/finance.git
   cd finance
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   - Rename `.env.example` to `.env`.
   - Add your `JWT_SECRET` (any random string) and `OPENAI_API_KEY`.

4. **Run the application**:
   ```bash
   npm start
   ```
   The app will be running at `http://localhost:3000`.

### Local Setup (Docker)

1. **Build and Run**:
   ```bash
   docker-compose up --build
   ```
   The app will be available at `http://localhost:3000`.

## Tech Stack

- **Backend**: Express.js, better-sqlite3
- **Frontend**: Vanilla HTML/CSS/JS
- **Containerization**: Docker

## Troubleshooting

### "Server Error" or Native Module Issues
If you see errors related to `better-sqlite3` or generic server crashes on a new machine:
1.  **Clear existing modules**:
    ```bash
    rm -rf node_modules package-lock.json
    ```
2.  **Reinstall everything**:
    ```bash
    npm install
    ```
3.  **Check Environment Variables**:
    Ensure `.env` exists and contains a `JWT_SECRET`.
