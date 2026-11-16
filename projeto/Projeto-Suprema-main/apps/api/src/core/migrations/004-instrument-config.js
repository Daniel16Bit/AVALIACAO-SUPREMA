'use strict';
// Maximum value of the instruments outside the written exam (SAI, OSCE stations, work,
// others), declared by the teacher per assessment. A row exists only while a maximum is
// set; nothing here changes how grades are added up.
module.exports = {
  id: '004-instrument-config',
  up(db) {
    db.exec(`
      CREATE TABLE assessment_instrument_config (
        assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
        field_key TEXT NOT NULL,
        max_value REAL NOT NULL CHECK(max_value > 0),
        PRIMARY KEY(assessment_id, field_key)
      );
    `);
  }
};
