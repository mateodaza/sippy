# `apps/backend/data/`

Event-payload files consumed by seeders. The directory is gitignored
(see `.gitignore`); only this README and the ignore file itself are
tracked.

## Pizza Day POAP pool

Drop the 300 unique POAP claim URLs (one per line) at:

    apps/backend/data/pizza_day_poap_codes.txt

- Blank lines and lines starting with `#` are ignored.
- Order is preserved as `poap_codes.id` (FIFO assignment).
- Load with:

      cd apps/backend
      node ace db:seed --files=database/seeders/poap_codes_seeder.ts

- Re-running the seeder is idempotent (`ON CONFLICT (claim_url) DO NOTHING`).
