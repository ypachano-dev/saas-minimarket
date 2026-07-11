import sqlite3

conn = sqlite3.connect('saas_minimarket.db')
cursor = conn.cursor()

# Reset password for ypachano@gmail.com
cursor.execute(
    "UPDATE usuario SET password_hash = ? WHERE email = ?",
    ("$2b$12$Z1ZiEePHAJqik0mZE2iEUO2zZfzX64rXUcs0kkoLLcLpojLJ8jvGW", "ypachano@gmail.com")
)

# Reset password for yhonderpachano@gmail.com
cursor.execute(
    "UPDATE usuario SET password_hash = ? WHERE email = ?",
    ("$2b$12$QVFylH0xvQpdpoL48fNCv.FWCmTmUoyHshH6XHCYUJoHQgZXqIZ6.", "yhonderpachano@gmail.com")
)

conn.commit()
conn.close()
print("Passwords updated in SQLite database successfully!")
