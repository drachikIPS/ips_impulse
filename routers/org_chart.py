"""
Organization Chart router — isolated module.
To remove: delete this file, remove the router include from main.py,
remove OrgChartLink from models.py, and remove org-chart.js + its script tag.
"""
import io
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from database import get_db
import models
import auth

router = APIRouter(prefix="/api/org-chart", tags=["org-chart"])


class LinkCreate(BaseModel):
    contact_id: int
    reports_to_id: int
    relation_type: str = "LINE"  # LINE | STAFF


class LinkUpdate(BaseModel):
    relation_type: str


@router.get("/links")
def list_links(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    links = db.query(models.OrgChartLink).filter_by(project_id=user.project_id).all()
    return [_fmt(l) for l in links]


@router.post("/links")
def create_link(
    body: LinkCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Not authorized")
    if body.relation_type not in ("LINE", "STAFF"):
        raise HTTPException(400, "relation_type must be LINE or STAFF")
    if body.contact_id == body.reports_to_id:
        raise HTTPException(400, "A contact cannot report to themselves")
    # Verify both contacts exist in the project
    for cid in (body.contact_id, body.reports_to_id):
        c = db.query(models.Contact).filter_by(id=cid, project_id=user.project_id).first()
        if not c:
            raise HTTPException(404, f"Contact {cid} not found in this project")
    # Check for duplicate
    existing = db.query(models.OrgChartLink).filter_by(
        project_id=user.project_id, contact_id=body.contact_id, reports_to_id=body.reports_to_id
    ).first()
    if existing:
        raise HTTPException(400, "This link already exists")
    link = models.OrgChartLink(
        project_id=user.project_id,
        contact_id=body.contact_id,
        reports_to_id=body.reports_to_id,
        relation_type=body.relation_type,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _fmt(link)


@router.put("/links/{link_id}")
def update_link(
    link_id: int,
    body: LinkUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Not authorized")
    link = db.query(models.OrgChartLink).filter_by(id=link_id, project_id=user.project_id).first()
    if not link:
        raise HTTPException(404, "Link not found")
    if body.relation_type not in ("LINE", "STAFF"):
        raise HTTPException(400, "relation_type must be LINE or STAFF")
    link.relation_type = body.relation_type
    db.commit()
    return _fmt(link)


@router.delete("/links/{link_id}")
def delete_link(
    link_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Not authorized")
    link = db.query(models.OrgChartLink).filter_by(id=link_id, project_id=user.project_id).first()
    if not link:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
    return {"ok": True}


def _fmt(l: models.OrgChartLink):
    return {
        "id": l.id,
        "contact_id": l.contact_id,
        "contact_name": l.contact.name if l.contact else None,
        "contact_function": l.contact.function if l.contact else None,
        "contact_company": l.contact.company if l.contact else None,
        "reports_to_id": l.reports_to_id,
        "reports_to_name": l.reports_to.name if l.reports_to else None,
        "reports_to_function": l.reports_to.function if l.reports_to else None,
        "relation_type": l.relation_type,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PDF Export
# ─────────────────────────────────────────────────────────────────────────────

LOGO_PATH = os.path.join("static", "assets", "impulse-logo-light@2x.png")


class OrgChartExportBody(BaseModel):
    image_base64: str
    image_width: int = 0
    image_height: int = 0
    packages: List[dict] = []
    project_number: str = ""
    client: str = ""
    description: str = ""


@router.post("/export-pdf")
def export_org_chart_pdf(
    body: OrgChartExportBody,
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    from fpdf import FPDF
    import base64 as b64
    import tempfile

    # Landscape A4: 297 x 210 mm, margins 10mm
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.set_margins(10, 10, 10)
    pdf.add_page()

    page_w = pdf.w - 20   # 277mm usable
    page_h = pdf.h - 20   # 190mm usable

    tmp_path = None
    try:
        png_bytes = b64.b64decode(body.image_base64)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(png_bytes)
            tmp_path = tmp.name

        img_w = max(body.image_width, 1)
        img_h = max(body.image_height, 1)

        # Scale to fit page
        scale = min(page_w / img_w, page_h / img_h)
        w_mm = img_w * scale
        h_mm = img_h * scale

        # Center on page
        x = 10 + (page_w - w_mm) / 2
        y = 10 + (page_h - h_mm) / 2

        pdf.image(tmp_path, x=x, y=y, w=w_mm, h=h_mm)
    except Exception:
        pdf.set_font("Helvetica", "", 12)
        pdf.text(10, 20, "Chart export failed")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    buf = io.BytesIO()
    buf.write(pdf.output())
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="organization_chart.pdf"'},
    )
