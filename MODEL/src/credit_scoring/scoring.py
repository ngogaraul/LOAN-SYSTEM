from __future__ import annotations

from typing import Mapping


RISK_ORDER = {
    "Low Risk": 0.0,
    "Medium Risk": 1.0,
    "High Risk": 2.0,
}


def expected_risk_severity(probabilities: Mapping[str, float]) -> float:
    total = 0.0
    for label, weight in RISK_ORDER.items():
        total += float(probabilities.get(label, 0.0)) * weight
    return total


def risk_probabilities_to_score(probabilities: Mapping[str, float]) -> int:
    severity = expected_risk_severity(probabilities)
    normalized = min(max(severity / 2.0, 0.0), 1.0)
    score = round(850 - (normalized * 550))
    return int(min(max(score, 300), 850))


def score_to_flag(score: int) -> str:
    if score >= 740:
        return "PASS"
    if score >= 670:
        return "REVIEW"
    if score >= 580:
        return "CAUTION"
    return "HIGH_RISK"


def score_to_band(score: int) -> str:
    if score >= 800:
        return "Exceptional"
    if score >= 740:
        return "Very Good"
    if score >= 670:
        return "Good"
    if score >= 580:
        return "Fair"
    return "Poor"
