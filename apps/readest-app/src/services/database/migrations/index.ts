import { MigrationEntry, SchemaType } from '../migrate';

/**
 * Migration definitions for each schema type.
 *
 * To add a new migration:
 *   1. Append a new entry to the appropriate schema array below.
 *   2. Use a date-based name: YYYYMMDDNN (NN = sequence within the day).
 *   3. Never reorder or remove existing entries.
 *
 * To add a new schema type:
 *   1. Add the type to SchemaType in migrate.ts.
 *   2. Add a new key here with its migration array.
 */
const migrations: Record<SchemaType, MigrationEntry[]> = {
  opds: [
    {
      name: '2026052701_opds_source_mappings',
      sql: `
        CREATE TABLE IF NOT EXISTS opds_source_mappings (
          catalog_id TEXT NOT NULL,
          source_url TEXT NOT NULL,
          book_hash TEXT NOT NULL,
          PRIMARY KEY (catalog_id, source_url)
        );
      `,
    },
  ],
  'bookorbit-sync': [
    {
      name: '2026080401_bookorbit_sync',
      sql: `
        CREATE TABLE IF NOT EXISTS bookorbit_note_mappings (
          book_hash TEXT NOT NULL,
          note_id TEXT NOT NULL,
          server_id INTEGER,
          ko_datetime TEXT NOT NULL,
          synced_at INTEGER NOT NULL,
          PRIMARY KEY (book_hash, note_id)
        );

        CREATE TABLE IF NOT EXISTS bookorbit_book_sync (
          book_hash TEXT PRIMARY KEY,
          annotations_synced_at INTEGER NOT NULL DEFAULT 0,
          bookmarks_synced_at INTEGER NOT NULL DEFAULT 0
        );
      `,
    },
  ],
  'hardcover-sync': [
    {
      name: '2026032901_hardcover_note_mappings',
      sql: `
        CREATE TABLE IF NOT EXISTS hardcover_note_mappings (
          book_hash TEXT NOT NULL,
          note_id TEXT NOT NULL,
          hardcover_journal_id INTEGER NOT NULL,
          payload_hash TEXT NOT NULL,
          synced_at INTEGER NOT NULL,
          PRIMARY KEY (book_hash, note_id)
        );

        CREATE INDEX IF NOT EXISTS idx_hardcover_note_mappings_synced_at
        ON hardcover_note_mappings (synced_at);
      `,
    },
  ],
  'notion-sync': [
    {
      name: '2026083001_notion_sync_mappings',
      sql: `
        CREATE TABLE IF NOT EXISTS notion_book_pages (
          target_id TEXT NOT NULL,
          book_hash TEXT NOT NULL,
          page_id TEXT NOT NULL,
          title TEXT NOT NULL,
          PRIMARY KEY (target_id, book_hash)
        );

        CREATE TABLE IF NOT EXISTS notion_note_mappings (
          target_id TEXT NOT NULL,
          book_hash TEXT NOT NULL,
          note_id TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          block_ids TEXT NOT NULL,
          stale_block_ids TEXT NOT NULL,
          synced_at INTEGER NOT NULL,
          PRIMARY KEY (target_id, book_hash, note_id)
        );
      `,
    },
  ],
  // The embeddings table is created lazily by BookIndexer because its
  // vector32(<dim>) column needs the active embedding model's dim, which
  // isn't known at migration time. Tantivy FTS lives on the chunks.text
  // column directly (no virtual table). Writers MUST DELETE+INSERT chunk
  // rows rather than UPDATE — Tantivy 0.25→0.26 has a known WASM-only
  // UPDATE regression (see fts-tests.ts:306 FIXME). MVP indexing is
  // write-once per book so this is naturally satisfied.
  //
  // AMENDED DIRECTION (2026-08-01, see
  // .agents/plans/2026-08-01-reedy-book-context-foundation.md): chunk FTS is
  // to be dropped — live-Tantivy inserts measured at ~5.3 s/book at ingest,
  // and text search now comes from the per-book library-search schema below.
  // Future Reedy schema keeps embeddings only, with chunks defined as
  // locator ranges into search_sections.
  statistics: [
    {
      name: '2026061501_statistics_koreader_schema',
      sql: `
        CREATE TABLE IF NOT EXISTS book (
          id integer PRIMARY KEY autoincrement,
          title text, authors text, notes integer, last_open integer,
          highlights integer, pages integer, series text, language text,
          md5 text, total_read_time integer, total_read_pages integer
        );

        CREATE UNIQUE INDEX IF NOT EXISTS book_title_authors_md5 ON book(title, authors, md5);

        CREATE TABLE IF NOT EXISTS page_stat_data (
          id_book integer,
          page integer NOT NULL DEFAULT 0,
          start_time integer NOT NULL DEFAULT 0,
          duration integer NOT NULL DEFAULT 0,
          total_pages integer NOT NULL DEFAULT 0,
          UNIQUE (id_book, page, start_time)
        );

        CREATE INDEX IF NOT EXISTS page_stat_data_start_time ON page_stat_data(start_time);

        CREATE TABLE IF NOT EXISTS numbers (number INTEGER PRIMARY KEY);

        INSERT OR IGNORE INTO numbers(number)
          SELECT h.n * 100 + t.n * 10 + o.n + 1
          FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) o,
               (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t,
               (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) h;

        -- turso ignores IF NOT EXISTS on CREATE VIEW (READEST-13), so a plain
        -- CREATE VIEW IF NOT EXISTS still throws "already exists" when the view
        -- is present (KOReader-imported stats DB, or a partially-applied run).
        -- DROP first (turso honors DROP VIEW IF EXISTS) to stay idempotent.
        DROP VIEW IF EXISTS page_stat;

        CREATE VIEW page_stat AS
          SELECT id_book, first_page + idx - 1 AS page, start_time, duration / (last_page - first_page + 1) AS duration
          FROM (
            SELECT id_book, page, total_pages, pages, start_time, duration,
              ((page - 1) * pages) / total_pages + 1 AS first_page,
              max(((page - 1) * pages) / total_pages + 1, (page * pages) / total_pages) AS last_page,
              idx
            FROM page_stat_data
            JOIN book ON book.id = id_book
            JOIN (SELECT number as idx FROM numbers) AS N ON idx <= (last_page - first_page + 1)
          );

        CREATE TABLE IF NOT EXISTS readest_page_ext (
          book_hash text NOT NULL, page integer NOT NULL, start_time integer NOT NULL,
          ext text, PRIMARY KEY (book_hash, page, start_time)
        );

        CREATE TABLE IF NOT EXISTS readest_book_ext (
          book_hash text PRIMARY KEY, ext text
        );

        CREATE TABLE IF NOT EXISTS readest_stat_sync_state (
          key text PRIMARY KEY, value integer NOT NULL DEFAULT 0
        );
      `,
    },
  ],
  // Per-book search index/cache: one search.db in each book's directory
  // (beside cover.png), holding extracted section text so library full-text
  // search never has to open the book file, unzip it, or parse section DOMs.
  // `folded` is the case/diacritic-folded text used as a LIKE prefilter; NULL
  // when folding leaves the text unchanged (typical for CJK) to halve storage.
  // No Tantivy FTS index: benchmarked (bench/library-search-turso.bench.ts),
  // at per-book granularity fan-out cost is dominated by DB open, so the
  // index cannot beat LIKE (~2-3 ms vs ~1.6 ms per book) while costing 2.3x
  // disk and 7x build time, token semantics cannot serve substring
  // `contains`, and the ngram variant costs ~10x the text in disk.
  'library-search': [
    {
      name: '2026080101_library_search_sections',
      sql: `
        CREATE TABLE IF NOT EXISTS search_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          updated_at INTEGER NOT NULL,
          version INTEGER NOT NULL,
          total_sections INTEGER NOT NULL,
          complete INTEGER NOT NULL DEFAULT 0,
          nav_hash TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS search_sections (
          idx INTEGER PRIMARY KEY,
          label TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL,
          folded TEXT
        );

        CREATE TABLE IF NOT EXISTS search_nodes (
          node_id INTEGER PRIMARY KEY,
          parent_id INTEGER,
          ord INTEGER NOT NULL,
          depth INTEGER NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          section_start INTEGER NOT NULL,
          section_end INTEGER NOT NULL
        );
      `,
    },
  ],
  learning: [
    {
      name: '2026090701_learning_core',
      sql: `
        CREATE TABLE IF NOT EXISTS learning_objects (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          text TEXT NOT NULL,
          normalized_text TEXT NOT NULL,
          language TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE (kind, language, normalized_text)
        );

        CREATE TABLE IF NOT EXISTS learning_occurrences (
          id TEXT PRIMARY KEY,
          learning_object_id TEXT NOT NULL REFERENCES learning_objects(id) ON DELETE CASCADE,
          content_id TEXT NOT NULL,
          content_version_id TEXT NOT NULL,
          locator_json TEXT NOT NULL,
          locator_key TEXT NOT NULL,
          context_text TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE (learning_object_id, locator_key)
        );

        CREATE INDEX IF NOT EXISTS idx_learning_occurrences_object
        ON learning_occurrences (learning_object_id, created_at);

        CREATE TABLE IF NOT EXISTS learning_review_items (
          id TEXT PRIMARY KEY,
          learning_object_id TEXT NOT NULL UNIQUE REFERENCES learning_objects(id) ON DELETE CASCADE,
          policy_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS learning_review_events (
          id TEXT PRIMARY KEY,
          review_item_id TEXT NOT NULL REFERENCES learning_review_items(id) ON DELETE CASCADE,
          attempt_key TEXT NOT NULL UNIQUE,
          rating TEXT NOT NULL,
          occurred_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_learning_review_events_item
        ON learning_review_events (review_item_id, occurred_at);

        CREATE TABLE IF NOT EXISTS learning_schedules (
          review_item_id TEXT PRIMARY KEY REFERENCES learning_review_items(id) ON DELETE CASCADE,
          due_at INTEGER NOT NULL,
          stability REAL NOT NULL,
          difficulty REAL NOT NULL,
          scheduled_days INTEGER NOT NULL,
          state TEXT NOT NULL,
          elapsed_days INTEGER,
          learning_steps INTEGER,
          reps INTEGER,
          lapses INTEGER,
          last_review_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_learning_schedules_due
        ON learning_schedules (due_at);

        CREATE TABLE IF NOT EXISTS learning_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          actor_id TEXT,
          aggregate_id TEXT,
          properties_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_learning_events_occurred
        ON learning_events (occurred_at);

        CREATE TABLE IF NOT EXISTS learning_today_plans (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL UNIQUE,
          generated_at INTEGER NOT NULL,
          items_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS learning_annotations (
          id TEXT PRIMARY KEY,
          content_id TEXT NOT NULL,
          content_version_id TEXT NOT NULL,
          locator_json TEXT NOT NULL,
          motivation TEXT NOT NULL,
          body TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_learning_annotations_content
        ON learning_annotations (content_id, updated_at);
      `,
    },
    {
      name: '2026090702_learning_activities',
      sql: `
        CREATE TABLE IF NOT EXISTS learning_activity_specs (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          learning_object_id TEXT NOT NULL REFERENCES learning_objects(id) ON DELETE CASCADE,
          prompt TEXT NOT NULL,
          answer TEXT NOT NULL,
          source_locator_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_learning_activity_specs_object
        ON learning_activity_specs (learning_object_id, kind);

        CREATE TABLE IF NOT EXISTS learning_activity_attempts (
          id TEXT PRIMARY KEY,
          activity_id TEXT NOT NULL REFERENCES learning_activity_specs(id) ON DELETE CASCADE,
          learning_object_id TEXT NOT NULL REFERENCES learning_objects(id) ON DELETE CASCADE,
          response TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          completed_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_learning_activity_attempts_object
        ON learning_activity_attempts (learning_object_id, completed_at);

        CREATE TABLE IF NOT EXISTS learning_activity_results (
          attempt_id TEXT PRIMARY KEY REFERENCES learning_activity_attempts(id) ON DELETE CASCADE,
          correct INTEGER NOT NULL,
          score REAL NOT NULL,
          duration_ms INTEGER NOT NULL,
          completed_at INTEGER NOT NULL
        );
      `,
    },
    {
      name: '2026090801_learning_identity',
      sql: `
        CREATE TABLE IF NOT EXISTS learning_identity_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS learning_identity_links (
          guest_id TEXT PRIMARY KEY,
          subject_id TEXT NOT NULL,
          linked_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_learning_identity_links_subject
        ON learning_identity_links (subject_id);
      `,
    },
    {
      name: '2026090802_learning_artifacts',
      sql: `
        CREATE TABLE IF NOT EXISTS learning_artifacts (
          cache_key TEXT PRIMARY KEY,
          id TEXT NOT NULL UNIQUE,
          action_id TEXT NOT NULL,
          selection_json TEXT NOT NULL,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          language TEXT NOT NULL,
          provider_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_learning_artifacts_action_created
        ON learning_artifacts (action_id, created_at DESC);
      `,
    },
    {
      name: '2026090901_learning_event_contract_v1',
      sql: `
        ALTER TABLE learning_events
        ADD COLUMN contract_version TEXT NOT NULL DEFAULT '1.0.0';

        ALTER TABLE learning_events
        ADD COLUMN client_session_id TEXT NOT NULL DEFAULT 'legacy-session';

        UPDATE learning_events
        SET properties_json = json_object(
              'objectType', COALESCE(json_extract(properties_json, '$.kind'), 'word'),
              'saveMode', 'save',
              'contentId', COALESCE(json_extract(properties_json, '$.contentId'), aggregate_id, 'legacy-content'),
              'memorySubjectId', COALESCE(aggregate_id, id)
            )
        WHERE type = 'learning_object_saved';

        UPDATE learning_events
        SET type = 'activity_completed',
            properties_json = json_object(
              'activityType', COALESCE(json_extract(properties_json, '$.activity'), 'recognition'),
              'resultBucket', CASE
                WHEN json_extract(properties_json, '$.correct') = 1 THEN 'correct'
                ELSE 'incorrect'
              END,
              'attemptId', id,
              'memorySubjectId', COALESCE(aggregate_id, id)
            )
        WHERE type = 'practice_completed';

        UPDATE learning_events
        SET type = 'memory_review_completed',
            properties_json = json_object(
              'memorySubjectId', COALESCE(json_extract(properties_json, '$.learningObjectId'), aggregate_id, id),
              'ratingClass', COALESCE(json_extract(properties_json, '$.rating'), 'again'),
              'dueDeltaBucket', 'unknown',
              'reviewEventId', id
            )
        WHERE type = 'review_completed';

        UPDATE learning_events
        SET type = 'source_context_returned'
        WHERE type = 'source_returned';

        CREATE INDEX IF NOT EXISTS idx_learning_events_session_occurred
        ON learning_events (client_session_id, occurred_at);
      `,
    },
  ],
  reedy: [
    {
      name: '2026052601_reedy_init',
      sql: `
        CREATE TABLE IF NOT EXISTS reedy_book_meta (
          book_hash TEXT PRIMARY KEY,
          indexing_status TEXT NOT NULL,
          chunk_count INTEGER NOT NULL DEFAULT 0,
          embedding_model TEXT NOT NULL,
          embedding_dim INTEGER NOT NULL,
          indexed_at INTEGER,
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS reedy_book_chunks (
          id TEXT PRIMARY KEY,
          book_hash TEXT NOT NULL,
          section_index INTEGER NOT NULL,
          chapter_title TEXT,
          start_cfi TEXT NOT NULL,
          end_cfi TEXT NOT NULL,
          position_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          token_count INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_chunks_book_position
        ON reedy_book_chunks (book_hash, position_index);

        CREATE INDEX IF NOT EXISTS idx_chunks_fts
        ON reedy_book_chunks USING fts (text) WITH (tokenizer = 'ngram');
      `,
    },
    {
      // MVP measurement (plan §M1.9). Local-only by default — no network
      // egress; the user can manually export a 90-day JSON bundle from
      // settings to share. `app_version` + `schema_version` are captured
      // per row so future bundle replay still parses cleanly after we
      // evolve the event shape.
      name: '2026052602_reedy_metrics',
      sql: `
        CREATE TABLE IF NOT EXISTS reedy_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          event TEXT NOT NULL,
          book_hash TEXT,
          session_id TEXT,
          turn_id TEXT,
          message_id TEXT,
          app_version TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          payload TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_metrics_ts ON reedy_metrics (ts DESC);
        CREATE INDEX IF NOT EXISTS idx_metrics_session ON reedy_metrics (session_id, ts DESC);
      `,
    },
    {
      // Memory store for the agent runtime (Phase 3.1). One table, three
      // scopes: user / book / session. UNIQUE(scope, scope_key, key)
      // gives us upsert semantics — writing the same key twice replaces
      // the prior summary. Embeddings live in a sibling table created
      // lazily by MemoryService (same single-model-lock pattern as
      // reedy_book_chunk_embeddings) so the vector32 dim matches the
      // active embedding model.
      name: '2026052603_reedy_memory',
      sql: `
        CREATE TABLE IF NOT EXISTS reedy_memory (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          scope_key TEXT NOT NULL,
          key TEXT NOT NULL,
          summary TEXT NOT NULL,
          source_message_id TEXT,
          updated_at INTEGER NOT NULL,
          UNIQUE(scope, scope_key, key)
        );

        CREATE INDEX IF NOT EXISTS idx_memory_scope
        ON reedy_memory (scope, scope_key, updated_at DESC);
      `,
    },
    {
      // Skill catalog for the agent runtime (Phase 5.1). Built-in skills
      // are seeded on first SkillRegistry boot; user-defined skills
      // (post-MVP) live in the same table with builtin=0. tool_allowlist
      // is a JSON-encoded string array applied by the runtime when
      // building the per-turn ToolSet.
      name: '2026052604_reedy_skills',
      sql: `
        CREATE TABLE IF NOT EXISTS reedy_skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          instructions TEXT NOT NULL,
          tool_allowlist TEXT,
          builtin INTEGER NOT NULL DEFAULT 1,
          enabled INTEGER NOT NULL DEFAULT 1
        );
      `,
    },
  ],
};

export function getMigrations(schema: SchemaType): MigrationEntry[] {
  return migrations[schema] ?? [];
}
