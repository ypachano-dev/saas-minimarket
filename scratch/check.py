import sqlite3
con = sqlite3.connect('saas_minimarket.db')
cur = con.cursor()
cur.execute("SELECT id, empresa_id, nombre, email, rol, status FROM usuario")
print("Users:")
for row in cur.fetchall():
    print(row)
con.close()
