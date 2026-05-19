from __future__ import annotations

import heapq
import math
import random
from dataclasses import dataclass
from typing import Any

import simpy


@dataclass(frozen=True)
class SimulationConfig:
    capacity: int = 250
    arrival_rate: float = 108.4
    service_rate: float = 0.2923
    duration_hours: float = 14.0
    start_hour: float = 6.0
    seed: int = 2190132005
    visible_limit: int = 1000


def erlang_b(offered_traffic: float, capacity: int) -> float:
    if capacity <= 0:
        return 1.0
    b = 1.0
    for n in range(1, capacity + 1):
        b = (offered_traffic * b) / (n + offered_traffic * b)
    return b


def theoretical_metrics(config: SimulationConfig) -> dict[str, float]:
    k = max(config.capacity, 0)
    lam = max(config.arrival_rate, 0.0)
    mu = max(config.service_rate, 0.0)
    offered = lam / mu if mu > 0 else math.inf
    rejection = erlang_b(offered, k) if math.isfinite(offered) else 1.0
    effective = lam * (1.0 - rejection)
    average_inside = effective / mu if mu > 0 else 0.0
    utilization = average_inside / k if k > 0 else 0.0
    p0 = _p0(offered, k) if math.isfinite(offered) else 0.0
    return {
        "offered_traffic": offered,
        "p0": p0,
        "pk": rejection,
        "lambda_effective": effective,
        "average_occupancy": min(average_inside, k),
        "rho": min(utilization, 1.0),
    }


def _p0(offered_traffic: float, capacity: int) -> float:
    if capacity <= 0:
        return 1.0
    terms = [0.0] * (capacity + 1)
    terms[0] = 1.0
    for n in range(1, capacity + 1):
        terms[n] = terms[n - 1] * offered_traffic / n
    return 1.0 / sum(terms)


def run_simulation(config: SimulationConfig) -> dict[str, Any]:
    rng = random.Random(config.seed)
    env = simpy.Environment()
    occupied_slots: set[int] = set()
    released_slots: list[int] = []
    next_slot = 0
    events: list[dict[str, Any]] = []
    moto_log: dict[int, dict[str, Any]] = {}
    timeline: list[dict[str, float]] = [{"t": 0.0, "occupancy": 0, "rejected": 0, "accepted": 0}]
    durations: list[float] = []
    accepted = 0
    rejected = 0
    area_occupancy = 0.0
    full_time = 0.0
    last_t = 0.0

    def sample_interarrival() -> float:
        if config.arrival_rate <= 0:
            return math.inf
        return rng.expovariate(config.arrival_rate)

    def sample_stay() -> float:
        if config.service_rate <= 0:
            return config.duration_hours
        return rng.expovariate(config.service_rate)

    def update_integrals(now: float) -> None:
        nonlocal area_occupancy, full_time, last_t
        delta = max(now - last_t, 0.0)
        occupancy = len(occupied_slots)
        area_occupancy += occupancy * delta
        if occupancy >= config.capacity and config.capacity > 0:
            full_time += delta
        last_t = now

    def allocate_slot() -> int:
        nonlocal next_slot
        if released_slots:
            return heapq.heappop(released_slots)
        slot = next_slot
        next_slot += 1
        return slot

    def moto_lifecycle(moto_id: int, slot: int, stay: float):
        nonlocal accepted
        accepted += 1
        durations.append(stay)
        control_card = f"TARJ-{slot + 1:03d}"
        color = _bike_color(moto_id)
        moto_log[moto_id] = {
            "id": moto_id,
            "control_card": control_card,
            "slot": slot + 1,
            "entry_time": env.now,
            "entry_clock": clock_label(config.start_hour, env.now),
            "scheduled_stay_hours": stay,
            "status": "dentro",
            "exit_time": None,
            "exit_clock": None,
            "stay_hours": None,
        }
        events.append({"t": env.now, "type": "arrival", "id": moto_id, "control_card": control_card, "slot": slot, "stay": stay, "color": color})
        timeline.append({"t": env.now, "occupancy": len(occupied_slots), "rejected": rejected, "accepted": accepted})
        yield env.timeout(stay)
        update_integrals(env.now)
        occupied_slots.remove(slot)
        heapq.heappush(released_slots, slot)
        moto_log[moto_id]["status"] = "salio"
        moto_log[moto_id]["exit_time"] = env.now
        moto_log[moto_id]["exit_clock"] = clock_label(config.start_hour, env.now)
        moto_log[moto_id]["stay_hours"] = stay
        events.append({"t": env.now, "type": "departure", "id": moto_id, "control_card": control_card, "slot": slot})
        timeline.append({"t": env.now, "occupancy": len(occupied_slots), "rejected": rejected, "accepted": accepted})

    def arrivals():
        nonlocal rejected
        moto_id = 0
        while True:
            yield env.timeout(sample_interarrival())
            if env.now > config.duration_hours:
                break
            update_integrals(env.now)
            moto_id += 1
            if len(occupied_slots) >= config.capacity:
                rejected += 1
                moto_log[moto_id] = {
                    "id": moto_id,
                    "control_card": "SIN ASIGNAR",
                    "slot": None,
                    "entry_time": env.now,
                    "entry_clock": clock_label(config.start_hour, env.now),
                    "scheduled_stay_hours": None,
                    "status": "rechazada",
                    "exit_time": None,
                    "exit_clock": None,
                    "stay_hours": None,
                }
                events.append({"t": env.now, "type": "rejected", "id": moto_id, "control_card": "SIN ASIGNAR"})
                timeline.append({"t": env.now, "occupancy": len(occupied_slots), "rejected": rejected, "accepted": accepted})
                continue
            slot = allocate_slot()
            occupied_slots.add(slot)
            env.process(moto_lifecycle(moto_id, slot, sample_stay()))

    env.process(arrivals())
    env.run(until=config.duration_hours)
    update_integrals(config.duration_hours)

    total = accepted + rejected
    simulated = {
        "arrivals": total,
        "accepted": accepted,
        "rejected": rejected,
        "rejection_probability": rejected / total if total else 0.0,
        "average_occupancy": area_occupancy / config.duration_hours if config.duration_hours else 0.0,
        "utilization": area_occupancy / (config.capacity * config.duration_hours) if config.capacity and config.duration_hours else 0.0,
        "full_time_ratio": full_time / config.duration_hours if config.duration_hours else 0.0,
        "average_stay": sum(durations) / len(durations) if durations else 0.0,
        "throughput_per_hour": accepted / config.duration_hours if config.duration_hours else 0.0,
    }
    return {
        "config": config.__dict__,
        "theoretical": theoretical_metrics(config),
        "simulated": simulated,
        "events": events,
        "timeline": _compress_timeline(timeline, 700),
        "moto_log": list(moto_log.values()),
        "analysis": analyze(config, theoretical_metrics(config), simulated),
    }


