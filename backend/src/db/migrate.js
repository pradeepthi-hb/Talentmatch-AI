// Run with: npm run migrate
// Creates the full TalentMatch schema if it does not already exist.

import "dotenv/config";
import mysql from "mysql2/promise";

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    timezone: "+00:00",
    multipleStatements: true,
  });

  const db = process.env.DB_NAME || "talentmatch";

  console.log(`Running migrations for database: ${db}`);

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`Database '${db}' ready`);

  await conn.query(`USE \`${db}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table 'users' ready");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      job_description LONGTEXT NOT NULL,
      jd_hash CHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_analyses_user_updated (user_id, updated_at),
      KEY idx_analyses_jd_hash (jd_hash),
      CONSTRAINT fk_analyses_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table 'analyses' ready");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      analysis_id INT UNSIGNED NOT NULL,
      name VARCHAR(150) NOT NULL,
      resume_text LONGTEXT NULL,
      resume_path VARCHAR(500) NULL,
      file_name VARCHAR(255) NULL,
      mime_type VARCHAR(150) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_candidates_analysis_created (analysis_id, created_at),
      KEY idx_candidates_analysis_name (analysis_id, name),
      CONSTRAINT fk_candidates_analysis
        FOREIGN KEY (analysis_id) REFERENCES analyses(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table 'candidates' ready");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      candidate_id INT UNSIGNED NOT NULL,
      result_json LONGTEXT NOT NULL,
      match_score DECIMAL(5,2) NOT NULL DEFAULT 0,
      is_outdated TINYINT(1) NOT NULL DEFAULT 0,
      analyzed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      UNIQUE KEY uq_analysis_results_candidate (candidate_id),
      KEY idx_analysis_results_match_score (match_score),
      KEY idx_analysis_results_outdated (is_outdated),
      CONSTRAINT fk_analysis_results_candidate
        FOREIGN KEY (candidate_id) REFERENCES candidates(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table 'analysis_results' ready");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS interview_questions (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      candidate_id INT UNSIGNED NOT NULL,
      question TEXT NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'Custom',
      answer LONGTEXT NULL,
      rating TINYINT UNSIGNED NOT NULL DEFAULT 0,
      is_global TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_interview_questions_candidate_sort (candidate_id, sort_order, created_at),
      KEY idx_interview_questions_candidate_global (candidate_id, is_global),
      CONSTRAINT fk_interview_questions_candidate
        FOREIGN KEY (candidate_id) REFERENCES candidates(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table 'interview_questions' ready");

  await conn.end();
  console.log("Migration complete");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
