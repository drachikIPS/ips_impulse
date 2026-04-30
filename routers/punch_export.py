"""
Punch List PDF export.

Mirror of routers/safety_export.py adapted to the punch-item domain:
  • Cover page        — Impulse logo, project info, applied filters,
                        index of every included punch item.
  • Item pages        — A4 portrait, one punch item per page. Data top-left
                        (with response and notes), floorplan with pin
                        bottom-left, up to 5 photos on the right.
  • Floorplan summary — landscape pages, optionally split per package.

Relies on the helpers and palette defined in safety_export.py so the look
stays identical between the two reports.
"""
import json
import threading
import traceback
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
import models
import auth

# Reuse the look-and-feel helpers + palette from the safety export.
from routers.safety_export import (
    _s,
    _floorplan_with_pins,
    _open_attachment_buf,
    _group_band,
    _sanitize_folder,
    LOGO_PATH,
    UPLOAD_ROOT,
    IPS_BLUE,
    ACCENT_BLUE,
    LIGHT_GRAY,
    BORDER_GRAY,
    TEXT_DARK,
    TEXT_MUTED,
    WHITE,
    GREEN,
    RED,
    AMBER,
    GRAY_400,
    GRAY_100,
)


export_router = APIRouter(prefix="/api/quality-control", tags=["punch-export"])


# ── Status palette ───────────────────────────────────────────────────────────

def _punch_status_color(status: str):
    return {
        "OPEN":      RED,
        "TO_REVIEW": AMBER,
        "CLOSED":    GREEN,
    }.get(status, GRAY_400)


def _punch_pin_color(p: models.PunchItem):
    # Punch items are all rendered red on the floorplan so they're easy to
    # spot regardless of workflow state. Status is still surfaced via the
    # pill on the data block.
    return RED


# ── Filters / grouping ───────────────────────────────────────────────────────

class PunchExportFilters(BaseModel):
    package_ids: List[int] = []
    area_ids:    List[int] = []
    statuses:    List[str] = []
    group_by:    str = "package_area"
    per_package_plans: bool = False


_GROUP_LABELS = {
    "package_area": "Package then Area",
    "area_package": "Area then Package",
    "package":      "Package",
    "area":         "Area",
    "status":       "Status",
    "none":         "None (chronological)",
}


def _grouping_keys(p: models.PunchItem, mode: str):
    pkg = (p.package.tag_number if p.package else "—")
    pkg_full = f"{pkg} - {p.package.name}" if p.package else "(no package)"
    area = (p.area.tag if p.area else "—")
    area_full = f"{area} - {p.area.description}" if p.area else "(no area)"
    if mode == "package_area":
        return (pkg, pkg_full, area, area_full)
    if mode == "area_package":
        return (area, area_full, pkg, pkg_full)
    if mode == "package":
        return (pkg, pkg_full, None, None)
    if mode == "area":
        return (area, area_full, None, None)
    if mode == "status":
        return (p.status, p.status, None, None)
    return ("", "All punch items", None, None)


def _group_punches(items, mode: str):
    by_l1 = {}
    for p in items:
        k1, l1, k2, l2 = _grouping_keys(p, mode)
        by_l1.setdefault(k1, {"label": l1, "by_l2": {}})
        sub = by_l1[k1]["by_l2"].setdefault(k2 if k2 is not None else "_", {"label": l2, "items": []})
        sub["items"].append(p)
    out = []
    for k1 in sorted(by_l1.keys()):
        sub_items = []
        for k2 in sorted(by_l1[k1]["by_l2"].keys()):
            d = by_l1[k1]["by_l2"][k2]
            sub_items.append((d["label"], d["items"]))
        out.append((by_l1[k1]["label"], sub_items))
    return out


def _filter_summary(filters: PunchExportFilters, db: Session, project_id: int) -> dict:
    if filters.package_ids:
        rows = db.query(models.Package).filter(
            models.Package.project_id == project_id,
            models.Package.id.in_(filters.package_ids),
        ).all()
        pkg_text = ", ".join(r.tag_number for r in rows) or "(none)"
    else:
        pkg_text = "All"
    if filters.area_ids:
        rows = db.query(models.Area).filter(
            models.Area.project_id == project_id,
            models.Area.id.in_(filters.area_ids),
        ).all()
        area_text = ", ".join(r.tag for r in rows) or "(none)"
    else:
        area_text = "All"
    status_text = ", ".join(filters.statuses) if filters.statuses else "All"
    return {
        "Packages": pkg_text,
        "Areas":    area_text,
        "Statuses": status_text,
        "Grouped by": _GROUP_LABELS.get(filters.group_by, filters.group_by),
    }


