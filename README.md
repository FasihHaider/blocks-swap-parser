## Envio ERC20 Template

*Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features*

### Database Configuration

This indexer uses a custom PostgreSQL database **without Hasura GraphQL Engine**.

**Quick Setup:**
1. A `.env` file has been created in the project root with default values
2. Edit `.env` and update the database credentials to match your PostgreSQL database:
   ```bash
   # Edit .env file
   nano .env  # or use your preferred editor
   ```

**Environment Variables:**
The `.env` file contains the following variables (with defaults):
- `ENVIO_PG_HOST` - Database host (default: `localhost`)
- `ENVIO_PG_PORT` - Database port (default: `5432`)
- `ENVIO_PG_USER` - Database user (default: `postgres`)
- `ENVIO_PG_PASSWORD` - Database password (default: `testing`)
- `ENVIO_PG_DATABASE` - Database name (default: `envio-dev`)
- `ENVIO_PG_PUBLIC_SCHEMA` - Public schema (default: `public`)
- `ENVIO_PG_SSL_MODE` - SSL mode (default: `false` for local)
- `ENVIO_HASURA` - Set to `false` to disable Hasura (default: `false`)

**Important Notes:**
- Make sure your PostgreSQL database is running and accessible before starting the indexer.
- The indexer runs **without Hasura** - it connects directly to PostgreSQL.
- For remote PostgreSQL databases, use the server's IP address or hostname as the host.
- The `.env` file is git-ignored, so your credentials won't be committed to version control.
- **After updating the `.env` file, restart the indexer for changes to take effect:**
  ```bash
  # Stop the indexer (Ctrl+C if running)
  # Then restart
  pnpm dev
  ```

### Run

```bash
pnpm dev
```

**Note:** Hasura GraphQL Engine is disabled. The indexer runs directly with PostgreSQL. You can query the database directly using SQL or set up your own GraphQL layer if needed.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Pre-requisites

- [Node.js (use v18 or newer)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- PostgreSQL database (custom installation, not Docker)
