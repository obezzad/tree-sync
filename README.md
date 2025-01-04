# Tree Sync

A PoC for local-first replicated tree synchronization using PowerSync and Supabase.

## Tech Stack

- **Framework**: Next.js 15
- **Authentication**: Supabase
- **Sync Engine**: PowerSync
- **Database**: Supabase (& PowerSync buckets for download)
- **Styling**: TailwindCSS
- **State Management**: MobX

## Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Fill in the environment variables in `.env.local`:

4. Run the development server:
```bash
pnpm watch
```

## Architecture

### Key Components

- `src/app`: Next.js app router pages
- `src/components`: Reusable React components
- `src/library`: Core business logic
  - `auth`: Authentication services
  - `powersync`: Database and sync functionality
- `src/stores`: MobX state management

## Development

- `pnpm watch`: Start development server
- `pnpm build`: Production build
- `pnpm start`: Run production server
- `pnpm lint`: Run linting

## Project Structure

```
src/
├── app/                 # Next.js pages
├── components/
│   ├── Header.tsx      # Main navigation
│   ├── TreeView/       # Tree visualization
│   └── providers/      # React context providers
├── library/
│   ├── auth/           # Authentication logic
│   └── powersync/      # Sync handling
└── stores/             # MobX state management