# ── PDF building ─────────────────────────────────────────────────────────────

def _build_punch_pdf(items, filters: PunchExportFilters, project, db: Session) -> bytes:
    from fpdf import FPDF, XPos, YPos
    from pathlib import Path

    NL = dict(new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False, margin=10)
    pdf.set_margins(10, 10, 10)

    def tc(*rgb): pdf.set_text_color(*rgb)
    def fc(*rgb): pdf.set_fill_color(*rgb)
    def dc(*rgb): pdf.set_draw_color(*rgb)

    def small_logo_header():
        if LOGO_PATH.exists():
            try:
                pdf.image(str(LOGO_PATH), x=10, y=8, w=22, keep_aspect_ratio=True)
            except Exception:
                pass
        tc(*TEXT_MUTED)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(pdf.w - 100, 10)
        proj_num = (project.project_number if project else "") or "-"
        pdf.cell(90, 4, _s(f"Punch List Report  •  {proj_num}"), align="R", **NL)
        pdf.set_xy(pdf.w - 100, 14)
        pdf.cell(90, 4, _s(f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}"), align="R", **NL)
        dc(*BORDER_GRAY)
        pdf.set_line_width(0.2)
        pdf.line(10, 22, pdf.w - 10, 22)

    # ─── COVER PAGE ──────────────────────────────────────────────────────────
    pdf.add_page()
    if LOGO_PATH.exists():
        pdf.image(str(LOGO_PATH), x=(pdf.w - 90) / 2, y=22, w=90, keep_aspect_ratio=True)

    pdf.set_y(80)
    pdf.set_font("Helvetica", "B", 24)
    tc(*IPS_BLUE)
    pdf.cell(0, 12, _s("Punch List Report"), align="C", **NL)

    pdf.ln(2)
    pdf.set_font("Helvetica", "", 12)
    tc(*TEXT_DARK)
    proj_num = (project.project_number if project else "") or "-"
    proj_desc = ((project.description if project else "") or "").strip() or "-"
    pdf.cell(0, 7, _s(f"{proj_num}  -  {proj_desc}"), align="C", **NL)

    pdf.ln(4)
    pdf.set_font("Helvetica", "", 9)
    tc(*TEXT_MUTED)
    pdf.cell(0, 5, _s(f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}"), align="C", **NL)

    # Filter card
    pdf.ln(8)
    box_x = 20
    box_w = pdf.w - 40
    fc(*LIGHT_GRAY)
    dc(*BORDER_GRAY)
    pdf.rect(box_x, pdf.get_y(), box_w, 32, "DF")
    pdf.set_xy(box_x + 4, pdf.get_y() + 3)
    pdf.set_font("Helvetica", "B", 10)
    tc(*IPS_BLUE)
    pdf.cell(0, 6, _s("Applied filters"), **NL)
    summary = _filter_summary(filters, db, project.id)
    pdf.set_font("Helvetica", "", 9)
    tc(*TEXT_DARK)
    for k, v in summary.items():
        pdf.set_x(box_x + 4)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(28, 5, _s(f"{k}:"))
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(box_w - 32, 5, _s(v))

    pdf.ln(4)

    # Index table
    pdf.set_font("Helvetica", "B", 11)
    tc(*IPS_BLUE)
    pdf.cell(0, 6, _s(f"Included punch items  ({len(items)})"), **NL)
    pdf.ln(1)

    def _index_table_header():
        pdf.set_font("Helvetica", "B", 9)
        fc(*IPS_BLUE)
        tc(*WHITE)
        pdf.cell(28, 6, _s("ID"), border=1, fill=True, align="C")
        pdf.cell(30, 6, _s("Package"), border=1, fill=True, align="C")
        pdf.cell(94, 6, _s("Topic"), border=1, fill=True, align="C")
        pdf.cell(38, 6, _s("Status"), border=1, fill=True, align="C", **NL)

    _index_table_header()
    pdf.set_font("Helvetica", "", 9)
    tc(*TEXT_DARK)
    fill_alt = False
    for p in items:
        if pdf.get_y() > 275:
            pdf.add_page()
            small_logo_header()
            pdf.set_y(28)
            _index_table_header()
            pdf.set_font("Helvetica", "", 9)
            tc(*TEXT_DARK)
            fill_alt = False
        seq = f"PI-{(p.project_seq_id or p.id):06d}"
        pkg = (p.package.tag_number if p.package else "-")
        topic = (p.topic or "-")
        if len(topic) > 60:
            topic = topic[:57] + "..."
        status = p.status or "-"
        if fill_alt:
            fc(*GRAY_100)
        else:
            fc(*WHITE)
        pdf.cell(28, 5, _s(seq), border=1, fill=True)
        pdf.cell(30, 5, _s(pkg), border=1, fill=True)
        pdf.cell(94, 5, _s(topic), border=1, fill=True)
        sc = _punch_status_color(status)
        fc(*sc)
        tc(*WHITE)
        pdf.cell(38, 5, _s(status), border=1, fill=True, align="C", **NL)
        tc(*TEXT_DARK)
        fill_alt = not fill_alt

    # ─── ITEM PAGES ──────────────────────────────────────────────────────────
    grouped = _group_punches(items, filters.group_by)

    HEADER_BOTTOM = 24
    LEFT_W = 110
    GAP = 5
    RIGHT_W = pdf.w - 20 - LEFT_W - GAP

    def _draw_status_pill(x, y, w, h, label, color):
        fc(*color)
        pdf.rect(x, y, w, h, "F")
        tc(*WHITE)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(x, y)
        pdf.cell(w, h, _s(label), align="C")
        tc(*TEXT_DARK)

    def _draw_punch(x0, y0, p):
        block_h = pdf.h - 12 - y0
        fp_h = 80
        data_h = block_h - fp_h - 4

        # Title row
        pdf.set_xy(x0, y0)
        pdf.set_font("Helvetica", "B", 11)
        tc(*IPS_BLUE)
        seq = f"PI-{(p.project_seq_id or p.id):06d}"
        pdf.cell(40, 5, _s(seq))
        sc = _punch_status_color(p.status or "")
        _draw_status_pill(x0 + 40, y0, 26, 5, p.status or "-", sc)

        # Topic line (since punches don't have a single category, the topic
        # is the most useful headline).
        pdf.set_xy(x0, y0 + 7)
        pdf.set_font("Helvetica", "B", 10)
        tc(*TEXT_DARK)
        pdf.multi_cell(LEFT_W, 5, _s(p.topic or "-"))

        # Data rows
        pdf.set_x(x0)
        pdf.set_font("Helvetica", "", 8)

        def _row(label, value, lbl_w=24):
            pdf.set_x(x0)
            pdf.set_font("Helvetica", "B", 8)
            tc(*TEXT_MUTED)
            pdf.cell(lbl_w, 4.5, _s(label))
            pdf.set_font("Helvetica", "", 8)
            tc(*TEXT_DARK)
            pdf.multi_cell(LEFT_W - lbl_w, 4.5, _s(value or "-"))

        _row("Package:",   f"{p.package.tag_number} - {p.package.name}" if p.package else "-")
        ot = p.obligation_time
        _row("Obligation:", f"{ot.code} - {ot.name}" if ot else "-")
        _row("Area:",       f"{p.area.tag} - {p.area.description}" if p.area else "-")
        if p.unit:
            _row("Unit:", f"{p.unit.tag} - {p.unit.description}")
        if p.itp_record:
            _row("Linked ITP:", p.itp_record.test or "-")
        if p.created_by:
            ts = p.created_at.strftime("%Y-%m-%d") if p.created_at else "-"
            _row("Reported:", f"{ts} by {p.created_by.name}")
        if p.updated_by and p.updated_at:
            _row("Updated:", f"{p.updated_at.strftime('%Y-%m-%d')} by {p.updated_by.name}")
        if p.submitted_by and p.submitted_by_id != (p.created_by_id if p.created_by else None):
            _row("Responder:", p.submitted_by.name)

        # Details
        pdf.ln(1)
        pdf.set_x(x0)
        pdf.set_font("Helvetica", "B", 8)
        tc(*TEXT_MUTED)
        pdf.cell(LEFT_W, 4.5, _s("Details:"), **NL)
        pdf.set_font("Helvetica", "", 8)
        tc(*TEXT_DARK)
        pdf.set_x(x0)
        pdf.multi_cell(LEFT_W, 4, _s((p.details or "-").strip()))

        # Response (the contractor's reply when status reached TO_REVIEW)
        if (p.response or "").strip():
            pdf.ln(0.5)
            pdf.set_x(x0)
            pdf.set_font("Helvetica", "B", 8)
            tc(*TEXT_MUTED)
            pdf.cell(LEFT_W, 4.5, _s("Response:"), **NL)
            pdf.set_font("Helvetica", "", 8)
            tc(*TEXT_DARK)
            pdf.set_x(x0)
            pdf.multi_cell(LEFT_W, 4, _s(p.response))

        # Notes — punch_notes table holds the threaded discussion that
        # reviewers and others post during review. Surfaced here as the
        # canonical "review comments" view.
        notes = sorted((p.notes or []), key=lambda n: (n.created_at or datetime.min))
        if notes:
            pdf.ln(0.5)
            pdf.set_x(x0)
            pdf.set_font("Helvetica", "B", 8)
            tc(*TEXT_MUTED)
            pdf.cell(LEFT_W, 4.5, _s("Notes & review comments:"), **NL)
            for n in notes:
                date_str = n.created_at.strftime("%Y-%m-%d") if n.created_at else "-"
                actor = (n.author.name if n.author else "-")
                pdf.set_x(x0)
                pdf.set_font("Helvetica", "B", 8)
                tc(*IPS_BLUE)
                pdf.cell(LEFT_W, 4, _s(f"  {date_str}  -  {actor}"), **NL)
                pdf.set_x(x0)
                pdf.set_font("Helvetica", "", 8)
                tc(*TEXT_DARK)
                pdf.multi_cell(LEFT_W, 4, _s(f"     {n.content or ''}"))

        # Floorplan
        fp_y = y0 + block_h - fp_h
        fp_w = LEFT_W
        dc(*BORDER_GRAY)
        pdf.set_line_width(0.2)
        pdf.rect(x0, fp_y, fp_w, fp_h)
        if p.floorplan_id and p.floorplan_x is not None and p.floorplan_y is not None and p.floorplan:
            buf = _floorplan_with_pins(p.floorplan, [{
                "x": p.floorplan_x,
                "y": p.floorplan_y,
                "label": str(p.project_seq_id or p.id),
                "color": "#%02x%02x%02x" % _punch_pin_color(p),
            }], label_pins=False)
            if buf is not None:
                try:
                    pdf.image(buf, x=x0 + 0.5, y=fp_y + 0.5, w=fp_w - 1, h=fp_h - 1, keep_aspect_ratio=True)
                except Exception:
                    pass
        else:
            pdf.set_xy(x0, fp_y + fp_h / 2 - 2)
            tc(*TEXT_MUTED)
            pdf.set_font("Helvetica", "I", 8)
            pdf.cell(fp_w, 4, _s("No floorplan pinned"), align="C")

        # Photos right column
        rx = x0 + LEFT_W + GAP
        ry = y0
        rh = block_h
        atts = (
            db.query(models.FileAttachment)
              .filter(models.FileAttachment.record_type == "punch")
              .filter(models.FileAttachment.record_id == p.id)
              .filter(models.FileAttachment.content_type.like("image/%"))
              .order_by(models.FileAttachment.uploaded_at, models.FileAttachment.id)
              .limit(5)
              .all()
        )
        # All photos stack in a single column — full-width cells, no
        # side-by-side grid.
        n = len(atts)
        cell_w = RIGHT_W
        if n <= 1:
            cell_h = rh
            positions = [(rx, ry)] if n == 1 else []
        else:
            cell_h = (rh - 2 * (n - 1)) / n
            positions = [(rx, ry + i * (cell_h + 2)) for i in range(n)]

        for i, att in enumerate(atts):
            if i >= len(positions):
                break
            cx, cy = positions[i]
            dc(*BORDER_GRAY)
            pdf.rect(cx, cy, cell_w, cell_h)
            buf = _open_attachment_buf(att.stored_path)
            if buf is not None:
                try:
                    pdf.image(buf, x=cx + 0.5, y=cy + 0.5,
                              w=cell_w - 1, h=cell_h - 1,
                              keep_aspect_ratio=True)
                except Exception:
                    pass
        if not atts:
            pdf.set_xy(rx, ry + rh / 2 - 4)
            tc(*TEXT_MUTED)
            pdf.set_font("Helvetica", "I", 8)
            pdf.cell(RIGHT_W, 4, _s("No photos attached"), align="C")
            dc(*BORDER_GRAY)
            pdf.rect(rx, ry, RIGHT_W, rh)

        dc(*BORDER_GRAY)
        pdf.set_line_width(0.3)
        pdf.rect(x0 - 1, y0 - 1, pdf.w - 18, block_h + 2)

    # One punch item per page
    last_l1 = None
    last_l2 = None
    for l1_label, l2_groups in grouped:
        for l2_label, group_items in l2_groups:
            for p in group_items:
                pdf.add_page()
                small_logo_header()
                pdf.set_y(HEADER_BOTTOM + 2)
                if l1_label != last_l1:
                    _group_band(pdf, l1_label, level=1)
                    last_l1 = l1_label
                    last_l2 = None
                if l2_label is not None and l2_label != last_l2:
                    _group_band(pdf, l2_label, level=2)
                    last_l2 = l2_label
                _draw_punch(11, pdf.get_y(), p)

    # ─── FLOORPLAN SUMMARY PAGES ─────────────────────────────────────────────
    plan_groups = {}
    for p in items:
        if (p.floorplan_id is None or p.floorplan_x is None
                or p.floorplan_y is None or not p.floorplan):
            continue
        key = (p.floorplan_id, p.package_id) if filters.per_package_plans else (p.floorplan_id, None)
        bucket = plan_groups.setdefault(key, {
            "fp": p.floorplan,
            "package": p.package if filters.per_package_plans else None,
            "pins": [],
        })
        col = _punch_pin_color(p)
        bucket["pins"].append({
            "x": p.floorplan_x,
            "y": p.floorplan_y,
            "label": str(p.project_seq_id or p.id),
            "color": "#%02x%02x%02x" % col,
        })

    def _plan_key_sort(k):
        fp_id, pkg_id = k
        pkg_tag = ""
        if pkg_id is not None and plan_groups[k]["package"]:
            pkg_tag = plan_groups[k]["package"].tag_number or ""
        return (fp_id, pkg_tag)

    for key in sorted(plan_groups.keys(), key=_plan_key_sort):
        blob = plan_groups[key]
        fp = blob["fp"]
        pkg = blob["package"]
        pins = blob["pins"]
        if not pins:
            continue
        pdf.add_page(orientation="L")
        small_logo_header()
        pdf.set_xy(10, HEADER_BOTTOM + 2)
        pdf.set_font("Helvetica", "B", 14)
        tc(*IPS_BLUE)
        if pkg:
            title = f"Floorplan: {fp.name}  -  Package: {pkg.tag_number} - {pkg.name}"
        else:
            title = f"Floorplan: {fp.name}"
        pdf.cell(0, 6, _s(title), **NL)
        pdf.set_font("Helvetica", "", 9)
        tc(*TEXT_MUTED)
        pdf.set_x(10)
        pdf.cell(0, 5, _s(f"{len(pins)} pinned punch item(s)"), **NL)
        avail_w = pdf.w - 20
        avail_h = pdf.h - HEADER_BOTTOM - 20
        img_y = HEADER_BOTTOM + 16
        buf = _floorplan_with_pins(fp, pins, label_pins=True)
        if buf is not None:
            try:
                pdf.image(buf, x=10, y=img_y, w=avail_w, h=avail_h, keep_aspect_ratio=True)
            except Exception:
                tc(*TEXT_MUTED)
                pdf.set_xy(10, img_y + 10)
                pdf.cell(avail_w, 6, _s("(Floorplan image could not be loaded.)"), align="C")
        else:
            tc(*TEXT_MUTED)
            pdf.set_xy(10, img_y + 10)
            pdf.cell(avail_w, 6, _s("(Floorplan image not available.)"), align="C")

    data = pdf.output()
    if isinstance(data, str):
        return data.encode("latin-1")
    return bytes(data)


# ── Background generation ────────────────────────────────────────────────────

def _filters_short_summary(filters: PunchExportFilters, item_count: int) -> str:
    parts = []
    if filters.package_ids:
        parts.append(f"{len(filters.package_ids)} package(s)")
    else:
        parts.append("all packages")
    if filters.area_ids:
        parts.append(f"{len(filters.area_ids)} area(s)")
    else:
        parts.append("all areas")
    if filters.statuses:
        parts.append("status: " + ", ".join(filters.statuses))
    parts.append("grouped by " + _GROUP_LABELS.get(filters.group_by, filters.group_by))
    if filters.per_package_plans:
        parts.append("plans split per package")
    return f"{item_count} record(s) · " + " · ".join(parts)


def _scoped_punch_query(db: Session, project_id: int, filters: PunchExportFilters,
                        vendor_contact_id: Optional[int]):
    q = db.query(models.PunchItem).filter(models.PunchItem.project_id == project_id)
    # DRAFTs are private to the creator — never include them in PDF exports.
    q = q.filter(models.PunchItem.status != "DRAFT")
    if filters.package_ids:
        q = q.filter(models.PunchItem.package_id.in_(filters.package_ids))
    if filters.area_ids:
        q = q.filter(models.PunchItem.area_id.in_(filters.area_ids))
    if filters.statuses:
        q = q.filter(models.PunchItem.status.in_(filters.statuses))
    if vendor_contact_id is not None:
        pkg_ids = [
            pc.package_id for pc in
            db.query(models.PackageContact).filter_by(contact_id=vendor_contact_id).all()
        ]
        q = q.filter(models.PunchItem.package_id.in_(pkg_ids or [-1]))
    return q.order_by(models.PunchItem.id)


def _run_punch_pdf_job(report_id: int, vendor_contact_id: Optional[int]) -> None:
    """Background worker for punch-list export. Mirrors the safety job."""
    db = SessionLocal()
    try:
        report = db.query(models.Report).filter_by(id=report_id).first()
        if not report:
            return
        report.status = "GENERATING"
        report.started_at = datetime.utcnow()
        db.commit()

        try:
            filters = PunchExportFilters(**json.loads(report.filters_json or "{}"))
        except Exception:
            filters = PunchExportFilters()

        project = db.query(models.Project).filter_by(id=report.project_id).first()
        if not project:
            raise RuntimeError("Project not found")

        items = _scoped_punch_query(db, report.project_id, filters, vendor_contact_id).all()
        pdf_bytes = _build_punch_pdf(items, filters, project, db)

        from pathlib import Path
        folder = (
            UPLOAD_ROOT
            / _sanitize_folder(project.project_number or f"project_{project.id}")
            / "Punch List Reports"
        )
        folder.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"punch_list_{ts}.pdf"
        out_path = folder / filename
        out_path.write_bytes(pdf_bytes)

        report.stored_path = str(out_path.relative_to(UPLOAD_ROOT))
        report.file_size = len(pdf_bytes)
        report.item_count = len(items)
        report.filter_summary = _filters_short_summary(filters, len(items))
        report.status = "READY"
        report.completed_at = datetime.utcnow()
        report.error_message = None
        db.commit()
    except Exception as e:
        try:
            report = db.query(models.Report).filter_by(id=report_id).first()
            if report:
                report.status = "FAILED"
                report.completed_at = datetime.utcnow()
                report.error_message = (str(e) or "Unknown error")[:1000]
                db.commit()
        except Exception:
            traceback.print_exc()
    finally:
        db.close()


# ── Endpoint ─────────────────────────────────────────────────────────────────

@export_router.post("/punches/export-pdf")
def enqueue_punches_pdf(
    body: PunchExportFilters,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot export punch items")

    project = db.query(models.Project).filter_by(id=user.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Vendors are scope-restricted by linked packages — the worker has no
    # auth context, so we capture the contact_id and replay the same filter.
    vendor_contact_id = user.contact_id if user.role == "VENDOR" else None

    title = "Punch List Report"
    report = models.Report(
        project_id=user.project_id,
        kind="punch",
        status="PENDING",
        title=title,
        filters_json=body.model_dump_json() if hasattr(body, "model_dump_json") else json.dumps(body.dict()),
        filter_summary=_filters_short_summary(body, 0),
        requested_by_id=user.id,
        requested_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    threading.Thread(
        target=_run_punch_pdf_job,
        args=(report.id, vendor_contact_id),
        daemon=True,
    ).start()

    return {
        "id": report.id,
        "status": report.status,
        "kind": report.kind,
        "title": report.title,
        "filter_summary": report.filter_summary,
        "requested_at": report.requested_at.isoformat() + "Z",
    }
