from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models
import auth

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULTS = {
    "timezone": "Europe/Brussels",
    "date_format": "DD/MM/YYYY",
    "project_name": "My Project",
    "doc_progress_started": "15",
    "doc_progress_first_issued": "65",
    "doc_progress_awc": "80",
    "max_upload_mb": "100",  # per-project upload cap for /api/attachments/upload
}


class SettingUpdate(BaseModel):
    value: Optional[str] = None


@router.get("")
def get_all_settings(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    rows = db.query(models.Setting).filter(
        models.Setting.project_id == user.project_id
    ).all()
    result = {**DEFAULTS}
    for r in rows:
        result[r.key] = r.value
    return result


@router.put("/{key}")
def update_setting(
    key: str,
    data: SettingUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can change settings")
    # Sanity-check known numeric settings so the upload limit can't be set
    # to a nonsense value that breaks the upload endpoint.
    if key == "max_upload_mb":
        try:
            mb = int(str(data.value).strip())
        except (TypeError, ValueError):
            raise HTTPException(400, "max_upload_mb must be an integer (in MB)")
        if mb < 1 or mb > 500:
            raise HTTPException(400, "max_upload_mb must be between 1 and 500")
        data = SettingUpdate(value=str(mb))
    row = db.query(models.Setting).filter(
        models.Setting.project_id == user.project_id,
        models.Setting.key == key,
    ).first()
    if row:
        row.value = data.value
    else:
        db.add(models.Setting(project_id=user.project_id, key=key, value=data.value))
    db.commit()
    return {"key": key, "value": data.value}
