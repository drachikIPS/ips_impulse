"""
Create a user account per demo contact with the correct role and attach them
to the DEMO-2026-A project.

Role mapping:
  - PMC contacts (company ImPulSe Project Management):
      * Project Director     -> PROJECT_OWNER
      * everyone else        -> PROJECT_TEAM
  - Client contacts (company Helios Chemicals N.V.):   -> CLIENT
  - Vendor contacts (any other company):               -> VENDOR

Idempotent: re-running only creates missing users.
Default password for every demo user: "demo1234" (must_change_password=True).
"""
from database import SessionLocal
import models
import auth

PROJECT_NUMBER = "DEMO-2026-A"
DEFAULT_PASSWORD = "demo1234"


def role_for(contact: models.Contact) -> str:
    co = (contact.company or "").lower()
    func = (contact.function or "").lower()
    if "impulse" in co:
        return "PROJECT_OWNER" if "director" in func else "PROJECT_TEAM"
    if "helios" in co:
        return "CLIENT"
    return "VENDOR"


def run():
    db = SessionLocal()
    try:
        proj = db.query(models.Project).filter_by(project_number=PROJECT_NUMBER).first()
        if not proj:
            print(f"No project '{PROJECT_NUMBER}' found. Run seed_demo_project.py first.")
            return
        pid = proj.id

        pwd_hash = auth.hash_password(DEFAULT_PASSWORD)

        contacts = db.query(models.Contact).filter_by(project_id=pid).all()
        created, linked, already = 0, 0, 0
        assigned_to_project = 0

        for c in contacts:
            if not c.email:
                continue

            # Existing user with this email?
            u = db.query(models.User).filter_by(email=c.email).first()
            role = role_for(c)

            if u is None:
                u = models.User(
                    name=c.name, email=c.email,
                    password_hash=pwd_hash, role=role,
                    contact_id=c.id, phone=c.phone,
                    must_change_password=True,
                )
                db.add(u); db.flush()
                created += 1
            else:
                if u.contact_id != c.id:
                    u.contact_id = c.id; linked += 1
                else:
                    already += 1
                # Only update role if user is not an admin
                if u.role != "ADMIN" and u.role != role:
                    u.role = role

            # Assign user to project
            up = db.query(models.UserProject).filter_by(user_id=u.id, project_id=pid).first()
            if up is None:
                db.add(models.UserProject(user_id=u.id, project_id=pid, role=role))
                assigned_to_project += 1
            elif up.role != role:
                up.role = role

        db.commit()
        print(f"Users created:       {created}")
        print(f"Users re-linked:     {linked}")
        print(f"Users already OK:    {already}")
        print(f"Project assignments: {assigned_to_project}")
        print(f"Default password for every user: {DEFAULT_PASSWORD}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
