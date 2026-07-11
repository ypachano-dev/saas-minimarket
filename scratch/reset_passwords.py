from app.db.session import SessionLocal
from app.models.usuario import Usuario
from app.core.security import generar_hash_password

db = SessionLocal()

# List of emails to reset password to '1576'
emails = ["ypachano@gmail.com", "yhonderpachano@gmail.com"]

for email in emails:
    user = db.query(Usuario).filter(Usuario.email == email).first()
    if user:
        new_hash = generar_hash_password("1576")
        user.password_hash = new_hash
        print(f"Password reset for {email} to '1576'. New hash: {new_hash}")
    else:
        print(f"User {email} not found.")

db.commit()
db.close()
print("All passwords reset successfully in the database!")
