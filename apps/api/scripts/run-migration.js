#!/usr/bin/env node
/**
 * Run database migrations locally
 *
 * Usage:
 *   node scripts/run-migration.js <migration-file>
 *   node scripts/run-migration.js migrations/005_merge_boa_cash_rewards.sql
 *
 * Requires .env file with database credentials:
 *   ENDPOINT, DATABASE, USERNAME, PASSWORD
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigration(migrationFile) {
  const filePath = path.resolve(__dirname, '..', migrationFile);

  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Running migration: ${migrationFile}`);
  console.log('─'.repeat(60));

  const sql = fs.readFileSync(filePath, 'utf8');

  // Split by semicolons but handle the comments
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  const connection = await mysql.createConnection({
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
    multipleStatements: true,
  });

  try {
    // Run the entire SQL file as one statement (handles variables)
    console.log('Executing migration...\n');
    const [results] = await connection.query(sql);

    // Results may be an array of results for multiple statements
    if (Array.isArray(results)) {
      results.forEach((result, i) => {
        if (result.affectedRows !== undefined) {
          console.log(`Statement ${i + 1}: ${result.affectedRows} row(s) affected`);
        }
      });
    } else if (results.affectedRows !== undefined) {
      console.log(`${results.affectedRows} row(s) affected`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Parse command line arguments
const [,, migrationFile] = process.argv;

if (!migrationFile) {
  console.log(`
Database Migration Runner

Usage:
  node scripts/run-migration.js <migration-file>

Example:
  node scripts/run-migration.js migrations/005_merge_boa_cash_rewards.sql

Environment (from .env):
  ENDPOINT   Database host
  DATABASE   Database name
  USERNAME   Database user
  PASSWORD   Database password
  `);
  process.exit(0);
}

runMigration(migrationFile);
