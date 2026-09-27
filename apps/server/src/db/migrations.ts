/**
 * Migrações versionadas e imutáveis. Nunca edite uma migração aplicada: crie a próxima.
 */
export const MIGRATIONS: readonly {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}[] = [
  {
    version: 1,
    name: 'init',
    sql: `
      CREATE TABLE profiles (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        token_hash       TEXT NOT NULL UNIQUE,
        xp               INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
        rating           INTEGER NOT NULL DEFAULT 1000,
        games            INTEGER NOT NULL DEFAULT 0,
        wins             INTEGER NOT NULL DEFAULT 0,
        losses           INTEGER NOT NULL DEFAULT 0,
        draws            INTEGER NOT NULL DEFAULT 0,
        current_streak   INTEGER NOT NULL DEFAULT 0,
        best_streak      INTEGER NOT NULL DEFAULT 0,
        study_streak     INTEGER NOT NULL DEFAULT 0,
        last_study_day   TEXT,
        studies_solved   INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL,
        last_seen_at     TEXT NOT NULL
      ) STRICT;

      CREATE TABLE games (
        id              TEXT PRIMARY KEY,
        variant         TEXT NOT NULL CHECK (variant IN ('brazilian', 'international', 'canadian')),
        mode            TEXT NOT NULL CHECK (mode IN ('ai', 'lan')),
        status          TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'finished')),
        room_code       TEXT UNIQUE,
        white_id        TEXT REFERENCES profiles (id) ON DELETE SET NULL,
        black_id        TEXT REFERENCES profiles (id) ON DELETE SET NULL,
        white_name      TEXT NOT NULL,
        black_name      TEXT NOT NULL,
        ai_level        INTEGER CHECK (ai_level BETWEEN 1 AND 10),
        ai_side         TEXT CHECK (ai_side IN ('white', 'black')),
        start_fen       TEXT NOT NULL,
        moves           TEXT NOT NULL DEFAULT '[]',
        time_control    TEXT,
        clock           TEXT,
        mentor          INTEGER NOT NULL DEFAULT 0,
        assisted        INTEGER NOT NULL DEFAULT 0,
        hints           INTEGER NOT NULL DEFAULT 0,
        takebacks       INTEGER NOT NULL DEFAULT 0,
        winner          TEXT CHECK (winner IN ('white', 'black')),
        end_reason      TEXT,
        white_accuracy  REAL,
        black_accuracy  REAL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        finished_at     TEXT
      ) STRICT;
      CREATE INDEX games_white ON games (white_id, created_at DESC);
      CREATE INDEX games_black ON games (black_id, created_at DESC);
      CREATE INDEX games_status ON games (status);

      CREATE TABLE move_reviews (
        game_id         TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
        ply             INTEGER NOT NULL,
        side            TEXT NOT NULL CHECK (side IN ('white', 'black')),
        notation        TEXT NOT NULL,
        classification  TEXT,
        accuracy        REAL,
        eval_white      INTEGER NOT NULL,
        best_notation   TEXT,
        best_pv         TEXT NOT NULL DEFAULT '[]',
        headline        TEXT,
        details         TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (game_id, ply)
      ) STRICT;

      CREATE TABLE achievements (
        profile_id   TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        key          TEXT NOT NULL,
        unlocked_at  TEXT NOT NULL,
        PRIMARY KEY (profile_id, key)
      ) STRICT;

      CREATE TABLE xp_events (
        id          INTEGER PRIMARY KEY,
        profile_id  TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        amount      INTEGER NOT NULL,
        reason      TEXT NOT NULL,
        game_id     TEXT,
        created_at  TEXT NOT NULL
      ) STRICT;
      CREATE INDEX xp_events_profile ON xp_events (profile_id, created_at DESC);

      CREATE TABLE rating_history (
        id          INTEGER PRIMARY KEY,
        profile_id  TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        rating      INTEGER NOT NULL,
        game_id     TEXT,
        created_at  TEXT NOT NULL
      ) STRICT;
      CREATE INDEX rating_history_profile ON rating_history (profile_id, created_at);

      CREATE TABLE study_cases (
        id               TEXT PRIMARY KEY,
        profile_id       TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        variant          TEXT NOT NULL,
        fen              TEXT NOT NULL,
        title            TEXT NOT NULL,
        notes            TEXT NOT NULL DEFAULT '',
        source           TEXT NOT NULL CHECK (source IN ('mistake', 'manual')),
        game_id          TEXT REFERENCES games (id) ON DELETE SET NULL,
        ply              INTEGER,
        played_notation  TEXT,
        best_notation    TEXT,
        best_line        TEXT NOT NULL DEFAULT '[]',
        headline         TEXT,
        classification   TEXT,
        due_at           TEXT NOT NULL,
        interval_days    REAL NOT NULL DEFAULT 0,
        ease             REAL NOT NULL DEFAULT 2.5,
        reps             INTEGER NOT NULL DEFAULT 0,
        lapses           INTEGER NOT NULL DEFAULT 0,
        last_result      TEXT CHECK (last_result IN ('correct', 'incorrect')),
        created_at       TEXT NOT NULL,
        UNIQUE (profile_id, game_id, ply)
      ) STRICT;
      CREATE INDEX study_cases_due ON study_cases (profile_id, due_at);
    `,
  },
];
