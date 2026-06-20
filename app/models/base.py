from sqlalchemy.orm import DeclarativeBase, declared_attr

class Base(DeclarativeBase):
    """
    Clase base para todos los modelos del ORM.
    Automatiza la creación de nombres de tablas en la base de datos.
    """
    @declared_attr.directive
    def __tablename__(cls) -> str:
        # Si la clase se llama 'Producto', la tabla en MySQL se llamará 'producto'
        return cls.__name__.lower()
        