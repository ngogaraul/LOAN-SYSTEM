from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class LoanRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    Account: str = Field(min_length=1, max_length=64)
    Creditline: str = Field(min_length=1, max_length=64)
    Outstanding: float = Field(ge=0)
    Payment_plan: float = Field(alias="Payment plan", gt=0)
    Start_date: date = Field(alias="Start date")
    Duration: int = Field(gt=0, le=600)
    Remaining_Period: int = Field(alias="Remaining Period", ge=0, le=600)
    Periodicity: int = Field(ge=0, le=365)
    FICO_Score: float | None = Field(alias="FICO Score", ge=300, le=850, default=None)
    Compulsory_saving: float = Field(alias="Compulsory saving", ge=0, default=0)
    Voluntary_saving: float = Field(alias="Voluntary saving", ge=0, default=0)
    Salary: float = Field(ge=0, default=0)

    @field_validator("Account", "Creditline")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        if not value:
            raise ValueError("Identifier cannot be empty.")
        return value

    @model_validator(mode="after")
    def validate_periods(self) -> "LoanRecord":
        if self.Remaining_Period > self.Duration:
            raise ValueError("Remaining Period cannot exceed Duration.")
        return self

    def to_feature_record(self) -> dict[str, object]:
        payload = self.model_dump(by_alias=True)
        payload["Account"] = str(payload["Account"])
        payload["Creditline"] = str(payload["Creditline"])
        return payload


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    records: list[LoanRecord] = Field(min_length=1, max_length=500)


class PredictionResult(BaseModel):
    account: str
    creditline: str
    predicted_target: str
    fico_like_score: int
    score_band: str
    risk_flag: str
    probabilities: dict[str, float]
    top_factors: list[dict[str, float | str]]


class PredictionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_count: int
    results: list[PredictionResult]


class HealthResponse(BaseModel):
    status: str
    model_dir: str
