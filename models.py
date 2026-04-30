from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base
import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    PROJECT_OWNER = "PROJECT_OWNER"
    PROJECT_TEAM = "PROJECT_TEAM"
    CLIENT = "CLIENT"
    VENDOR = "VENDOR"
    BIDDER = "BIDDER"


class PointType(str, enum.Enum):
    ACTION = "ACTION"
    DECISION = "DECISION"
    INFO = "INFO"


class PointStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    CLOSED = "CLOSED"
    ON_HOLD = "ON_HOLD"
    URGENT = "URGENT"
    DECLARED_DONE = "DECLARED_DONE"  # Set by anyone with point access; owning-package contacts then close or reopen.


class MeetingStatus(str, enum.Enum):
    PLANNED = "PLANNED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


# ─────────────────────────────────────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    project_number = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    client = Column(String(200), nullable=True)
    client_reference = Column(String(200), nullable=True)
    general_description = Column(Text, nullable=True)
    start_date = Column(String(20), nullable=True)
    end_date = Column(String(20), nullable=True)
    status = Column(String(20), default="ACTIVE")  # ACTIVE, ON_HOLD, CLOSED
    location = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    closure_date = Column(String(20), nullable=True)
    overall_result = Column(String(50), nullable=True)  # SUCCESS, PARTIAL_SUCCESS, UNSUCCESSFUL
    lessons_learned = Column(Text, nullable=True)

    created_by = relationship("User", foreign_keys="Project.created_by_id")
    updated_by = relationship("User", foreign_keys="Project.updated_by_id")


class UserProject(Base):
    """Assigns a user to a project with a specific role."""
    __tablename__ = "user_projects"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    role = Column(String(20), nullable=False)  # PROJECT_OWNER, PROJECT_TEAM, CLIENT, VENDOR

    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])

    __table_args__ = (UniqueConstraint('user_id', 'project_id', name='uq_user_project'),)


# ─────────────────────────────────────────────────────────────────────────────
# Users & Contacts
# ─────────────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String(500), nullable=False)
    role = Column(String(20), default=UserRole.PROJECT_TEAM)  # ADMIN or default role
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    phone = Column(String(50), nullable=True)
    must_change_password = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)

    contact = relationship("Contact", foreign_keys=[contact_id])
    point_notes = relationship("MeetingPointNote", back_populates="author")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True)
    company = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    function = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    meeting_type_participants = relationship("MeetingTypeParticipant", back_populates="contact")
    meeting_participants = relationship("MeetingParticipant", back_populates="contact")
    responsible_points = relationship("MeetingPoint", back_populates="responsible")
    package_contacts = relationship("PackageContact", back_populates="contact")
    created_by = relationship("User", foreign_keys="Contact.created_by_id")
    updated_by = relationship("User", foreign_keys="Contact.updated_by_id")


class OrgChartLink(Base):
    __tablename__ = "org_chart_links"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    reports_to_id = Column(Integer, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    relation_type = Column(String(20), default="LINE")  # LINE | STAFF

    contact = relationship("Contact", foreign_keys=[contact_id])
    reports_to = relationship("Contact", foreign_keys=[reports_to_id])

    __table_args__ = (UniqueConstraint("project_id", "contact_id", "reports_to_id", name="uq_org_link"),)


# ─────────────────────────────────────────────────────────────────────────────
# Packages & Budget
# ─────────────────────────────────────────────────────────────────────────────

class Package(Base):
    __tablename__ = "packages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    tag_number = Column(String(100), nullable=False)
    name = Column(String(300), nullable=True)
    company = Column(String(200), nullable=True)
    address = Column(Text, nullable=True)
    account_manager_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    package_owner_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    pmc_technical_reviewer_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    pmc_commercial_reviewer_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    client_technical_reviewer_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    client_commercial_reviewer_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    account_manager = relationship("Contact", foreign_keys=[account_manager_id])
    package_owner = relationship("Contact", foreign_keys=[package_owner_id])
    pmc_technical_reviewer = relationship("Contact", foreign_keys=[pmc_technical_reviewer_id])
    pmc_commercial_reviewer = relationship("Contact", foreign_keys=[pmc_commercial_reviewer_id])
    client_technical_reviewer = relationship("Contact", foreign_keys=[client_technical_reviewer_id])
    client_commercial_reviewer = relationship("Contact", foreign_keys=[client_commercial_reviewer_id])
    package_contacts = relationship("PackageContact", back_populates="package", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="Package.created_by_id")
    updated_by = relationship("User", foreign_keys="Package.updated_by_id")


class PackageContact(Base):
    """Contacts linked/assigned to a package."""
    __tablename__ = "package_contacts"

    package_id = Column(Integer, ForeignKey("packages.id"), primary_key=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), primary_key=True)

    package = relationship("Package", back_populates="package_contacts")
    contact = relationship("Contact", back_populates="package_contacts")


# ─────────────────────────────────────────────────────────────────────────────
# Settings & Subservices (per project)
# ─────────────────────────────────────────────────────────────────────────────

class Setting(Base):
    """Per-project key-value settings."""
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, nullable=False, default=1)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=True)


