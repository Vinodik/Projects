import sqlite3

conn = sqlite3.connect("database.db")
cursor = conn.cursor()

cursor.execute("PRAGMA foreign_keys = OFF;")
cursor.execute("DELETE FROM requests;")
cursor.execute("DELETE FROM sqlite_sequence WHERE name='requests';")
cursor.execute("PRAGMA foreign_keys = ON;")

conn.commit()
conn.close()
print("All requests cleared successfully!")
