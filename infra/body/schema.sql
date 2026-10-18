BEGIN;
CREATE TABLE IF NOT EXISTS body_scans (
 id uuid PRIMARY KEY, owner_id text NOT NULL, version integer NOT NULL DEFAULT 1,
 state text NOT NULL CHECK(state IN ('uploading','processing','review','ready','rejected','failed','deleted')),
 metadata jsonb NOT NULL, raw_key text NOT NULL, raw_bytes bigint NOT NULL,
 display_key text, collision_key text, measurements jsonb NOT NULL DEFAULT '{}',
 corrections jsonb NOT NULL DEFAULT '{}', quality jsonb NOT NULL DEFAULT '{}',
 landmarks jsonb, error text, share_fit boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), accessed_at timestamptz NOT NULL DEFAULT now(),
 raw_expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', raw_deleted boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS body_scans_owner ON body_scans(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS body_garments (
 id uuid PRIMARY KEY, version integer NOT NULL, data jsonb NOT NULL,
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS body_tryons (
 id uuid PRIMARY KEY, scan_id uuid NOT NULL REFERENCES body_scans(id), owner_id text NOT NULL,
 body_version integer NOT NULL, cache_key text NOT NULL UNIQUE, garments jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','processing','ready','failed','cancelled')),
 progress integer NOT NULL DEFAULT 0, result_key text, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS body_jobs (
 id uuid PRIMARY KEY, scan_id uuid REFERENCES body_scans(id), tryon_id uuid REFERENCES body_tryons(id),
 kind text NOT NULL CHECK(kind IN ('reconstruct','measure','simulate','purge')),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 leased_until timestamptz, lease_token uuid, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS body_jobs_queue ON body_jobs(state, available_at);
CREATE TABLE IF NOT EXISTS body_pairings (
 token_hash text PRIMARY KEY, owner_id text NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS body_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, scan_id uuid,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS body_rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL
);
COMMIT;
