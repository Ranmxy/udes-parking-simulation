from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .reporting import REPORT_DIR, build_reports
from .simulation import SimulationConfig, run_simulation


class ConfigIn(BaseModel):
    capacity: int = Field(250, ge=1, le=2000)
    arrival_rate: float = Field(108.4, gt=0)
    service_rate: float = Field(0.2923, gt=0)
    duration_hours: float = Field(14.0, gt=0, le=24)
    start_hour: float = Field(6.0, ge=0, lt=24)
    seed: int = Field(2190132005)
    visible_limit: int = Field(1000, ge=20) # ,le=300


app = FastAPI(title="Simulador Parqueadero UDES", version="1.0.0")
app.mount("/static", StaticFiles(directory="static"), name="static")


LAST_RESULT: dict[str, Any] | None = None


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors_dict = {
        "capacity": "Capacidad (K)",
        "arrival_rate": "Tasa de llegada (λ)",
        "service_rate": "Tasa de servicio (μ)",
        "duration_hours": "Duración en horas",
        "start_hour": "Hora inicial",
        "seed": "Semilla",
        "visible_limit": "Motos visibles en 3D"
    }
    
    translated_errors = []
    for error in exc.errors():
        field = error.get("loc", ["campo"])[-1]
        field_name = errors_dict.get(field, field)
        msg_type = error.get("type", "")
        ctx = error.get("ctx", {})
        
        if "greater_than_equal" in msg_type:
            translated_errors.append(f"• {field_name}: Debe ser mayor o igual a {ctx.get('ge')}.")
        elif "less_than_equal" in msg_type:
            translated_errors.append(f"• {field_name}: Debe ser menor o igual a {ctx.get('le')}.")
        elif "greater_than" in msg_type:
            translated_errors.append(f"• {field_name}: Debe ser estrictamente mayor que {ctx.get('gt')}.")
        elif "less_than" in msg_type:
            translated_errors.append(f"• {field_name}: Debe ser estrictamente menor que {ctx.get('lt')}.")
        else:
            translated_errors.append(f"• {field_name}: El valor ingresado no es válido.")
            
    return JSONResponse(
        status_code=400,
        content={"detail": "Parámetros inválidos detectados", "errors": translated_errors}
    )


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


@app.post("/api/simulate")
def simulate(config_in: ConfigIn) -> dict[str, Any]:
    global LAST_RESULT
    config = SimulationConfig(**config_in.model_dump())
    LAST_RESULT = run_simulation(config)
    return LAST_RESULT


@app.post("/api/report")
def report(payload: dict[str, Any] | None = None) -> dict[str, str]:
    source = payload or LAST_RESULT
    if not source:
        raise HTTPException(status_code=400, detail="Ejecuta una simulación antes de generar el informe.")
    files = build_reports(source)
    return {
        "html_preview": f"/reports/{files['html']}",
        "docx_preview": f"/reports/{files['docx']}",
        "docx_download": f"/reports/{files['docx']}?download=1",
        "xlsx_preview": f"/reports/{files['xlsx']}",
        "xlsx_download": f"/reports/{files['xlsx']}?download=1",
    }


@app.get("/reports/{filename}")
def get_report(filename: str, download: int = 0) -> FileResponse:
    path = (REPORT_DIR / filename).resolve()
    report_root = REPORT_DIR.resolve()
    if report_root not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Informe no encontrado.")
    disposition = "attachment" if download else "inline"
    media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if filename.endswith(".xlsx"):
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if filename.endswith(".html"):
        media = "text/html; charset=utf-8"
    return FileResponse(path, media_type=media, filename=filename, content_disposition_type=disposition)
