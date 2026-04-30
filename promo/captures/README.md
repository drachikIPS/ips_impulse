# Captures

Drop eighteen screenshots into this folder — two per module. `storyboard.html` will replace its placeholder tiles with the real images as soon as the matching file is present.

Target size: **1920 × 1080 PNG** (or larger — the storyboard contains the image so nothing is cropped).

Each module has an **(a)** screen (the main list / dashboard view) that stays on screen for the whole scene, and a **(b)** screen (a detail or second view) that **flies in from the right** halfway through the scene.

## Expected filenames

| Primary (stays) | Secondary (flies in) | Suggested view |
|---|---|---|
| `01a-dashboard-overview.png` | `01b-dashboard-detail.png` | Dashboard home + a KPI drill-down |
| `02a-packages-list.png` | `02b-package-reviewers.png` | Packages list + package detail showing reviewer slots |
| `03a-approval-cards.png` | `03b-approval-history.png` | Scope Change PMC+Client review cards + the History timeline |
| `04a-budget-dashboard.png` | `04b-budget-charts.png` | Budget dashboard table + Monthly Invoicing / Cumulative Invoices charts |
| `05a-schedule-dashboard.png` | `05b-schedule-gantt.png` | Schedule dashboard (S-curve / package progress) + Gantt or progress-report view |
| `06a-risk-dashboard.png` | `06b-risk-matrix.png` | Risk register list (with scores) + risk matrix / heat-map view |
| `07a-documents-list.png` | `07b-document-detail.png` | Documents list + document detail with the approvals column |
| `08a-itp-register.png` | `08b-punch-gallery.png` | ITP Register + Punch detail with photo gallery preview |
| `09a-my-action-points.png` | `09b-my-action-detail.png` | My Action Points grouped view + a rejected-item drilldown |

### Closing module wall

The 3×3 wall re-uses each module's **(a)** primary shot. No extra files needed.

## How to capture

1. Log in to the platform as `admin@example.com` / `admin`.
2. Open the **DEMO-2026-A** project.
3. Navigate to each view listed above.
4. Press **F11** for full-screen, then use:
   - Windows: **Win + Shift + S** (or Snipping Tool) to grab the full window, or
   - Browser extension: *GoFullPage* / *Awesome Screenshot* for cleaner captures, or
   - **OBS Studio** → Scene capture → save frame.
5. Save with the exact filename from the table above into this folder.

Once all files are present, reload `../storyboard.html` — every scene will swap its stylised placeholder for your real capture.
