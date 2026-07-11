from app.core.security import verificar_password

hash_ypachano = "$2b$12$Z1ZiEePHAJqik0mZE2iEUO2zZfzX64rXUcs0kkoLLcLpojLJ8jvGW"
print("Verificación de nueva contraseña:", verificar_password("1576", hash_ypachano))
