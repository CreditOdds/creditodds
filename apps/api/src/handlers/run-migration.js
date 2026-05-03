const fs = require('fs');
const path = require('path');
const mysql = require("../db");

exports.RunMigrationHandler = async (event) => {
  const migrationFile = event.migration || event.queryStringParameters?.migration;
  if (!migrationFile) {
    return { statusCode: 400, body: 'migration parameter required' };
  }

  const filePath = path.resolve(__dirname, '../../migrations', migrationFile);
  if (!fs.existsSync(filePath)) {
    return { statusCode: 404, body: `Migration file not found: ${migrationFile}` };
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Running migration: ${migrationFile}`);

  try {
    const results = await mysql.query(sql);
    await mysql.end();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Migration completed', results }),
    };
  } catch (error) {
    console.error('Migration failed:', error);
    await mysql.end();
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
