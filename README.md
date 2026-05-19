# Simulador de Parqueadero UDES - M/M/K/K

[![Static Badge](https://img.shields.io/badge/Modelo-M%2FM%2FK%2FK-blue?style=for-the-badge)](https://www.estadistica.net/IO/7-4-TEORIA-COLAS.pdf)

Este repositorio contiene un simulador web interactivo y analítico diseñado para modelar, visualizar y evaluar el comportamiento estocástico del parqueadero de motocicletas de la **Universidad de Santander (UDES)**. 

El sistema combina un motor de simulación basado en eventos discretos en el backend (desarrollado en Python) con una interfaz de usuario moderna en el frontend que incluye animaciones en tiempo real y renderizado en 3D. El objetivo del proyecto es predecir puntos de saturación, calcular tasas de rechazo por congestión basándose en teoría de colas y generar reportes ejecutivos automatizados.

---

## 📁 Estructura del Proyecto

La arquitectura del código fuente se organiza de la siguiente manera:

* **`app/`**: Núcleo del Backend en Python.
    * `main.py`: Punto de entrada del servidor FastAPI, definición de endpoints de la API y orquestación de peticiones.
    * `simulation.py`: Motor de simulación matemática construido sobre SimPy. Implementa la lógica de eventos y las métricas estacionarias teóricas de Erlang-B.
    * `reporting.py`: Módulo de post-procesamiento analítico encargado de estructurar y generar reportes exportables.
* **`static/`**: Interfaz de usuario del Frontend.
    * `index.html`: Estructura principal de la aplicación y contenedores visuales (HUD, logs y gráficos).
    * `styles.css`: Estilos de la aplicación con soporte nativo para modo oscuro y diseño adaptativo.
    * `app.js`: Lógica del cliente, peticiones asíncronas a la API, gráficos de rendimiento y renderizado de la escena en 3D.
* **`reports/`**: Directorio donde se almacenan dinámicamente los informes generados.
* **`requirements.txt`**: Archivo de gestión de dependencias del entorno de Python.

---

## 🛠️ Tecnologías Utilizadas

### Backend (Python 3)
* **FastAPI (v0.115.6)**: Framework web asíncrono y de alto rendimiento para la creación de la API.
* **SimPy (v4.1.1)**: Framework de simulación basado en eventos discretos utilizado para modelar el flujo de vehículos.
* **Pydantic (v2.10.4)**: Validación de datos y tipado estricto para los esquemas de configuración de entrada.
* **OpenPyXL (v3.1.5) & Python-Docx (v1.1.2)**: Bibliotecas utilizadas para la escritura y automatización de reportes profesionales en formatos de hojas de cálculo (Excel) y documentos de texto (Word).
* **Uvicorn (v0.34.0)**: Servidor ASGI rápido empleado para el despliegue local del backend.

### Frontend
* **Three.js (v0.160.0)**: Biblioteca de JavaScript utilizada para el renderizado de gráficos 3D acelerados por hardware en el navegador, permitiendo visualizar las motocicletas dentro del espacio simulado.
* **Chart.js (v4.4.1)**: Motor de renderizado de gráficos estadísticos para monitorizar las curvas de ocupación temporal.
* **HTML5 / CSS3 / Vanilla JS**: Componentes nativos de la web para la creación de una interfaz reactiva, limpia y optimizada sin dependencias de frameworks pesados.

---

## ⚙️ Parámetros de Simulación

El simulador permite experimentar con múltiples escenarios modificando variables clave a través del panel de control:

* **Capacidad ($K$):** El límite máximo de celdas físicas disponibles en el parqueadero.
* **Tasa de llegada ($\lambda$):** Frecuencia estimada de motocicletas que arriban al sistema por hora.
* **Tasa de servicio ($\mu$):** Velocidad inversa al tiempo promedio de permanencia de una moto en el estacionamiento.
* **Duración de la Simulación:** Ventana de tiempo establecida para el experimento (con un límite operativo de hasta 24 horas).
* **Semilla (Seed):** Valor numérico inicial para el generador pseudoaleatorio, lo que garantiza que los experimentos estocásticos sean completamente reproducibles.

---

## 📦 Instalación y Configuración

Para clonar este repositorio y ejecutar la aplicación en un entorno local, se deben seguir los siguientes pasos:

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/TU_USUARIO/udes_parking_simulation.git](https://github.com/TU_USUARIO/udes_parking_simulation.git)
    cd udes_parking_simulation
    ```

2.  **Activar el entorno virtual de Python:**
    * En Windows (PowerShell):
        ```powershell
        .\venv\Scripts\Activate.ps1
        ```
    * En Linux/macOS:
        ```bash
        source venv/bin/activate
        ```

3.  **Instalar las dependencias del sistema:**
    *(En caso de requerir una actualización o reinstalación de los paquetes)*
    ```bash
    pip install -r requirements.txt
    ```

4.  **Iniciar el servidor de desarrollo:**
    Ejecutar Uvicorn apuntando a la instancia de FastAPI con la bandera de recarga automática activada:
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```

5.  **Acceso a la plataforma:**
    Una vez inicializado el servidor, abrir el navegador web e ingresar a la dirección local: [http://127.0.0.1:8000](http://127.0.0.1:8000).

---

## 📄 Licencia

Este proyecto está bajo la **Licencia MIT**. Esto significa que eres libre de usar, modificar y distribuir el código.
