//! SQLite access via rusqlite.

use parking_lot::Mutex;
use regex::Regex;
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection};
use serde_json::{Map, Number, Value as JsonValue};
use std::path::Path;
use std::sync::OnceLock;

const DB_FILE: &str = "zerosort.db";

pub struct DatabaseManager {
    conn: Mutex<Connection>,
}

impl DatabaseManager {
    pub fn new(app_data_dir: &Path) -> Result<Self, String> {
        let db_path = app_data_dir.join(DB_FILE);
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {e}"))?;
        conn.pragma_update(None, "foreign_keys", true)
            .map_err(|e| format!("Failed to enable foreign_keys: {e}"))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| format!("Failed to enable WAL: {e}"))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn select(&self, sql: &str, params: &[JsonValue]) -> Result<Vec<JsonValue>, String> {
        let (normalized_sql, normalized_params) = normalize_sql_bindings(sql, params)?;
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(&normalized_sql)
            .map_err(|e| format!("Failed to prepare select: {e}"))?;

        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|name| name.to_string())
            .collect();

        let rows = stmt
            .query_map(params_from_iter(json_params_to_sql(&normalized_params)?), |row| {
                let mut map = Map::new();
                for (index, name) in column_names.iter().enumerate() {
                    let value: SqlValue = row.get(index)?;
                    map.insert(name.clone(), sql_value_to_json(value));
                }
                Ok(JsonValue::Object(map))
            })
            .map_err(|e| format!("Failed to query: {e}"))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Failed to read row: {e}"))?);
        }
        Ok(results)
    }

    pub fn execute(&self, sql: &str, params: &[JsonValue]) -> Result<u64, String> {
        let (normalized_sql, normalized_params) = normalize_sql_bindings(sql, params)?;
        let conn = self.conn.lock();
        let changes = conn
            .execute(
                &normalized_sql,
                params_from_iter(json_params_to_sql(&normalized_params)?),
            )
            .map_err(|e| format!("Failed to execute: {e}"))?;
        Ok(changes as u64)
    }
}

fn dollar_param_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\$(\d+)").expect("valid regex"))
}

/// Converts `$1`-style bindings to `?` positional bindings.
pub fn normalize_sql_bindings(
    sql: &str,
    params: &[JsonValue],
) -> Result<(String, Vec<JsonValue>), String> {
    if params.is_empty() || !sql.contains('$') {
        return Ok((sql.to_string(), params.to_vec()));
    }

    let mut normalized_params = Vec::new();
    let normalized_sql = dollar_param_regex()
        .replace_all(sql, |caps: &regex::Captures| {
            let raw_index: usize = caps[1].parse().unwrap_or(0);
            if raw_index == 0 || raw_index > params.len() {
                return format!("${raw_index}");
            }
            normalized_params.push(params[raw_index - 1].clone());
            "?".to_string()
        })
        .to_string();

    if normalized_sql.contains('$') && dollar_param_regex().is_match(&normalized_sql) {
        return Err("Missing SQL parameter for $ binding".to_string());
    }

    Ok((normalized_sql, normalized_params))
}

fn json_params_to_sql(params: &[JsonValue]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(json_to_sql_value).collect()
}

fn json_to_sql_value(value: &JsonValue) -> Result<SqlValue, String> {
    match value {
        JsonValue::Null => Ok(SqlValue::Null),
        JsonValue::Bool(b) => Ok(SqlValue::Integer(if *b { 1 } else { 0 })),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(SqlValue::Integer(i))
            } else if let Some(f) = n.as_f64() {
                Ok(SqlValue::Real(f))
            } else {
                Err("Unsupported number".to_string())
            }
        }
        JsonValue::String(s) => Ok(SqlValue::Text(s.clone())),
        other => Ok(SqlValue::Text(
            serde_json::to_string(other).map_err(|e| e.to_string())?,
        )),
    }
}

fn sql_value_to_json(value: SqlValue) -> JsonValue {
    match value {
        SqlValue::Null => JsonValue::Null,
        SqlValue::Integer(i) => JsonValue::Number(Number::from(i)),
        SqlValue::Real(f) => Number::from_f64(f)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        SqlValue::Text(s) => JsonValue::String(s),
        SqlValue::Blob(b) => JsonValue::Array(
            b.into_iter()
                .map(|byte| JsonValue::Number(Number::from(byte)))
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_dollar_bindings() {
        let (sql, params) =
            normalize_sql_bindings("SELECT * FROM t WHERE id = $1 AND name = $2", &[
                json!(1),
                json!("a"),
            ])
            .unwrap();
        assert_eq!(sql, "SELECT * FROM t WHERE id = ? AND name = ?");
        assert_eq!(params, vec![json!(1), json!("a")]);
    }

    #[test]
    fn leaves_question_mark_bindings() {
        let (sql, params) =
            normalize_sql_bindings("SELECT * FROM t WHERE id = ?", &[json!(1)]).unwrap();
        assert_eq!(sql, "SELECT * FROM t WHERE id = ?");
        assert_eq!(params, vec![json!(1)]);
    }
}
