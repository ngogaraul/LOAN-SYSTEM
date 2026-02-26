from __future__ import annotations

from sqlalchemy import (
    String, Integer, Float, DateTime, ForeignKey, Text, JSON, func
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="ANALYST")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

    # ✅ FIX: relationship names must match back_populates
    financials: Mapped["ClientFinancial"] = relationship(back_populates="client", uselist=False)
    applications: Mapped[list["LoanApplication"]] = relationship(back_populates="client")


class ClientFinancial(Base):
    __tablename__ = "client_financials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), unique=True)

    outstanding: Mapped[float] = mapped_column(Float, default=0)
    payment_plan: Mapped[float] = mapped_column(Float, default=0)
    remaining_period: Mapped[float] = mapped_column(Float, default=0)
    periodicity: Mapped[float] = mapped_column(Float, default=0)
    class_value: Mapped[float] = mapped_column(Float, default=0)
    compulsory_saving: Mapped[float] = mapped_column(Float, default=0)
    voluntary_saving: Mapped[float] = mapped_column(Float, default=0)
    salary: Mapped[float] = mapped_column(Float, default=0)
    duration: Mapped[float] = mapped_column(Float, default=0)
    start_date: Mapped[str] = mapped_column(String(30), default="")

    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    client: Mapped["Client"] = relationship(back_populates="financials")


class LoanApplication(Base):
    __tablename__ = "loan_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))

    # ✅ NEW: store creditline from Excel to avoid duplicates
    creditline: Mapped[str] = mapped_column(String(64), unique=True, index=True, default="")

    amount_requested: Mapped[float] = mapped_column(Float, default=0)
    purpose: Mapped[str] = mapped_column(String(120), default="")
    term_requested: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[str] = mapped_column(String(20), default="SUBMITTED")
    submitted_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client"] = relationship(back_populates="applications")
    scores: Mapped[list["CreditScore"]] = relationship(back_populates="application", cascade="all, delete-orphan")
    decisions: Mapped[list["Decision"]] = relationship(back_populates="application", cascade="all, delete-orphan")


class CreditScore(Base):
    __tablename__ = "credit_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("loan_applications.id"))

    probability_default: Mapped[float] = mapped_column(Float)
    credit_score: Mapped[int] = mapped_column(Integer)
    risk_band: Mapped[str] = mapped_column(String(40))
    decision_suggestion: Mapped[str] = mapped_column(String(20))
    top_factors: Mapped[dict] = mapped_column(JSON, default={})

    model_version: Mapped[str] = mapped_column(String(40), default="v1")
    scored_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    application: Mapped["LoanApplication"] = relationship(back_populates="scores")


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("loan_applications.id"))
    analyst_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    final_decision: Mapped[str] = mapped_column(String(20))
    comment: Mapped[str] = mapped_column(Text, default="")
    decided_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    application: Mapped["LoanApplication"] = relationship(back_populates="decisions")

class CreditlineFinancial(Base):
    __tablename__ = "creditline_financials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)

    creditline: Mapped[str] = mapped_column(String(120))

    outstanding: Mapped[float] = mapped_column(Float, default=0)
    principal_arrears: Mapped[float] = mapped_column(Float, default=0)
    interest_arrears: Mapped[float] = mapped_column(Float, default=0)
    payment_plan: Mapped[float] = mapped_column(Float, default=0)
    days_in_arrears: Mapped[float] = mapped_column(Float, default=0)

    start_date: Mapped[str] = mapped_column(String(30), default="")
    duration: Mapped[float] = mapped_column(Float, default=0)
    remaining_period: Mapped[float] = mapped_column(Float, default=0)
    periodicity: Mapped[float] = mapped_column(Float, default=0)
    class_value: Mapped[float] = mapped_column(Float, default=0)

    compulsory_saving: Mapped[float] = mapped_column(Float, default=0)
    voluntary_saving: Mapped[float] = mapped_column(Float, default=0)
    salary: Mapped[float] = mapped_column(Float, default=0)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())