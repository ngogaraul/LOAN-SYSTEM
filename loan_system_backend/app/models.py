from __future__ import annotations

from sqlalchemy import (
    String, Integer, Float, DateTime, ForeignKey, Text, JSON, func, UniqueConstraint, Index
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
    external_subject: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="ANALYST")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    login_codes: Mapped[list["LoginCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    admin_action_codes: Mapped[list["AdminActionCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class LoginCode(Base):
    __tablename__ = "login_codes"
    __table_args__ = (
        Index("ix_login_codes_email_role_created", "email", "role", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(180), index=True)
    role: Mapped[str] = mapped_column(String(20), default="ANALYST")
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User | None"] = relationship(back_populates="login_codes")


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (
        UniqueConstraint("session_hash", name="uq_user_sessions_session_hash"),
        Index("ix_user_sessions_user_id_expires_at", "user_id", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="sessions")


class AdminActionCode(Base):
    __tablename__ = "admin_action_codes"
    __table_args__ = (
        Index("ix_admin_action_codes_email_action_target_created", "email", "action", "target_ref", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    email: Mapped[str] = mapped_column(String(180), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_ref: Mapped[str] = mapped_column(String(255), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="admin_action_codes")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(16), default="UNKNOWN")
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
    payment_plan: Mapped[float] = mapped_column(Float, default=0)
    purpose: Mapped[str] = mapped_column(String(120), default="")
    term_requested: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[str] = mapped_column(String(20), default="SUBMITTED")
    score_stale: Mapped[bool] = mapped_column(default=True)
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
    top_factors: Mapped[dict] = mapped_column(JSON, default=dict)

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
    __table_args__ = (
        UniqueConstraint("client_id", "creditline", name="uq_creditline_financials_client_creditline"),
        Index("ix_creditline_financials_client_creditline", "client_id", "creditline"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)

    creditline: Mapped[str] = mapped_column(String(120))

    outstanding: Mapped[float] = mapped_column(Float, default=0)
    principal_arrears: Mapped[float] = mapped_column(Float, default=0)
    interest_arrears: Mapped[float] = mapped_column(Float, default=0)
    payment_plan: Mapped[float] = mapped_column(Float, default=0)
    interest_rate: Mapped[float] = mapped_column(Float, default=0)
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


class DeletedCreditline(Base):
    __tablename__ = "deleted_creditlines"
    __table_args__ = (
        Index("ix_deleted_creditlines_client_creditline_created", "client_id", "creditline", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    deleted_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    creditline: Mapped[str] = mapped_column(String(120), index=True)
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True))
    restored_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
