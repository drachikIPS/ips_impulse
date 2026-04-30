import sys; sys.path.insert(0, ".")
import models, database, auth
from routers import safety
db = database.SessionLocal()
try:
    incs = db.query(models.SafetyIncident).all()
    print(f"{len(incs)} incidents in DB")
    for inc in incs:
        print(f"\nIR-{(inc.project_seq_id or inc.id):06d}  proj={inc.project_id}  status={inc.status}")
        for h in inc.history:
            print(f"   {h.event:14}  comment={'<empty>' if not h.comment else repr(h.comment[:80])}")
finally:
    db.close()
