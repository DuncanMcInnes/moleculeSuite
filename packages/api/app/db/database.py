import os
import sqlite3


DB_PATH = os.getenv("JOB_DB_PATH", "data/jobs/jobs.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_connection()
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id           TEXT PRIMARY KEY,
            module       TEXT NOT NULL,
            status       TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            started_at   TEXT,
            completed_at TEXT,
            parameters   TEXT NOT NULL,
            error        TEXT,
            output_dir   TEXT
        )
    """)
    conn.commit()
    conn.close()