class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    tag = Column(String(100), nullable=False)
    description = Column(String(300), nullable=False)
    details = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    floorplan_id = Column(Integer, ForeignKey("floorplans.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    owner = relationship("Contact", foreign_keys=[owner_id])
    site_supervisors = relationship("AreaSiteSupervisor", back_populates="area", cascade="all, delete-orphan")
    floorplan = relationship("Floorplan", back_populates="areas", foreign_keys=[floorplan_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class Floorplan(Base):
    __tablename__ = "floorplans"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    stored_path = Column(String(512), nullable=False)
    original_filename = Column(String(255), nullable=True)
    content_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    areas = relationship("Area", back_populates="floorplan", foreign_keys=[Area.floorplan_id])


class AreaSiteSupervisor(Base):
    """Contacts acting as site supervisor on an area (many-to-many).

    Only contacts whose linked user has role CLIENT, PROJECT_OWNER or
    PROJECT_TEAM are accepted (enforced in the router)."""
    __tablename__ = "area_site_supervisors"

    area_id = Column(Integer, ForeignKey("areas.id", ondelete="CASCADE"), primary_key=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), primary_key=True)

    area = relationship("Area", back_populates="site_supervisors")
    contact = relationship("Contact", foreign_keys=[contact_id])


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    tag = Column(String(100), nullable=False)
    description = Column(String(300), nullable=False)
    details = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    owner = relationship("Contact", foreign_keys=[owner_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class Subservice(Base):
    __tablename__ = "subservices"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    service_code = Column(String(20), nullable=False)
    service_name = Column(String(200), nullable=False)
    subservice_code = Column(String(20), nullable=False)
    subservice_name = Column(String(200), nullable=False)
    pmc_reviewer_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    client_reviewer_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    sort_order = Column(Integer, default=0)

    pmc_reviewer = relationship("Contact", foreign_keys=[pmc_reviewer_id])
    client_reviewer = relationship("Contact", foreign_keys=[client_reviewer_id])


# ─────────────────────────────────────────────────────────────────────────────
# Document Management
# ─────────────────────────────────────────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    subservice_id = Column(Integer, ForeignKey("subservices.id"), nullable=False)
    document_type = Column(String(20), nullable=False)           # TECHNICAL | COMMERCIAL
    description = Column(String(500), nullable=False)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    require_area_review = Column(Boolean, default=False)
    require_unit_review = Column(Boolean, default=False)
    start_date = Column(String(20), nullable=True)
    first_issue_date = Column(String(20), nullable=True)
    approval_due_date = Column(String(20), nullable=True)
    distribution_package_ids = Column(Text, default="[]")       # JSON list of package IDs
    status = Column(String(20), default="NOT_STARTED")           # NOT_STARTED|IN_PROGRESS|IN_REVIEW|APPROVED|REJECTED
    current_version = Column(Integer, default=0)
    last_approved_version = Column(Integer, nullable=True)       # version number of the last fully approved revision
    weight = Column(Integer, default=8)                         # S-curve weighting factor
    actual_start_date = Column(String(20), nullable=True)       # Set when user clicks "Start"
    actual_start_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    subservice = relationship("Subservice", foreign_keys=[subservice_id])
    area = relationship("Area", foreign_keys=[area_id])
    unit = relationship("Unit", foreign_keys=[unit_id])
    actual_start_by = relationship("User", foreign_keys=[actual_start_by_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    status = Column(String(20), default="IN_REVIEW")            # IN_REVIEW|APPROVED|REJECTED
    launched_at = Column(DateTime, nullable=True)
    launched_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)

    launched_by = relationship("User", foreign_keys=[launched_by_id])


class DocumentReview(Base):
    __tablename__ = "document_reviews"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    reviewer_contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    reviewer_role = Column(String(300), nullable=True)
    # Identifies the live source of this reviewer so we can re-resolve the current
    # contact when Package/Subservice/Area/Unit ownership changes while a row is PENDING.
    # Values: PACKAGE_PMC_TECHNICAL | PACKAGE_CLIENT_TECHNICAL | PACKAGE_PMC_COMMERCIAL
    # | PACKAGE_CLIENT_COMMERCIAL | SUBSERVICE_PMC | SUBSERVICE_CLIENT | AREA_OWNER | UNIT_OWNER
    source_kind = Column(String(50), nullable=True, index=True)
    status = Column(String(20), default="PENDING")              # PENDING|APPROVED|REJECTED
    comment = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    reviewer_contact = relationship("Contact", foreign_keys=[reviewer_contact_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class DocumentComment(Base):
    __tablename__ = "document_comments"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="OPEN")                   # OPEN|CLOSED|RESOLVED
    page_number = Column(Integer, nullable=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)

    document = relationship("Document", foreign_keys=[document_id])
    author = relationship("User", foreign_keys=[author_id])
    package = relationship("Package", foreign_keys=[package_id])
    notes = relationship("DocumentCommentNote", back_populates="comment", cascade="all, delete-orphan", order_by="DocumentCommentNote.created_at")
    version_links = relationship("DocumentCommentVersionLink", back_populates="comment", cascade="all, delete-orphan")


class DocumentCommentNote(Base):
    __tablename__ = "document_comment_notes"

    id = Column(Integer, primary_key=True)
    comment_id = Column(Integer, ForeignKey("document_comments.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    comment = relationship("DocumentComment", back_populates="notes")
    author = relationship("User", foreign_keys=[author_id])


class DocumentCommentVersionLink(Base):
    __tablename__ = "document_comment_version_links"

    id = Column(Integer, primary_key=True)
    comment_id = Column(Integer, ForeignKey("document_comments.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    linked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    linked_at = Column(DateTime, default=datetime.utcnow)

    comment = relationship("DocumentComment", back_populates="version_links")
    linked_by = relationship("User", foreign_keys=[linked_by_id])

    __table_args__ = (UniqueConstraint("comment_id", "version", name="uq_comment_version_link"),)


class DocumentReceipt(Base):
    __tablename__ = "document_receipts"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    acknowledged = Column(Boolean, default=False)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    document = relationship("Document", foreign_keys=[document_id])
    package = relationship("Package", foreign_keys=[package_id])
    acknowledged_by = relationship("User", foreign_keys=[acknowledged_by_id])

    __table_args__ = (UniqueConstraint("document_id", "version", "package_id", name="uq_doc_receipt_pkg"),)


# ─────────────────────────────────────────────────────────────────────────────
# Module Leads (per project) — contacts elevated to PROJECT_OWNER-equivalent
# access within a single module. Used in place of the old role-permissions
# matrix for the 9 modules with bespoke override roles (Schedule / Budget /
# Risk Register / Procurement / Scope Changes / Document Management /
# Quality Control / Construction / Safety).
# ─────────────────────────────────────────────────────────────────────────────

# Canonical module keys — must match what the routers pass to
# auth.has_owner_or_lead_access().
MODULE_LEAD_KEYS = (
    "Schedule",
    "Budget",
    "Risk Register",
    "Procurement",
    "Scope Changes",
    "Document Management",
    "Quality Control",
    "Construction",
    "Safety",
)


class ProjectModuleLead(Base):
    __tablename__ = "project_module_leads"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    module = Column(String(50), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True)

    contact = relationship("Contact", foreign_keys=[contact_id])

    __table_args__ = (
        UniqueConstraint("project_id", "module", "contact_id", name="uq_project_module_contact"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Risk Register (per project)
# ─────────────────────────────────────────────────────────────────────────────

class RiskScoreSetup(Base):
    """Global risk scoring parameters (same methodology across all projects)."""
    __tablename__ = "risk_score_setup"
    score = Column(Integer, primary_key=True)
    probability_pct = Column(Float, default=0.0)
    capex_impact_pct = Column(Float, default=0.0)
    schedule_impact_pct = Column(Float, default=0.0)


class RiskMatrixCell(Base):
    """Global risk matrix (same across all projects)."""
    __tablename__ = "risk_matrix_cells"
    prob_score = Column(Integer, primary_key=True)
    impact_score = Column(Integer, primary_key=True)
    level = Column(String(10), default="LOW")


class RiskCategory(Base):
    __tablename__ = "risk_categories"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)


class RiskPhase(Base):
    __tablename__ = "risk_phases"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)


class Risk(Base):
    __tablename__ = "risks"
    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="OPEN")
    category_id = Column(Integer, ForeignKey("risk_categories.id"), nullable=True)
    phase_id = Column(Integer, ForeignKey("risk_phases.id"), nullable=True)
    date_opened = Column(String(20), nullable=True)
    date_closed = Column(String(20), nullable=True)
    owner_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    prob_score_before = Column(Integer, nullable=True)
    capex_score_before = Column(Integer, nullable=True)
    schedule_score_before = Column(Integer, nullable=True)
    capex_value = Column(Float, nullable=True)
    schedule_value = Column(Float, nullable=True)
    mitigation_type = Column(String(20), nullable=True)
    mitigation_action = Column(Text, nullable=True)
    action_due_date = Column(String(20), nullable=True)
    action_status = Column(String(20), default="NOT_STARTED")
    prob_score_after = Column(Integer, nullable=True)
    capex_score_after = Column(Integer, nullable=True)
    schedule_score_after = Column(Integer, nullable=True)
    secondary_effects = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    category = relationship("RiskCategory", foreign_keys=[category_id])
    phase = relationship("RiskPhase", foreign_keys=[phase_id])
    owner = relationship("Contact", foreign_keys=[owner_id])
    notes = relationship("RiskNote", back_populates="risk", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="Risk.created_by_id")
    updated_by = relationship("User", foreign_keys="Risk.updated_by_id")


class RiskNote(Base):
    __tablename__ = "risk_notes"
    id = Column(Integer, primary_key=True)
    risk_id = Column(Integer, ForeignKey("risks.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    risk = relationship("Risk", back_populates="notes")
    author = relationship("User", foreign_keys=[created_by_id])


# ─────────────────────────────────────────────────────────────────────────────
# Budget
# ─────────────────────────────────────────────────────────────────────────────

class BudgetBaseline(Base):
    __tablename__ = "budget_baselines"

    id = Column(Integer, primary_key=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False, unique=True)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="EUR")
    updated_at = Column(DateTime, default=datetime.utcnow)

    package = relationship("Package", foreign_keys=[package_id])


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    po_number = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    vendor_name = Column(String(200), nullable=True)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="EUR")
    order_date = Column(String(20), nullable=True)
    status = Column(String(20), default="COMMITTED")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    invoices = relationship("Invoice", back_populates="order", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="Order.created_by_id")
    updated_by = relationship("User", foreign_keys="Order.updated_by_id")


class ScopeChange(Base):
    __tablename__ = "scope_changes"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    description = Column(String(500), nullable=False)
    details = Column(Text, nullable=True)
    cost = Column(Float, default=0.0)
    schedule_impact_months = Column(Float, default=0.0)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="DRAFT")  # DRAFT SUBMITTED APPROVED REJECTED CANCELLED
    pmc_reviewed = Column(Boolean, default=False)
    pmc_approved = Column(Boolean, nullable=True)
    pmc_comment = Column(Text, nullable=True)
    pmc_reviewed_at = Column(DateTime, nullable=True)
    client_reviewed = Column(Boolean, default=False)
    client_approved = Column(Boolean, nullable=True)
    client_comment = Column(Text, nullable=True)
    client_reviewed_at = Column(DateTime, nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys="ScopeChange.updated_by_id")
    order = relationship("Order", foreign_keys=[order_id])
    review_history = relationship(
        "ScopeChangeReview",
        back_populates="scope_change",
        cascade="all, delete-orphan",
        order_by="ScopeChangeReview.created_at",
    )


class ScopeChangeReview(Base):
    """Append-only audit log of review events for a scope change — submit,
    approve, reject, override. Survives resubmits so the full history is
    visible to the team."""
    __tablename__ = "scope_change_reviews"

    id = Column(Integer, primary_key=True)
    scope_change_id = Column(Integer, ForeignKey("scope_changes.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(20), nullable=False)  # SUBMIT | PMC | CLIENT | OVERRIDE
    approved = Column(Boolean, nullable=True)   # None for SUBMIT; True/False for reviews
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    scope_change = relationship("ScopeChange", back_populates="review_history")
    actor = relationship("User", foreign_keys=[actor_id])


# ── Schedule Management ──────────────────────────────────────────────────────

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    description = Column(String(500), nullable=False)
    details = Column(Text, nullable=True)
    start_date = Column(String(20), nullable=True)
    finish_date = Column(String(20), nullable=True)
    financial_weight = Column(Float, nullable=True)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    area = relationship("Area", foreign_keys=[area_id])
    unit = relationship("Unit", foreign_keys=[unit_id])
    created_by = relationship("User", foreign_keys="Task.created_by_id")
    updated_by = relationship("User", foreign_keys="Task.updated_by_id")


class ProgressReport(Base):
    """Package-level progress report — covers all tasks in the package."""
    __tablename__ = "progress_reports"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    status = Column(String(20), default="DRAFT")  # DRAFT SUBMITTED APPROVED REJECTED CANCELLED
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    pmc_reviewed = Column(Boolean, default=False)
    pmc_approved = Column(Boolean, nullable=True)
    pmc_comment = Column(Text, nullable=True)
    pmc_reviewed_at = Column(DateTime, nullable=True)
    client_reviewed = Column(Boolean, default=False)
    client_approved = Column(Boolean, nullable=True)
    client_comment = Column(Text, nullable=True)
    client_reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    package = relationship("Package", foreign_keys=[package_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    entries = relationship(
        "ProgressReportEntry", back_populates="progress_report",
        cascade="all, delete-orphan", order_by="ProgressReportEntry.id"
    )
    review_history = relationship(
        "ProgressReportReview", back_populates="progress_report",
        cascade="all, delete-orphan",
        order_by="ProgressReportReview.created_at",
    )


class ProgressReportReview(Base):
    """Append-only audit log of review events for a progress report —
    submit, approve, reject, override. Survives resubmits."""
    __tablename__ = "progress_report_reviews"

    id = Column(Integer, primary_key=True)
    progress_report_id = Column(Integer, ForeignKey("progress_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(20), nullable=False)  # SUBMIT | PMC | CLIENT | OVERRIDE
    approved = Column(Boolean, nullable=True)   # None for SUBMIT; True/False for reviews
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    progress_report = relationship("ProgressReport", back_populates="review_history")
    actor = relationship("User", foreign_keys=[actor_id])


class ProgressReportEntry(Base):
    """Per-task entry within a package-level progress report."""
    __tablename__ = "progress_report_entries"

    id = Column(Integer, primary_key=True)
    progress_report_id = Column(
        Integer, ForeignKey("progress_reports.id", ondelete="CASCADE"), nullable=False
    )
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    percentage = Column(Float, nullable=False, default=0.0)
    note = Column(Text, nullable=True)
    pmc_approved = Column(Boolean, nullable=True)    # task-level PMC decision
    client_approved = Column(Boolean, nullable=True)  # task-level client decision
    created_at = Column(DateTime, default=datetime.utcnow)

    progress_report = relationship("ProgressReport", back_populates="entries")
    task = relationship("Task")


class BudgetTransfer(Base):
    __tablename__ = "budget_transfers"

    id = Column(Integer, primary_key=True)
    type = Column(String(20), default="TRANSFER")
    from_package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    to_package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="EUR")
    description = Column(Text, nullable=True)
    transfer_date = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    from_package = relationship("Package", foreign_keys=[from_package_id])
    to_package = relationship("Package", foreign_keys=[to_package_id])


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    invoice_number = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="EUR")
    invoice_date = Column(String(20), nullable=True)
    status = Column(String(20), default="DRAFT")  # DRAFT PENDING APPROVED REJECTED CANCELLED

    # Per-reviewer state (mirrors ScopeChange approval flow)
    pmc_reviewed = Column(Boolean, default=False)
    pmc_approved = Column(Boolean, nullable=True)
    pmc_comment = Column(Text, nullable=True)
    pmc_reviewed_at = Column(DateTime, nullable=True)
    client_reviewed = Column(Boolean, default=False)
    client_approved = Column(Boolean, nullable=True)
    client_comment = Column(Text, nullable=True)
    client_reviewed_at = Column(DateTime, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_comment = Column(Text, nullable=True)  # legacy single-comment field (kept for back-compat)
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    order = relationship("Order", back_populates="invoices")
    package = relationship("Package", foreign_keys=[package_id])
    updated_by = relationship("User", foreign_keys="Invoice.updated_by_id")
    review_history = relationship(
        "InvoiceReview",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceReview.created_at",
    )


class InvoiceReview(Base):
    """Append-only audit log of review events for an invoice — submit,
    approve, reject, override. Survives resubmits."""
    __tablename__ = "invoice_reviews"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(20), nullable=False)  # SUBMIT | PMC | CLIENT | OVERRIDE
    approved = Column(Boolean, nullable=True)   # None for SUBMIT; True/False for reviews
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice", back_populates="review_history")
    actor = relationship("User", foreign_keys=[actor_id])


# ─────────────────────────────────────────────────────────────────────────────
# Meeting Management (per project)
# ─────────────────────────────────────────────────────────────────────────────

class MeetingType(Base):
    __tablename__ = "meeting_types"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_recurrent = Column(Boolean, default=False, nullable=False)
    recurrence = Column(String(20), nullable=True)          # DAILY | WEEKLY | BIWEEKLY | MONTHLY
    days_of_week = Column(Text, nullable=True)              # JSON [0,2,4] — used for DAILY/WEEKLY/BIWEEKLY
    day_of_week = Column(Integer, nullable=True)            # 0=Mon…6=Sun — used for MONTHLY only
    monthly_week_position = Column(Integer, nullable=True)  # 1=1st 2=2nd 3=3rd 4=4th 5=last
    recurrence_time = Column(String(10), nullable=True)     # HH:MM (mandatory when recurrent)
    duration = Column(Integer, nullable=True)               # minutes (mandatory when recurrent)
    # Owning Package: linked-contacts of this package have full edit on meeting points
    # of this type. Required for new types (enforced by UI); nullable in DB so the
    # column add does not break legacy rows.
    owning_package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    participants = relationship("MeetingTypeParticipant", back_populates="meeting_type", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="meeting_type")
    owning_package = relationship("Package", foreign_keys=[owning_package_id])
    created_by = relationship("User", foreign_keys="MeetingType.created_by_id")
    updated_by = relationship("User", foreign_keys="MeetingType.updated_by_id")


class MeetingTypeParticipant(Base):
    __tablename__ = "meeting_type_participants"

    meeting_type_id = Column(Integer, ForeignKey("meeting_types.id"), primary_key=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), primary_key=True)

    meeting_type = relationship("MeetingType", back_populates="participants")
    contact = relationship("Contact", back_populates="meeting_type_participants")


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String(300), nullable=False)
    date = Column(String(20), nullable=True)
    time = Column(String(10), nullable=True)
    location = Column(String(300), nullable=True)
    meeting_type_id = Column(Integer, ForeignKey("meeting_types.id"), nullable=True)
    status = Column(String(20), default=MeetingStatus.PLANNED)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    meeting_type = relationship("MeetingType", back_populates="meetings")
    participants = relationship("MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")
    point_links = relationship("MeetingPointLink", back_populates="meeting", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="Meeting.created_by_id")
    updated_by = relationship("User", foreign_keys="Meeting.updated_by_id")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    meeting_id = Column(Integer, ForeignKey("meetings.id"), primary_key=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), primary_key=True)
    present = Column(Boolean, default=False)

    meeting = relationship("Meeting", back_populates="participants")
    contact = relationship("Contact", back_populates="meeting_participants")


class MeetingPoint(Base):
    __tablename__ = "meeting_points"

    id = Column(Integer, primary_key=True, index=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    type = Column(String(20), default=PointType.ACTION)
    topic = Column(String(500), nullable=False)
    details = Column(Text, nullable=True)
    responsible_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    due_date = Column(String(20), nullable=True)
    status = Column(String(20), default=PointStatus.NOT_STARTED)
    closed_at = Column(DateTime, nullable=True)
    source_module = Column(String(100), default="Meeting Management")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    responsible = relationship("Contact", back_populates="responsible_points")
    meeting_links = relationship("MeetingPointLink", back_populates="point", cascade="all, delete-orphan")
    notes = relationship("MeetingPointNote", back_populates="point", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="MeetingPoint.created_by_id")
    updated_by = relationship("User", foreign_keys="MeetingPoint.updated_by_id")


class MeetingPointLink(Base):
    __tablename__ = "meeting_point_links"

    id = Column(Integer, primary_key=True, index=True)
    meeting_point_id = Column(Integer, ForeignKey("meeting_points.id"), nullable=False)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    for_preparation = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    point = relationship("MeetingPoint", back_populates="meeting_links")
    meeting = relationship("Meeting", back_populates="point_links")


class MeetingPointNote(Base):
    __tablename__ = "meeting_point_notes"

    id = Column(Integer, primary_key=True, index=True)
    meeting_point_id = Column(Integer, ForeignKey("meeting_points.id"), nullable=False)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)
    content = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    point = relationship("MeetingPoint", back_populates="notes")
    meeting = relationship("Meeting")
    author = relationship("User", back_populates="point_notes")


# ─────────────────────────────────────────────────────────────────────────────
# Procurement
# ─────────────────────────────────────────────────────────────────────────────

class ProcurementStep(Base):
    __tablename__ = "procurement_steps"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    step_id = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    weight = Column(Float, nullable=False, default=0.0)  # 0.0 – 1.0 (fraction of 100%)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys="ProcurementStep.created_by_id")
    updated_by = relationship("User", foreign_keys="ProcurementStep.updated_by_id")


class ContractType(Base):
    __tablename__ = "contract_types"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys="ContractType.created_by_id")
    updated_by = relationship("User", foreign_keys="ContractType.updated_by_id")


class ProcurementConfig(Base):
    """One row per project — tracks whether the sequence has been validated."""
    __tablename__ = "procurement_configs"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, unique=True)
    sequence_validated = Column(Boolean, default=False)
    sequence_validated_at = Column(DateTime, nullable=True)
    sequence_validated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    sequence_validated_by = relationship("User", foreign_keys="ProcurementConfig.sequence_validated_by_id")


class PackagePlan(Base):
    """One procurement plan row per package."""
    __tablename__ = "package_plans"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False, unique=True)
    contract_type_id = Column(Integer, ForeignKey("contract_types.id"), nullable=True)
    notes = Column(Text, nullable=True)
    # When True, the package has no procurement and is excluded from the
    # Register tab and the Dashboard. The plan row itself stays visible (greyed
    # out) so a Project Owner can flip the flag back on later.
    not_applicable = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    contract_type = relationship("ContractType", foreign_keys=[contract_type_id])
    bidders = relationship("PackagePlanBidder", back_populates="plan", cascade="all, delete-orphan")
    step_dates = relationship("PackagePlanStepDate", back_populates="plan", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="PackagePlan.created_by_id")
    updated_by = relationship("User", foreign_keys="PackagePlan.updated_by_id")


class BiddingCompany(Base):
    """A potential bidder company, managed within the Procurement Plan (pre-award)."""
    __tablename__ = "bidding_companies"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    website = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    contacts = relationship("BiddingCompanyContact", back_populates="company", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys="BiddingCompany.created_by_id")
    updated_by = relationship("User", foreign_keys="BiddingCompany.updated_by_id")


class BiddingCompanyContact(Base):
    """Links a BIDDER-role user as a contact person for a bidding company."""
    __tablename__ = "bidding_company_contacts"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("bidding_companies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    company = relationship("BiddingCompany", back_populates="contacts")
    user = relationship("User", foreign_keys=[user_id])
    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_company_contact"),)


class PackagePlanBidder(Base):
    """Links a bidding company to a package procurement plan."""
    __tablename__ = "package_plan_bidders"

    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("package_plans.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("bidding_companies.id"), nullable=False)

    plan = relationship("PackagePlan", back_populates="bidders")
    company = relationship("BiddingCompany", foreign_keys=[company_id])
    __table_args__ = (UniqueConstraint("plan_id", "company_id", name="uq_plan_bidder"),)


class PackagePlanStepDate(Base):
    __tablename__ = "package_plan_step_dates"

    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("package_plans.id"), nullable=False)
    step_id = Column(Integer, ForeignKey("procurement_steps.id"), nullable=False)
    due_date = Column(String(20), nullable=True)

    plan = relationship("PackagePlan", back_populates="step_dates")
    step = relationship("ProcurementStep", foreign_keys=[step_id])
    __table_args__ = (UniqueConstraint("plan_id", "step_id", name="uq_plan_step"),)


class ProcurementEntry(Base):
    """One entry per (package, bidding_company) pair in the procurement register."""
    __tablename__ = "procurement_entries"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("bidding_companies.id"), nullable=False)
    current_step_id = Column(Integer, ForeignKey("procurement_steps.id"), nullable=True)
    status = Column(String(20), default="COMPETING")  # COMPETING, EXCLUDED, AWAITING, AWARDED
    exclusion_reason = Column(Text, nullable=True)
    technical_compliance = Column(String(10), nullable=True)  # NA, PENDING, PASS, FAIL
    technical_compliance_note = Column(Text, nullable=True)
    commercial_compliance = Column(String(10), nullable=True)
    commercial_compliance_note = Column(Text, nullable=True)
    bid_value = Column(Float, nullable=True)
    bid_currency = Column(String(10), default="EUR")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    company = relationship("BiddingCompany", foreign_keys=[company_id])
    current_step = relationship("ProcurementStep", foreign_keys=[current_step_id])
    events = relationship("ProcurementEvent", back_populates="entry",
                          cascade="all, delete-orphan")
    submittals = relationship("BidderSubmittal", back_populates="entry",
                              cascade="all, delete-orphan",
                              order_by="BidderSubmittal.submitted_at")
    created_by = relationship("User", foreign_keys="ProcurementEntry.created_by_id")
    updated_by = relationship("User", foreign_keys="ProcurementEntry.updated_by_id")

    __table_args__ = (UniqueConstraint("package_id", "company_id", name="uq_entry_pkg_company"),)


class BidderSubmittal(Base):
    """Formal submittal recorded each time a bidder submits via the portal."""
    __tablename__ = "bidder_submittals"

    id = Column(Integer, primary_key=True)
    entry_id = Column(Integer, ForeignKey("procurement_entries.id"), nullable=False)
    step_id = Column(Integer, ForeignKey("procurement_steps.id"), nullable=True)
    step_name = Column(String(100), nullable=True)   # denormalized
    bid_value = Column(Float, nullable=True)
    bid_currency = Column(String(10), default="EUR")
    comment = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    entry = relationship("ProcurementEntry", back_populates="submittals")
    step = relationship("ProcurementStep", foreign_keys=[step_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])


class BidderSubmittalAck(Base):
    """Per-user acknowledgment of a bidder submittal. The package owner, the
    PMC commercial reviewer and the Client commercial reviewer each get an
    action point in My Action Points when a submittal lands; the action point
    disappears for them individually when they click it (= a row inserted
    here). Other reviewers' action points stay until they click theirs."""
    __tablename__ = "bidder_submittal_acks"

    id = Column(Integer, primary_key=True)
    submittal_id = Column(Integer, ForeignKey("bidder_submittals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    acknowledged_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("submittal_id", "user_id", name="uq_bidder_submittal_ack"),)


class FileAttachment(Base):
    """File attached to any record in the system."""
    __tablename__ = "file_attachments"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    record_type = Column(String(50), nullable=False)   # meeting_point | order | invoice | scope_change | progress_report | document | procurement_entry
    record_id = Column(Integer, nullable=False)
    original_filename = Column(String(500), nullable=False)
    stored_path = Column(String(1000), nullable=False)  # relative from uploads/ root
    file_size = Column(Integer, default=0)
    content_type = Column(String(200), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Set automatically for procurement_entry uploads (= entry.current_step_id
    # at upload time) so the bidder portal can group documents per step.
    step_id = Column(Integer, ForeignKey("procurement_steps.id"), nullable=True, index=True)

    project = relationship("Project", foreign_keys=[project_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    step = relationship("ProcurementStep", foreign_keys=[step_id])


class Report(Base):
    """Background-generated PDF reports (e.g., safety observations export,
    punch-list export). Stored under uploads/{project}/{kind} folder so the
    user can come back later and download. Lifecycle:
        PENDING → GENERATING → READY (or FAILED)."""
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    kind = Column(String(50), nullable=False)        # 'safety' | 'punch'
    status = Column(String(20), default="PENDING", nullable=False)
    title = Column(String(255), nullable=True)       # human label shown in the UI
    filters_json = Column(Text, nullable=True)       # JSON snapshot of the request
    filter_summary = Column(Text, nullable=True)     # short human-readable summary
    item_count = Column(Integer, nullable=True)      # records included
    stored_path = Column(String(1000), nullable=True)  # rel from uploads/
    file_size = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    requested_by = relationship("User", foreign_keys=[requested_by_id])


class ProcurementEvent(Base):
    """Audit event log for a procurement register entry."""
    __tablename__ = "procurement_events"

    id = Column(Integer, primary_key=True)
    entry_id = Column(Integer, ForeignKey("procurement_entries.id"), nullable=False)
    event_type = Column(String(30), nullable=False)  # COMMENT, STEP_ADVANCE, STATUS_CHANGE, AWARD, EVALUATION
    step_name = Column(String(100), nullable=True)   # denormalized for history
    old_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    entry = relationship("ProcurementEntry", back_populates="events")
    created_by = relationship("User", foreign_keys=[created_by_id])


# ─────────────────────────────────────────────────────────────────────────────
# Quality Control — Inspection and Test Plan (ITP)
# ─────────────────────────────────────────────────────────────────────────────

class ITPTestType(Base):
    __tablename__ = "itp_test_types"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class ITPWitnessLevel(Base):
    __tablename__ = "itp_witness_levels"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    code = Column(String(10), nullable=False)     # H, W, R, I
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class ITPRecord(Base):
    __tablename__ = "itp_records"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    test_type_id = Column(Integer, ForeignKey("itp_test_types.id"), nullable=False)
    test = Column(String(200), nullable=True)                # short test name / identifier
    details = Column(String(500), nullable=True)            # renamed from description
    witness_level_id = Column(Integer, ForeignKey("itp_witness_levels.id"), nullable=False)
    status = Column(String(20), default="DRAFT")            # DRAFT | PLANNED | PASSED | FAILED
    approval_status = Column(String(20), default="TO_SUBMIT") # TO_SUBMIT | PENDING | APPROVED | REJECTED
    # Per-reviewer state — mirrors ScopeChange/Invoice/ProgressReport so that
    # changing Package.*technical_reviewer_id automatically reassigns the
    # pending review (dynamic lookup instead of snapshotted ITPReview rows).
    pmc_reviewed = Column(Boolean, default=False)
    pmc_approved = Column(Boolean, nullable=True)
    pmc_comment = Column(Text, nullable=True)
    pmc_reviewed_at = Column(DateTime, nullable=True)
    pmc_reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    client_reviewed = Column(Boolean, default=False)
    client_approved = Column(Boolean, nullable=True)
    client_comment = Column(Text, nullable=True)
    client_reviewed_at = Column(DateTime, nullable=True)
    client_reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    acceptance_criteria = Column(Text, nullable=True)
    result = Column(Text, nullable=True)
    planned_date = Column(String(20), nullable=True)
    executed_date = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    test_type = relationship("ITPTestType", foreign_keys=[test_type_id])
    witness_level = relationship("ITPWitnessLevel", foreign_keys=[witness_level_id])
    area = relationship("Area", foreign_keys=[area_id])
    unit = relationship("Unit", foreign_keys=[unit_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    reviews = relationship("ITPReview", back_populates="itp_record", cascade="all, delete-orphan")
    notes = relationship("ITPNote", back_populates="itp_record", cascade="all, delete-orphan", order_by="ITPNote.created_at")
    review_history = relationship(
        "ITPReviewHistory", back_populates="itp_record",
        cascade="all, delete-orphan",
        order_by="ITPReviewHistory.created_at",
    )


class ITPNote(Base):
    __tablename__ = "itp_notes"
    id = Column(Integer, primary_key=True)
    itp_record_id = Column(Integer, ForeignKey("itp_records.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    itp_record = relationship("ITPRecord", back_populates="notes")
    author = relationship("User", foreign_keys=[created_by_id])


class ITPReview(Base):
    __tablename__ = "itp_reviews"

    id = Column(Integer, primary_key=True)
    itp_id = Column(Integer, ForeignKey("itp_records.id", ondelete="CASCADE"), nullable=False)
    reviewer_contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=False)
    reviewer_role = Column(String(50), nullable=True)  # PMC_TECHNICAL | CLIENT_TECHNICAL
    status = Column(String(20), default="PENDING")     # PENDING | APPROVED | REJECTED
    comment = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    itp_record = relationship("ITPRecord", back_populates="reviews")
    reviewer_contact = relationship("Contact", foreign_keys=[reviewer_contact_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class ITPReviewHistory(Base):
    """Append-only audit log of review events for an ITP record —
    submit, approve, reject, override, resubmit. Survives resubmits."""
    __tablename__ = "itp_review_history"

    id = Column(Integer, primary_key=True)
    itp_id = Column(Integer, ForeignKey("itp_records.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(20), nullable=False)  # SUBMIT | PMC | CLIENT | OVERRIDE | RESUBMIT
    approved = Column(Boolean, nullable=True)   # None for SUBMIT/RESUBMIT; True/False for reviews
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    itp_record = relationship("ITPRecord", back_populates="review_history")
    actor = relationship("User", foreign_keys=[actor_id])


class ObligationTime(Base):
    __tablename__ = "obligation_times"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    code = Column(String(10), nullable=False)
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class PunchItem(Base):
    __tablename__ = "punch_items"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    obligation_time_id = Column(Integer, ForeignKey("obligation_times.id"), nullable=False)
    itp_record_id = Column(Integer, ForeignKey("itp_records.id"), nullable=True)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    topic = Column(String(200), nullable=False)
    details = Column(Text, nullable=False)
    response = Column(Text, nullable=True)
    status = Column(String(20), default="DRAFT")  # DRAFT | OPEN | TO_REVIEW | CLOSED
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Floorplan pin (optional; tied to a floorplan that covers this area)
    floorplan_id = Column(Integer, ForeignKey("floorplans.id"), nullable=True)
    floorplan_x  = Column(Float, nullable=True)   # normalized 0..1
    floorplan_y  = Column(Float, nullable=True)   # normalized 0..1

    project = relationship("Project", foreign_keys=[project_id])
    package = relationship("Package", foreign_keys=[package_id])
    obligation_time = relationship("ObligationTime", foreign_keys=[obligation_time_id])
    itp_record = relationship("ITPRecord", foreign_keys=[itp_record_id])
    area = relationship("Area", foreign_keys=[area_id])
    unit = relationship("Unit", foreign_keys=[unit_id])
    floorplan = relationship("Floorplan", foreign_keys=[floorplan_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    notes = relationship("PunchNote", back_populates="punch_item", cascade="all, delete-orphan", order_by="PunchNote.created_at")


class PunchNote(Base):
    __tablename__ = "punch_notes"
    id = Column(Integer, primary_key=True)
    punch_item_id = Column(Integer, ForeignKey("punch_items.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    punch_item = relationship("PunchItem", back_populates="notes")
    author = relationship("User", foreign_keys=[created_by_id])


# ─────────────────────────────────────────────────────────────────────────────
# Construction Management
# ─────────────────────────────────────────────────────────────────────────────

class WorkPermitType(Base):
    __tablename__ = "work_permit_types"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)


class SafetyObservationCategory(Base):
    __tablename__ = "safety_observation_categories"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    # POSITIVE (good practice seen) or NEGATIVE (hazard / unsafe behaviour)
    polarity = Column(String(10), default="NEGATIVE", nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)


class SafetySeverityClass(Base):
    """Severity classes for safety incidents. `level` is the ordering field —
    1 = worst (e.g. Fatality), increasing numbers = less severe. The UI renders
    a yellow→red color bar based on the level."""
    __tablename__ = "safety_severity_classes"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    level = Column(Integer, nullable=False, default=1)   # 1 = worst, ascending = less severe
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class SafetyIncidentCause(Base):
    """High-level cause categories for safety incidents. The `is_default` flag
    marks the protected 'Other' entry that every project gets and that cannot
    be deleted (it acts as the catch-all)."""
    __tablename__ = "safety_incident_causes"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class SafetyToolbox(Base):
    """Toolbox talk record. Status flow:
        DRAFT → SUBMITTED (no edits after that, except via re-open which
        site supervisors / project owners / admins can trigger)."""
    __tablename__ = "safety_toolboxes"
    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)

    category_id = Column(Integer, ForeignKey("safety_toolbox_categories.id"), nullable=False)
    other_category_text = Column(String(300), nullable=True)   # required when category is the protected 'Other'

    given_by_user_id   = Column(Integer, ForeignKey("users.id"),   nullable=True)
    given_by_worker_id = Column(Integer, ForeignKey("workers.id"), nullable=True)

    talk_date = Column(String(20), nullable=False)             # YYYY-MM-DD
    details   = Column(Text, nullable=False)

    status = Column(String(20), default="DRAFT", nullable=False)
    # DRAFT → SUBMITTED → RECEIVED (acknowledged by a site supervisor),
    # with re-open at any submitted/received stage going back to DRAFT.
    submitted_at    = Column(DateTime, nullable=True)
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledged_at      = Column(DateTime, nullable=True)
    acknowledged_by_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledge_comment  = Column(Text, nullable=True)
    reopened_at     = Column(DateTime, nullable=True)
    reopened_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at    = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at    = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project       = relationship("Project", foreign_keys=[project_id])
    category      = relationship("SafetyToolboxCategory", foreign_keys=[category_id])
    given_by_user   = relationship("User",   foreign_keys=[given_by_user_id])
    given_by_worker = relationship("Worker", foreign_keys=[given_by_worker_id])
    submitted_by    = relationship("User", foreign_keys=[submitted_by_id])
    acknowledged_by = relationship("User", foreign_keys=[acknowledged_by_id])
    reopened_by     = relationship("User", foreign_keys=[reopened_by_id])
    created_by      = relationship("User", foreign_keys=[created_by_id])
    updated_by      = relationship("User", foreign_keys=[updated_by_id])

    packages     = relationship("SafetyToolboxPackage",     back_populates="toolbox", cascade="all, delete-orphan")
    workers      = relationship("SafetyToolboxWorker",      back_populates="toolbox", cascade="all, delete-orphan")
    observations = relationship("SafetyToolboxObservation", back_populates="toolbox", cascade="all, delete-orphan")
    incidents    = relationship("SafetyToolboxIncident",    back_populates="toolbox", cascade="all, delete-orphan")
    history      = relationship("SafetyToolboxReview",      back_populates="toolbox",
                                cascade="all, delete-orphan",
                                order_by="SafetyToolboxReview.created_at")


class SafetyToolboxPackage(Base):
    __tablename__ = "safety_toolbox_packages"
    id = Column(Integer, primary_key=True)
    toolbox_id = Column(Integer, ForeignKey("safety_toolboxes.id", ondelete="CASCADE"), nullable=False, index=True)
    package_id = Column(Integer, ForeignKey("packages.id"),         nullable=False, index=True)
    toolbox = relationship("SafetyToolbox", back_populates="packages")
    package = relationship("Package", foreign_keys=[package_id])
    __table_args__ = (UniqueConstraint("toolbox_id", "package_id", name="uq_tbx_pkg"),)


class SafetyToolboxWorker(Base):
    __tablename__ = "safety_toolbox_workers"
    id = Column(Integer, primary_key=True)
    toolbox_id = Column(Integer, ForeignKey("safety_toolboxes.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id  = Column(Integer, ForeignKey("workers.id"),          nullable=False)
    toolbox = relationship("SafetyToolbox", back_populates="workers")
    worker  = relationship("Worker", foreign_keys=[worker_id])
    __table_args__ = (UniqueConstraint("toolbox_id", "worker_id", name="uq_tbx_wk"),)


class SafetyToolboxObservation(Base):
    __tablename__ = "safety_toolbox_observations"
    id = Column(Integer, primary_key=True)
    toolbox_id     = Column(Integer, ForeignKey("safety_toolboxes.id", ondelete="CASCADE"),    nullable=False, index=True)
    observation_id = Column(Integer, ForeignKey("safety_observations.id", ondelete="CASCADE"), nullable=False, index=True)
    toolbox     = relationship("SafetyToolbox", back_populates="observations")
    observation = relationship("SafetyObservation", foreign_keys=[observation_id])
    __table_args__ = (UniqueConstraint("toolbox_id", "observation_id", name="uq_tbx_obs"),)


class SafetyToolboxIncident(Base):
    __tablename__ = "safety_toolbox_incidents"
    id = Column(Integer, primary_key=True)
    toolbox_id  = Column(Integer, ForeignKey("safety_toolboxes.id", ondelete="CASCADE"),  nullable=False, index=True)
    incident_id = Column(Integer, ForeignKey("safety_incidents.id", ondelete="CASCADE"),  nullable=False, index=True)
    toolbox  = relationship("SafetyToolbox", back_populates="incidents")
    incident = relationship("SafetyIncident", foreign_keys=[incident_id])
    __table_args__ = (UniqueConstraint("toolbox_id", "incident_id", name="uq_tbx_inc"),)


class SafetyToolboxReview(Base):
    """Append-only audit log for a toolbox talk. Events:
        CREATED | SUBMITTED | ACKNOWLEDGED | REOPENED"""
    __tablename__ = "safety_toolbox_reviews"
    id = Column(Integer, primary_key=True)
    toolbox_id = Column(Integer, ForeignKey("safety_toolboxes.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    event   = Column(String(20), nullable=False)
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    toolbox = relationship("SafetyToolbox", back_populates="history")
    actor = relationship("User", foreign_keys=[actor_id])


class SafetyToolboxCategory(Base):
    """High-level categories for safety toolbox sessions. The `is_default`
    flag marks the protected 'Other' entry that every project gets and that
    cannot be deleted or renamed."""
    __tablename__ = "safety_toolbox_categories"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class SafetyObservation(Base):
    """A safety observation raised against a package + area.

    Workflow:
        DRAFT     → creator can save & attach files; no downstream visibility
        SUBMITTED → package contacts get an ACKNOWLEDGE action point
        RECEIVED  → area site supervisors get a REVIEW RESPONSE action point
        CLOSED    → terminal (supervisor closed the loop)
      + re-open (supervisor) → RECEIVED → SUBMITTED (reason captured)
    """
    __tablename__ = "safety_observations"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)

    package_id  = Column(Integer, ForeignKey("packages.id"), nullable=False)
    area_id     = Column(Integer, ForeignKey("areas.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("safety_observation_categories.id"), nullable=False)
    details     = Column(Text, nullable=False)
    subcontractor_id = Column(Integer, ForeignKey("subcontractors.id"), nullable=True)
    worker_id        = Column(Integer, ForeignKey("workers.id"), nullable=True)
    remediation_request = Column(Text, nullable=True)

    # Floorplan pin (optional; tied to a floorplan that covers this area)
    floorplan_id = Column(Integer, ForeignKey("floorplans.id"), nullable=True)
    floorplan_x  = Column(Float, nullable=True)   # normalized 0..1
    floorplan_y  = Column(Float, nullable=True)   # normalized 0..1

    # Status: DRAFT | SUBMITTED | RECEIVED | CLOSED
    status = Column(String(20), default="DRAFT", nullable=False)

    # Workflow timestamps
    submitted_at    = Column(DateTime, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)
    acknowledge_comment = Column(Text, nullable=True)
    closed_at    = Column(DateTime, nullable=True)
    closed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at    = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at    = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package       = relationship("Package", foreign_keys=[package_id])
    area          = relationship("Area", foreign_keys=[area_id])
    category      = relationship("SafetyObservationCategory", foreign_keys=[category_id])
    subcontractor = relationship("Subcontractor", foreign_keys=[subcontractor_id])
    worker        = relationship("Worker", foreign_keys=[worker_id])
    floorplan     = relationship("Floorplan", foreign_keys=[floorplan_id])
    created_by       = relationship("User", foreign_keys=[created_by_id])
    updated_by       = relationship("User", foreign_keys=[updated_by_id])
    acknowledged_by  = relationship("User", foreign_keys=[acknowledged_by_id])
    closed_by        = relationship("User", foreign_keys=[closed_by_id])
    history = relationship(
        "SafetyObservationReview",
        back_populates="observation",
        cascade="all, delete-orphan",
        order_by="SafetyObservationReview.created_at",
    )


class SafetyObservationReview(Base):
    """Append-only audit log. Events:
        CREATED | SUBMITTED | ACKNOWLEDGED | CLOSED | REOPENED
    `comment` carries the acknowledge comment or the reopen reason.
    """
    __tablename__ = "safety_observation_reviews"

    id = Column(Integer, primary_key=True)
    observation_id = Column(
        Integer,
        ForeignKey("safety_observations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    event   = Column(String(20), nullable=False)
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    observation = relationship("SafetyObservation", back_populates="history")
    actor = relationship("User", foreign_keys=[actor_id])


class SafetyIncident(Base):
    """Safety incident report. Workflow:
        DRAFT → UNDER_INVESTIGATION → ACTION_IN_PROGRESS → PENDING_REVIEW → CLOSED
    Site supervisors of the linked area review the report after submission.
    Once they approve the actions, the linked package contact carries them
    out and confirms completion. Supervisors then close (or re-open back to
    ACTION_IN_PROGRESS) the report."""
    __tablename__ = "safety_incidents"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)

    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False, index=True)
    area_id    = Column(Integer, ForeignKey("areas.id"),    nullable=False, index=True)
    incident_date = Column(String(20), nullable=False)   # YYYY-MM-DD

    severity_class_id = Column(Integer, ForeignKey("safety_severity_classes.id"), nullable=False)
    incident_cause_id = Column(Integer, ForeignKey("safety_incident_causes.id"), nullable=False)
    other_cause_text  = Column(String(300), nullable=True)   # required when cause is the default 'Other'

    details = Column(Text, nullable=False)
    action  = Column(Text, nullable=False)

    status = Column(String(30), default="DRAFT", nullable=False)
    # DRAFT | UNDER_INVESTIGATION | ACTION_IN_PROGRESS | PENDING_REVIEW | CLOSED

    submitted_at         = Column(DateTime, nullable=True)
    submitted_by_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    investigated_at      = Column(DateTime, nullable=True)
    investigated_by_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    investigation_comment = Column(Text, nullable=True)
    action_completed_at    = Column(DateTime, nullable=True)
    action_completed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_completion_comment = Column(Text, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    closed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    package = relationship("Package", foreign_keys=[package_id])
    area    = relationship("Area",    foreign_keys=[area_id])
    severity_class = relationship("SafetySeverityClass", foreign_keys=[severity_class_id])
    incident_cause = relationship("SafetyIncidentCause", foreign_keys=[incident_cause_id])

    submitted_by         = relationship("User", foreign_keys=[submitted_by_id])
    investigated_by      = relationship("User", foreign_keys=[investigated_by_id])
    action_completed_by  = relationship("User", foreign_keys=[action_completed_by_id])
    closed_by            = relationship("User", foreign_keys=[closed_by_id])
    created_by           = relationship("User", foreign_keys=[created_by_id])
    updated_by           = relationship("User", foreign_keys=[updated_by_id])

    workers = relationship("SafetyIncidentWorker",
                           back_populates="incident",
                           cascade="all, delete-orphan")
    history = relationship("SafetyIncidentReview",
                           back_populates="incident",
                           cascade="all, delete-orphan",
                           order_by="SafetyIncidentReview.created_at")
    notes = relationship("SafetyIncidentNote",
                         back_populates="incident",
                         cascade="all, delete-orphan",
                         order_by="SafetyIncidentNote.created_at")


class SafetyIncidentWorker(Base):
    """Many-to-many link from a safety incident to involved workers."""
    __tablename__ = "safety_incident_workers"
    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("safety_incidents.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    worker_id   = Column(Integer, ForeignKey("workers.id"), nullable=False)

    incident = relationship("SafetyIncident", back_populates="workers")
    worker   = relationship("Worker", foreign_keys=[worker_id])

    __table_args__ = (
        UniqueConstraint("incident_id", "worker_id", name="uq_incident_worker"),
    )


class SafetyIncidentReview(Base):
    """Append-only audit log for a safety incident. Events:
        CREATED | SUBMITTED | INVESTIGATED | ACTION_DONE | CLOSED | REOPENED"""
    __tablename__ = "safety_incident_reviews"

    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("safety_incidents.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    event   = Column(String(30), nullable=False)
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    incident = relationship("SafetyIncident", back_populates="history")
    actor = relationship("User", foreign_keys=[actor_id])


class SafetyIncidentNote(Base):
    """Free-text notes added to a safety incident — same shape as MeetingPointNote."""
    __tablename__ = "safety_incident_notes"

    id = Column(Integer, primary_key=True)
    incident_id = Column(Integer, ForeignKey("safety_incidents.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    incident = relationship("SafetyIncident", back_populates="notes")
    author = relationship("User", foreign_keys=[created_by_id])


class WorkerCertificateType(Base):
    __tablename__ = "worker_certificate_types"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)


class Subcontractor(Base):
    __tablename__ = "subcontractors"
    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    company = Column(String(200), nullable=False)
    contact_person = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class Worker(Base):
    __tablename__ = "workers"
    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    name = Column(String(200), nullable=False)
    phone = Column(String(50), nullable=True)
    # A worker may be employed by the vendor themselves (is_subcontractor=False
    # and subcontractor_id=None) or by a subcontractor the vendor declared.
    is_subcontractor = Column(Boolean, default=False)
    subcontractor_id = Column(Integer, ForeignKey("subcontractors.id"), nullable=True)

    # Approval workflow (mirrors Invoice / ScopeChange pattern):
    #   PENDING  — awaiting site-supervisor review
    #   APPROVED — authorised to work on site
    #   REJECTED — supervisor rejected; vendor must resubmit or cancel
    #   CANCELLED — vendor withdrew the declaration
    status = Column(String(20), default="PENDING", nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_comment = Column(Text, nullable=True)  # last rejection comment (for quick display)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    subcontractor = relationship("Subcontractor", foreign_keys=[subcontractor_id])
    certificates = relationship("WorkerCertificate", back_populates="worker", cascade="all, delete-orphan")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    review_history = relationship(
        "WorkerReview", back_populates="worker",
        cascade="all, delete-orphan",
        order_by="WorkerReview.created_at",
    )
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class WorkerReview(Base):
    """Append-only audit log of approval events for a worker declaration —
    submit, approve, reject, resubmit, cancel. Modelled after InvoiceReview."""
    __tablename__ = "worker_reviews"

    id = Column(Integer, primary_key=True)
    worker_id = Column(Integer, ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(20), nullable=False)  # SUBMIT | APPROVE | REJECT | RESUBMIT | CANCEL | OVERRIDE
    approved = Column(Boolean, nullable=True)   # None for SUBMIT/RESUBMIT/CANCEL; True/False otherwise
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    worker = relationship("Worker", back_populates="review_history")
    actor = relationship("User", foreign_keys=[actor_id])


class WorkerCertificate(Base):
    """Link between a Worker and a WorkerCertificateType (which certs they hold)."""
    __tablename__ = "worker_certificates"
    worker_id = Column(Integer, ForeignKey("workers.id", ondelete="CASCADE"), primary_key=True)
    certificate_type_id = Column(Integer, ForeignKey("worker_certificate_types.id"), primary_key=True)

    worker = relationship("Worker", back_populates="certificates")
    certificate_type = relationship("WorkerCertificateType", foreign_keys=[certificate_type_id])


class DailyReport(Base):
    """Daily work report declared by a vendor for a package: which workers were
    on site, in which areas, with a description and average hours per worker.
    A quick "no work" report is allowed: zero hours, no workers, no areas, no
    description (used to keep the reporting streak complete)."""
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    report_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    description = Column(Text, nullable=True)
    avg_hours_per_worker = Column(Float, default=0.0, nullable=False)
    no_work = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Lock state: a report locks immediately on creation. A project owner,
    # admin or site supervisor can re-open (unlock) it so the vendor can
    # edit; the vendor's next save re-locks it.
    locked = Column(Boolean, default=True, nullable=False)
    locked_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    unlocked_at = Column(DateTime, nullable=True)
    unlocked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    unlock_comment = Column(Text, nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    workers = relationship("DailyReportWorker", back_populates="report",
                           cascade="all, delete-orphan")
    areas = relationship("DailyReportArea", back_populates="report",
                         cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    unlocked_by = relationship("User", foreign_keys=[unlocked_by_id])

    __table_args__ = (UniqueConstraint("project_id", "package_id", "report_date",
                                        name="uq_daily_report_pkg_date"),)


class DailyReportWorker(Base):
    __tablename__ = "daily_report_workers"
    daily_report_id = Column(Integer, ForeignKey("daily_reports.id", ondelete="CASCADE"), primary_key=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), primary_key=True)

    report = relationship("DailyReport", back_populates="workers")
    worker = relationship("Worker", foreign_keys=[worker_id])


class DailyReportArea(Base):
    __tablename__ = "daily_report_areas"
    daily_report_id = Column(Integer, ForeignKey("daily_reports.id", ondelete="CASCADE"), primary_key=True)
    area_id = Column(Integer, ForeignKey("areas.id"), primary_key=True)

    report = relationship("DailyReport", back_populates="areas")
    area = relationship("Area", foreign_keys=[area_id])


class WorkLog(Base):
    """Declared work period on site for a package. Project owners and team
    members can log periods; used downstream to know which packages were
    active on site when and by whom."""
    __tablename__ = "work_logs"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)
    start_date = Column(String(20), nullable=False)
    end_date = Column(String(20), nullable=True)     # nullable: still on-going
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class WorkPermit(Base):
    """A vendor-declared work permit for a specific work on a package.
    Covers start/end date, the permit types required, the areas in scope,
    a simple risk assessment (checked hazards + preventive measures, plus an
    "other" free-text block), and the required PPE (icons + optional "other").

    Approval workflow:
        DRAFT    — editable, not yet submitted
        PENDING  — submitted, awaiting per-area site-supervisor approvals
        APPROVED — every area approved (terminal)
        REJECTED — at least one area rejected; vendor edits and resubmits
    """
    __tablename__ = "work_permits"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=False)

    title = Column(String(300), nullable=True)
    description = Column(Text, nullable=True)
    start_date = Column(String(20), nullable=False)
    end_date = Column(String(20), nullable=False)

    hazards_other = Column(Text, nullable=True)
    ppe_other = Column(Text, nullable=True)

    # Approval state (rolled up from WorkPermitAreaApproval rows).
    status = Column(String(20), default="DRAFT", nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    package = relationship("Package", foreign_keys=[package_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])

    permit_types = relationship("WorkPermitPermitType", back_populates="permit",
                                cascade="all, delete-orphan")
    areas = relationship("WorkPermitArea", back_populates="permit",
                         cascade="all, delete-orphan")
    hazards = relationship("WorkPermitHazard", back_populates="permit",
                           cascade="all, delete-orphan")
    ppes = relationship("WorkPermitPPE", back_populates="permit",
                        cascade="all, delete-orphan")
    lotos = relationship("LOTO", back_populates="work_permit",
                         cascade="all, delete-orphan")
    area_approvals = relationship("WorkPermitAreaApproval", back_populates="permit",
                                  cascade="all, delete-orphan")
    review_history = relationship("WorkPermitReview", back_populates="permit",
                                  cascade="all, delete-orphan",
                                  order_by="WorkPermitReview.created_at")


class WorkPermitAreaApproval(Base):
    """Per-area approval row for a work permit. Created on submission —
    one row per selected area with status='PENDING'. Supervisors on that
    area individually flip it to APPROVED or REJECTED."""
    __tablename__ = "work_permit_area_approvals"
    __table_args__ = (
        UniqueConstraint("work_permit_id", "area_id",
                         name="uq_wpa_permit_area"),
    )

    id = Column(Integer, primary_key=True)
    work_permit_id = Column(Integer,
                            ForeignKey("work_permits.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=False)

    status = Column(String(20), default="PENDING", nullable=False)   # PENDING | APPROVED | REJECTED
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_comment = Column(Text, nullable=True)

    permit = relationship("WorkPermit", back_populates="area_approvals")
    area = relationship("Area", foreign_keys=[area_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class WorkPermitReview(Base):
    """Append-only audit log for the work-permit approval workflow.
    Events: SUBMIT | APPROVE | REJECT | RESUBMIT | OVERRIDE.
    `area_id` is populated on per-area events (APPROVE/REJECT/OVERRIDE)."""
    __tablename__ = "work_permit_reviews"

    id = Column(Integer, primary_key=True)
    work_permit_id = Column(Integer,
                            ForeignKey("work_permits.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    event = Column(String(20), nullable=False)
    area_id = Column(Integer, ForeignKey("areas.id"), nullable=True)
    approved = Column(Boolean, nullable=True)
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    permit = relationship("WorkPermit", back_populates="review_history")
    area = relationship("Area", foreign_keys=[area_id])
    actor = relationship("User", foreign_keys=[actor_id])


class WorkPermitPermitType(Base):
    __tablename__ = "work_permit_permit_types"
    work_permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"),
                            primary_key=True)
    permit_type_id = Column(Integer, ForeignKey("work_permit_types.id"),
                            primary_key=True)

    permit = relationship("WorkPermit", back_populates="permit_types")
    permit_type = relationship("WorkPermitType", foreign_keys=[permit_type_id])


class WorkPermitArea(Base):
    __tablename__ = "work_permit_areas"
    work_permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"),
                            primary_key=True)
    area_id = Column(Integer, ForeignKey("areas.id"), primary_key=True)

    permit = relationship("WorkPermit", back_populates="areas")
    area = relationship("Area", foreign_keys=[area_id])


class WorkPermitHazard(Base):
    """Checked hazard on a work permit + the preventive measure the vendor
    declared for it. Hazard entries are keyed by the icon asset filename (less
    extension) so we don't need a separate reference table for the fixed list
    of hazard symbols shipped as SVGs."""
    __tablename__ = "work_permit_hazards"
    id = Column(Integer, primary_key=True)
    work_permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"),
                            nullable=False)
    hazard_key = Column(String(100), nullable=False)
    preventive_measure = Column(Text, nullable=True)

    permit = relationship("WorkPermit", back_populates="hazards")

    __table_args__ = (UniqueConstraint("work_permit_id", "hazard_key",
                                        name="uq_work_permit_hazard"),)


class WorkPermitPPE(Base):
    """Selected PPE icon on a work permit. Keyed by icon asset filename
    (less extension)."""
    __tablename__ = "work_permit_ppes"
    id = Column(Integer, primary_key=True)
    work_permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"),
                            nullable=False)
    ppe_key = Column(String(100), nullable=False)

    permit = relationship("WorkPermit", back_populates="ppes")

    __table_args__ = (UniqueConstraint("work_permit_id", "ppe_key",
                                        name="uq_work_permit_ppe"),)


class LOTO(Base):
    """Lock Out-Tag Out entry attached to a work permit.
    Flow (duplicates the Worker approval flow):
        REQUEST → LOCKED | REFUSED (by site supervisor on one of the permit's areas)
        REFUSED → REQUEST (vendor resubmit) | CANCELLED (vendor cancel)
        LOCKED is a locked_state=True terminal state (until explicitly unlocked).
    """
    __tablename__ = "lotos"

    id = Column(Integer, primary_key=True)
    project_seq_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    work_permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"),
                            nullable=False, index=True)

    tag_number = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    status = Column(String(20), default="REQUEST", nullable=False)
    locked_state = Column(Boolean, default=False, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    refusal_comment = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    work_permit = relationship("WorkPermit", back_populates="lotos")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    review_history = relationship("LOTOReview", back_populates="loto",
                                  cascade="all, delete-orphan",
                                  order_by="LOTOReview.created_at.desc()")


class LOTOReview(Base):
    """Append-only audit log of LOTO events — submit, confirm (→LOCKED),
    refuse, resubmit, cancel, override."""
    __tablename__ = "loto_reviews"

    id = Column(Integer, primary_key=True)
    loto_id = Column(Integer, ForeignKey("lotos.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    event = Column(String(20), nullable=False)   # SUBMIT | CONFIRM | REFUSE | RESUBMIT | CANCEL | OVERRIDE
    confirmed = Column(Boolean, nullable=True)   # None for SUBMIT/RESUBMIT/CANCEL; True/False otherwise
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    loto = relationship("LOTO", back_populates="review_history")
    actor = relationship("User", foreign_keys=[actor_id])


# ─────────────────────────────────────────────────────────────────────────────
# Project closure: structured Lessons Learned + Customer Feedback letters
# ─────────────────────────────────────────────────────────────────────────────

# Canonical area list — order matters (drives form rendering and dashboard sort).
LESSON_AREAS = [
    ("project_organization",   "Project Organization"),
    ("scope_clarity",          "Scope clarity"),
    ("schedule",               "Schedule"),
    ("budget_management",      "Budget management"),
    ("communication_customer", "Communication with customer"),
    ("internal_communication", "Internal communication"),
    ("engineering_quality",    "Engineering quality"),
    ("procurement_contractors","Procurement / Contractors"),
    ("package_management",     "Package Management"),
    ("construction_execution", "Construction / Site execution"),
    ("hse_safety",             "HSE / Safety"),
    ("document_management",    "Document management / handover"),
]
LESSON_AREA_KEYS = [k for k, _ in LESSON_AREAS]
LESSON_AREA_LABELS = dict(LESSON_AREAS)
LESSON_SCORES = ("GOOD", "ACCEPTABLE", "BAD", "NA")


class ProjectStartupTask(Base):
    """A start-up checklist item created when a project is born. Surfaces in
    every PROJECT_OWNER's My Action Points under a "Project Start-up" group
    until they CLOSE it. Closing a task removes it for ALL project owners
    (single shared row, not per-owner)."""
    __tablename__ = "project_startup_tasks"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    task_key = Column(String(50), nullable=False)        # stable catalog key
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    target_module = Column(String(50), nullable=False)   # e.g. "settings", "contacts", "risks"
    target_subtab = Column(String(50), nullable=True)    # e.g. "setup", "weekly"
    sort_order = Column(Integer, default=0)
    status = Column(String(20), default="OPEN", nullable=False)  # OPEN | CLOSED
    closed_at = Column(DateTime, nullable=True)
    closed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", foreign_keys=[project_id])
    closed_by = relationship("User", foreign_keys=[closed_by_id])

    __table_args__ = (UniqueConstraint("project_id", "task_key", name="uq_startup_task_per_project"),)


class ProjectLessonAreaScore(Base):
    """Per-area score entered at project closure. Twelve rows expected per closed project."""
    __tablename__ = "project_lesson_area_scores"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    area_key = Column(String(50), nullable=False)
    score = Column(String(20), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", foreign_keys=[project_id])

    __table_args__ = (UniqueConstraint("project_id", "area_key", name="uq_lesson_area_per_project"),)


class CustomerFeedback(Base):
    """Recommendation / feedback letter from a client. Files live OUTSIDE the
    project upload tree — under uploads/Customer Feedbacks/ — so they survive
    project archiving and can be aggregated across projects."""
    __tablename__ = "customer_feedbacks"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    polarity = Column(String(20), nullable=False)   # POSITIVE | NEGATIVE
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(800), nullable=False) # absolute path under uploads/Customer Feedbacks/
    received_date = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", foreign_keys=[project_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])


# ─────────────────────────────────────────────────────────────────────────────
# Shared utility
# ─────────────────────────────────────────────────────────────────────────────

def next_project_seq(db, model_class, project_id: int) -> int:
    """Return the next per-project sequence number for any sequenced model."""
    from sqlalchemy import func
    result = db.query(func.max(model_class.project_seq_id)).filter(
        model_class.project_id == project_id
    ).scalar()
    return (result or 0) + 1
