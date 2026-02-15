# Octiv Scheduler

Automated class booking system for Octiv Fitness.

## Features

- 🔄 Automatically discovers and books classes based on your wishlist
- ⏰ Schedules bookings at a specified time before class starts
- 📋 Watches for wishlist changes and updates schedules in real-time
- 🐳 Easy deployment with Docker Compose

## Quick Start with Docker Compose

### Prerequisites

- Node.js and npm / yarn installed
- (Optional) Docker and Docker Compose installed
- Octiv Fitness account credentials

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/derochs/octiv-scheduler.git
   cd octiv-scheduler
   ```

2. **Set environment variables**

   Export your Octiv credentials and configuration:

   ```bash
   export OCTIV_EMAIL=your-email@example.com
   export OCTIV_PASSWORD=your-password
   export DISCOVERY_CRON="0 4 * * *"  # Optional: defaults to 4 AM daily
   export DRY_RUN=true                # Optional: defaults to true
   export TZ="Europe/Berlin"          # Optional: defaults to UTC (Important for correct time matching)
   ```

   > **Note:** For production use, consider using a secrets management system or your CI/CD platform's environment variable features instead of storing credentials in files.

3. **Configure your wishlist**

   Edit `wishlist.json` to specify which classes to book:

   ```json
   [
     {
       "className": "CrossFit Class",
       "classDateUtc": "2026-02-18T17:30:00Z",
       "hoursBefore": 71
     }
   ]
   ```

   > **Note:** The `className` must exactly match the class name from Octiv. You can find the exact class name in the Octiv app or on the Octiv website.

4. **Start the service**
   ```bash
   docker-compose up -d
   ```

### Configuration

#### Environment Variables

- `OCTIV_EMAIL` - Your Octiv Fitness account email (required)
- `OCTIV_PASSWORD` - Your Octiv Fitness account password (required)
- `DISCOVERY_CRON` - Cron schedule for discovery runs (default: `0 4 * * *` - daily at 4 AM). Scans your wishlist and schedules bookings for upcoming classes or books immediately if the booking window is already open.
- `DRY_RUN` - Set to `true` to simulate bookings without actually booking them (default: `true`)
- `TZ` - Timezone for the application (e.g., `Europe/Berlin`). Important to match Octiv's local class times with your wishlist. Defaults to `UTC`.

#### Wishlist Format

Each wishlist item requires:

- `className` - Exact name of the class (must match name on Octiv)
- `classDateUtc` - ISO 8601 date/time in UTC when the class occurs
- `hoursBefore` - How many hours before the class can be booked

### Usage

**View logs:**

```bash
docker-compose logs -f
```

**Restart the service:**

```bash
docker-compose restart
```

**Stop the service:**

```bash
docker-compose down
```

**Update wishlist:**
Simply edit `wishlist.json` - the service will automatically detect changes and update schedules.

## How It Works

1. **Discovery**: Runs on the configured cron schedule (and at startup)
2. **Matching**: Finds classes from the API that match your wishlist
3. **Scheduling**:
   - If booking time has passed → books immediately
   - If booking time is in the future → schedules a job
4. **Watching**: Monitors `wishlist.json` for changes and updates schedules accordingly

## Manual Deployment (Node.js)

If you prefer to run the application directly with Node.js instead of Docker:

1. **Prerequisites**
   - Node.js (v18+ recommended)
   - Yarn package manager

2. **Installation**

   ```bash
   yarn install
   ```

3. **Configuration**

   Create a `.env` file in the root directory or export environment variables:

   ```bash
   export OCTIV_EMAIL=your-email@example.com
   export OCTIV_PASSWORD=your-password
   export DISCOVERY_CRON=0 4 * * *
   export TZ="Europe/Berlin"
   ```

4. **Run**

   ```bash
   yarn start
   ```

   For a long-running process, you can use `screen`, `tmux`, or a process manager like `pm2`.

## Development

**Run locally without Docker:**

```bash
yarn install
yarn start
```

**Build:**

```bash
yarn build
```

## Why a wishlist?

Instead of offering a UI to select classes, we use a wishlist. This allows you to define your desired classes in a simple JSON file and let the scheduler handle the rest. It's a simple but effective way to automate your class bookings. It also lets you use tools such as [OpenClaw](https://openclaw.ai/) to edit the wishlist, allowing you to use a simple messaging tool to book classes.