def clock_label(start_hour: float, offset_hours: float) -> str:
    total_minutes = int(round((start_hour + offset_hours) * 60))
    total_minutes %= 24 * 60
    return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"


def _bike_color(moto_id: int) -> str:
    palette = ["#16d17a", "#2f80ed", "#f2c94c", "#eb5757", "#bb6bd9", "#f2994a", "#56ccf2", "#27ae60"]
    return palette[moto_id % len(palette)]


def _compress_timeline(points: list[dict[str, float]], limit: int) -> list[dict[str, float]]:
    if len(points) <= limit:
        return points
    step = math.ceil(len(points) / limit)
    return [points[i] for i in range(0, len(points), step)]


def analyze(config: SimulationConfig, theoretical: dict[str, float], simulated: dict[str, float]) -> dict[str, Any]:
    rejection = max(simulated["rejection_probability"], theoretical["pk"])
    utilization = max(simulated["utilization"], theoretical["rho"])
    offered = theoretical["offered_traffic"]
    recommendations: list[str] = []
    findings: list[str] = []

    if utilization >= 0.95:
        findings.append("El parqueadero opera en saturación: la mayoría de cupos permanece ocupada durante casi toda la jornada.")
        recommendations.append("Aumentar capacidad, habilitar un parqueadero alterno o aplicar cupos por franja horaria para bajar el bloqueo.")
    elif utilization >= 0.80:
        findings.append("La ocupación es alta pero manejable; el sistema puede deteriorarse con pequeños aumentos de demanda.")
        recommendations.append("Monitorear horas pico y reservar capacidad de contingencia.")
    else:
        findings.append("La ocupación promedio deja margen operativo y el sistema no parece estar presionado de forma crítica.")
        recommendations.append("Mantener la capacidad actual y revisar si existen periodos concretos de concentración de demanda.")

    if rejection >= 0.20:
        findings.append("La probabilidad de rechazo es crítica: una fracción importante de usuarios no logra ingresar.")
        recommendations.append("Reducir la tasa de llegada efectiva con gestión de demanda o aumentar cupos disponibles.")
    elif rejection >= 0.05:
        findings.append("El rechazo existe en niveles relevantes y puede afectar la percepción del servicio.")
        recommendations.append("Evaluar ampliaciones pequeñas y señalización temprana de disponibilidad.")
    else:
        findings.append("El rechazo simulado es bajo y la capacidad atiende la mayor parte de la demanda.")

    if offered > config.capacity:
        findings.append(f"El tráfico ofrecido A={offered:.2f} supera la capacidad K={config.capacity}; matemáticamente el bloqueo es esperable.")
    else:
        findings.append(f"El tráfico ofrecido A={offered:.2f} está por debajo de K={config.capacity}; el bloqueo depende más de la variabilidad que de la capacidad base.")

    if simulated["average_stay"] > 4:
        recommendations.append("Como la permanencia promedio es larga, conviene incentivar rotación o separar usuarios de larga estancia.")

    return {
        "severity": "crítico" if rejection >= 0.20 or utilization >= 0.98 else "alto" if rejection >= 0.05 or utilization >= 0.90 else "estable",
        "findings": findings,
        "recommendations": recommendations,
        "summary": (
            f"Con K={config.capacity}, λ={config.arrival_rate:.2f}/h y μ={config.service_rate:.4f}/h, "
            f"la simulación aceptó {simulated['accepted']} motos y rechazó {simulated['rejected']}. "
            f"La utilización simulada fue {simulated['utilization'] * 100:.2f}% y la utilización teórica estacionaria "
            f"fue {theoretical['rho'] * 100:.2f}%."
        ),
    }
