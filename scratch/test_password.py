import bcrypt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

hash_ypachano = "$2b$12$VlhyjdOPzcw6JDQVCDEVBO1sIRqTlOwreicNPlhOXEVSk3BWiAqQK"
hash_yhonder = "$2b$12$VOx7vbNKI.IAfnaCkyZFDOxcPnFBix98cva1xlhmLeUb2F9NVIJM6"

print("ypachano with 1576:", pwd_context.verify("1576", hash_ypachano))
print("yhonder with 1576:", pwd_context.verify("1576", hash_yhonder))

# Test other common passwords
for pw in ["1234", "123456", "admin", "password", "1576", "Demo1234"]:
    if pwd_context.verify(pw, hash_ypachano):
        print("FOUND ypachano password:", pw)
    if pwd_context.verify(pw, hash_yhonder):
        print("FOUND yhonder password:", pw)
