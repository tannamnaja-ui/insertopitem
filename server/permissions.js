const db = require('./db');

async function hasTaskAccess(username, taskId) {
  const officers = await db.query('SELECT officer_id FROM officer WHERE officer_login_name = ?', [username]);
  if (!officers.length) return false;
  const officerId = officers[0].officer_id;

  const rows = await db.query(
    `SELECT l.officer_id
     FROM officer_group_task_access t
     LEFT OUTER JOIN officer_group g ON g.officer_group_id = t.officer_group_id
     LEFT OUTER JOIN officer_group_list l ON l.officer_group_id = g.officer_group_id
     WHERE l.officer_id = ? AND t.officer_task_id = ?`,
    [officerId, String(taskId)]
  );
  return rows.length > 0;
}

module.exports = { hasTaskAccess };
