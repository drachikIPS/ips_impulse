// ─────────────────────────────────────────────────────────────────────────────
// API Client
// ─────────────────────────────────────────────────────────────────────────────
const API = {
  base: '',

  getToken() {
    return localStorage.getItem('ips_token');
  },

  setToken(token) {
    localStorage.setItem('ips_token', token);
  },

  clearToken() {
    localStorage.removeItem('ips_token');
    localStorage.removeItem('ips_user');
    localStorage.removeItem('ips_project_id');
  },

  getProjectId() {
    return localStorage.getItem('ips_project_id');
  },

  setProjectId(id) {
    localStorage.setItem('ips_project_id', String(id));
  },

  clearProjectId() {
    localStorage.removeItem('ips_project_id');
  },

  // Per-project "last view" — { module, subtab, meetingSubTab? }
  getLastView(projectId) {
    if (!projectId) return null;
    try {
      const raw = localStorage.getItem(`ips_lastview_${projectId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setLastView(projectId, view) {
    if (!projectId || !view) return;
    try {
      localStorage.setItem(`ips_lastview_${projectId}`, JSON.stringify(view));
    } catch { /* ignore quota errors */ }
  },

  // Impersonation — stored in memory only (cleared on page reload)
  _impersonatedUserId: null,
  setImpersonatedUserId(id) { this._impersonatedUserId = id ? String(id) : null; },
  clearImpersonatedUserId() { this._impersonatedUserId = null; },

  headers() {
    const token = this.getToken();
    const projectId = this.getProjectId();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(projectId ? { 'X-Project-ID': projectId } : {}),
      ...(this._impersonatedUserId ? { 'X-Impersonate-User-ID': this._impersonatedUserId } : {}),
    };
  },

  async request(method, path, body = null) {
    const opts = { method, headers: this.headers() };
    if (body !== null) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    if (res.status === 401) {
      this.clearToken();
      window.location.reload();
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.detail || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get: (path) => API.request('GET', path),
  post: (path, body) => API.request('POST', path, body),
  put: (path, body) => API.request('PUT', path, body),
  del: (path) => API.request('DELETE', path),

  async download(path, filename) {
    const res = await fetch(API.base + path, { method: 'GET', headers: API.headers() });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const d = await res.json(); detail = d.detail || JSON.stringify(d); } catch {}
      throw new Error(detail);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Auth
  login: (email, password) => API.post('/api/auth/login', { email, password }),
  getMe: () => API.get('/api/auth/me'),
  updateMe: (data) => API.put('/api/auth/me', data),
  changePassword: (data) => API.post('/api/auth/change-password', data),

  // Users
  getUsers: () => API.get('/api/auth/users'),
  createUser: (data) => API.post('/api/auth/users', data),
  updateUser: (id, data) => API.put(`/api/auth/users/${id}`, data),
  deleteUser: (id) => API.del(`/api/auth/users/${id}`),
  bulkDeleteUsers: (data) => API.post('/api/auth/users/bulk-delete', data),

  // Projects
  getProjects: () => API.get('/api/projects'),
  // Project start-up checklist
  getStartupTasks: () => API.get('/api/startup-tasks'),
  closeStartupTask: (id) => API.post(`/api/startup-tasks/${id}/close`, {}),
  createProject: (data) => API.post('/api/projects', data),
  updateProject: (id, data) => API.put(`/api/projects/${id}`, data),
  deleteProject: (id) => API.del(`/api/projects/${id}`),
  closeProject: (id, data) => API.post(`/api/projects/${id}/close`, data),
  runDemoSeed: () => API.post('/api/projects/seed-demo', {}),
  getProjectClosureCandidates: (id) => API.get(`/api/projects/${id}/post-close-removal-candidates`),
  getProjectLessonsLearned: (id) => API.get(`/api/projects/${id}/lessons-learned`),
  getLessonsLearnedPortal: () => API.get(`/api/projects/lessons-learned/portal`),
  listCustomerFeedbacks: (id) => API.get(`/api/projects/${id}/customer-feedbacks`),
  deleteCustomerFeedback: (fbId) => API.del(`/api/projects/customer-feedbacks/${fbId}`),
  customerFeedbackDownloadUrl: (fbId) => `/api/projects/customer-feedbacks/${fbId}/download`,
  async uploadCustomerFeedback(projectId, { polarity, received_date, notes, file }) {
    const fd = new FormData();
    fd.append('polarity', polarity);
    fd.append('received_date', received_date || '');
    fd.append('notes', notes || '');
    fd.append('file', file);
    const res = await fetch(`/api/projects/${projectId}/customer-feedback`, {
      method: 'POST', headers: API._buildFileHeaders(), body: fd,
    });
    if (res.status === 401) { API.clearToken(); window.location.reload(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.detail || 'Upload failed'); e.status = res.status; throw e; }
    return data;
  },
  getProjectUsers: (id) => API.get(`/api/projects/${id}/users`),
  addProjectUser: (id, data) => API.post(`/api/projects/${id}/users`, data),
  updateProjectUser: (id, userId, data) => API.put(`/api/projects/${id}/users/${userId}`, data),
  removeProjectUser: (id, userId) => API.del(`/api/projects/${id}/users/${userId}`),

  // Contacts
  getContacts: () => API.get('/api/contacts'),
  createContact: (data) => API.post('/api/contacts', data),
  updateContact: (id, data) => API.put(`/api/contacts/${id}`, data),
  deleteContact: (id) => API.del(`/api/contacts/${id}`),
  createAccountFromContact: (contactId, data) => API.post(`/api/contacts/${contactId}/create-account`, data),

  // Meeting Types
  getMeetingTypes: () => API.get('/api/meeting-types'),
  getAllRecurringMeetingTypes: () => API.get('/api/meeting-types/all-recurring'),
  getMeetingType: (id) => API.get(`/api/meeting-types/${id}`),
  createMeetingType: (data) => API.post('/api/meeting-types', data),
  updateMeetingType: (id, data) => API.put(`/api/meeting-types/${id}`, data),
  deleteMeetingType: (id) => API.del(`/api/meeting-types/${id}`),

  // Meetings
  getMeetings: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return API.get(`/api/meetings${q ? '?' + q : ''}`);
  },
  getMeeting: (id) => API.get(`/api/meetings/${id}`),
  createMeeting: (data) => API.post('/api/meetings', data),
  updateMeeting: (id, data) => API.put(`/api/meetings/${id}`, data),
  deleteMeeting: (id) => API.del(`/api/meetings/${id}`),
  togglePresent: (meetingId, contactId, present) =>
    API.put(`/api/meetings/${meetingId}/participants/${contactId}/present?present=${present}`),
  bulkCreateRecurringMeetings: (data) => API.post('/api/meetings/bulk-recurring', data),

  // Meeting Points
  getMeetingPoints: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))
    ).toString();
    return API.get(`/api/meeting-points${q ? '?' + q : ''}`);
  },
  getMeetingPoint: (id) => API.get(`/api/meeting-points/${id}`),
  createMeetingPoint: (data) => API.post('/api/meeting-points', data),
  updateMeetingPoint: (id, data) => API.put(`/api/meeting-points/${id}`, data),
  deleteMeetingPoint: (id) => API.del(`/api/meeting-points/${id}`),
  linkPointToMeeting: (id, data) => API.post(`/api/meeting-points/${id}/link`, data),
  togglePreparation: (id, meetingId, val) =>
    API.put(`/api/meeting-points/${id}/preparation?meeting_id=${meetingId}&for_preparation=${val}`),
  closePoint: (id) => API.post(`/api/meeting-points/${id}/close`),
  reopenPoint: (id) => API.post(`/api/meeting-points/${id}/reopen`),
  declareDonePoint: (id) => API.post(`/api/meeting-points/${id}/declare-done`),
  addNote: (id, data) => API.post(`/api/meeting-points/${id}/notes`, data),
  updateNote: (id, noteId, data) => API.put(`/api/meeting-points/${id}/notes/${noteId}`, data),
  deleteNote: (id, noteId) => API.del(`/api/meeting-points/${id}/notes/${noteId}`),

  // Packages
  getPackages: () => API.get('/api/packages'),
  getPackage: (id) => API.get(`/api/packages/${id}`),
  createPackage: (data) => API.post('/api/packages', data),
  updatePackage: (id, data) => API.put(`/api/packages/${id}`, data),
  deletePackage: (id) => API.del(`/api/packages/${id}`),

  // Subservices
  getSubservices: () => API.get('/api/subservices'),
  createSubservice: (data) => API.post('/api/subservices', data),
  updateSubservice: (id, data) => API.put(`/api/subservices/${id}`, data),
  deleteSubservice: (id) => API.del(`/api/subservices/${id}`),

  // Documents
  getDocuments: (params) => API.get('/api/documents' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  getDocument: (id) => API.get(`/api/documents/${id}`),
  createDocument: (data) => API.post('/api/documents', data),
  updateDocument: (id, data) => API.put(`/api/documents/${id}`, data),
  deleteDocument: (id) => API.del(`/api/documents/${id}`),
  launchDocumentApproval: (id) => API.post(`/api/documents/${id}/launch`),
  submitDocumentReview: (id, data) => API.post(`/api/documents/${id}/review`, data),
  overrideDocumentApproval: (id, data) => API.post(`/api/documents/${id}/override`, data),
  newDocumentVersion: (id) => API.post(`/api/documents/${id}/new-version`),
  getDocumentHistory: (id) => API.get(`/api/documents/${id}/history`),
  previewDocumentReviewers: (id) => API.get(`/api/documents/${id}/preview-reviewers`),
  getMyPendingDocReviews: () => API.get('/api/documents/my-pending-reviews'),
  getMyRejectedDocs: () => API.get('/api/documents/my-rejected'),
  getDocApprovalOverview: () => API.get('/api/documents/approval-overview'),
  startDocument: (id) => API.post(`/api/documents/${id}/start`, {}),

  // Document Receipt Acknowledgment
  getDocumentReceipts: (docId) => API.get(`/api/documents/${docId}/receipts`),
  acknowledgeDocumentReceipt: (docId, packageId) => API.post(`/api/documents/${docId}/receipts/${packageId}/acknowledge`),
  getPendingDocumentReceipts: () => API.get('/api/documents/receipts/pending'),

  // Document Comment Log
  getDocumentComments: (docId, params) => API.get(`/api/documents/${docId}/comments` + (params ? '?' + new URLSearchParams(params).toString() : '')),
  getAllDocumentComments: (params) => API.get('/api/documents/all-comments' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  createDocumentComment: (docId, data) => API.post(`/api/documents/${docId}/comments`, data),
  updateDocumentComment: (docId, commentId, data) => API.put(`/api/documents/${docId}/comments/${commentId}`, data),
  deleteDocumentComment: (docId, commentId) => API.del(`/api/documents/${docId}/comments/${commentId}`),
  addDocumentCommentNote: (docId, commentId, data) => API.post(`/api/documents/${docId}/comments/${commentId}/notes`, data),
  linkCommentVersion: (docId, commentId, data) => API.post(`/api/documents/${docId}/comments/${commentId}/link-version`, data),
  unlinkCommentVersion: (docId, commentId, version) => API.del(`/api/documents/${docId}/comments/${commentId}/link-version/${version}`),
  getDocumentDashboard: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))
    ).toString();
    return API.get(`/api/documents/dashboard${q ? '?' + q : ''}`);
  },

  // File Attachments
  getAttachments: (recordType, recordId) =>
    API.get(`/api/attachments?record_type=${recordType}&record_id=${recordId}`),
  getAllAttachments: (recordType) =>
    API.get(`/api/attachments/all${recordType ? '?record_type=' + recordType : ''}`),
  deleteAttachment: (id) => API.del(`/api/attachments/${id}`),
  _buildFileHeaders() {
    const token = this.getToken();
    const projectId = this.getProjectId();
    const h = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (projectId) h['X-Project-ID'] = projectId;
    if (this._impersonatedUserId) h['X-Impersonate-User-ID'] = this._impersonatedUserId;
    return h;
  },

  async uploadAttachment(recordType, recordId, file) {
    const formData = new FormData();
    formData.append('record_type', recordType);
    formData.append('record_id', String(recordId));
    formData.append('file', file);
    const res = await fetch('/api/attachments/upload', { method: 'POST', headers: API._buildFileHeaders(), body: formData });
    if (res.status === 401) { API.clearToken(); window.location.reload(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.detail || 'Upload failed'); e.status = res.status; throw e; }
    return data;
  },
  async fetchAttachmentBlob(id, inline = true) {
    const path = inline ? `/api/attachments/${id}/view` : `/api/attachments/${id}/download`;
    const res = await fetch(path, { headers: API._buildFileHeaders() });
    if (!res.ok) throw new Error('File not found');
    return res.blob();
  },

  async downloadAttachmentZip(ids, filename) {
    if (!ids || !ids.length) throw new Error('No attachments selected');
    const qs = new URLSearchParams({ ids: ids.join(','), filename: filename || 'attachments.zip' }).toString();
    const res = await fetch(`/api/attachments/zip?${qs}`, { headers: API._buildFileHeaders() });
    if (!res.ok) {
      let msg = 'Download failed';
      try { const j = await res.json(); msg = j.detail || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'attachments.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },

  // Used by the Files master list — works for FileAttachment, Floorplan, and
  // Report rows because each carries its own view_url / download_url.
  async fetchFileRowBlob(att, inline = true) {
    const url = inline ? (att.view_url || att.download_url) : (att.download_url || att.view_url);
    if (!url) throw new Error('No URL for this file');
    const res = await fetch(url, { headers: API._buildFileHeaders() });
    if (!res.ok) throw new Error('File not found');
    return res.blob();
  },

  // Areas
  getAreas: () => API.get('/api/areas'),
  createArea: (data) => API.post('/api/areas', data),
  updateArea: (id, data) => API.put(`/api/areas/${id}`, data),
  getEligibleAreaSupervisors: () => API.get('/api/areas/eligible-supervisors'),
  setAreaFloorplan: (areaId, floorplanId) =>
    API.put(`/api/areas/${areaId}/floorplan`, { floorplan_id: floorplanId }),

  // Floorplans
  getFloorplans: () => API.get('/api/floorplans'),
  updateFloorplan: (id, data) => API.put(`/api/floorplans/${id}`, data),
  deleteFloorplan: (id) => API.del(`/api/floorplans/${id}`),
  async fetchFloorplanImageBlob(id) {
    const res = await fetch(`/api/floorplans/${id}/image`, { headers: API._buildFileHeaders() });
    if (!res.ok) throw new Error('Floorplan image not found');
    return res.blob();
  },
  async uploadFloorplan(name, areaIds, file) {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('area_ids', (areaIds || []).join(','));
    fd.append('file', file);
    const res = await fetch('/api/floorplans/upload', {
      method: 'POST',
      headers: API._buildFileHeaders(),
      body: fd,
    });
    if (res.status === 401) { API.clearToken(); window.location.reload(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.detail || 'Upload failed'); e.status = res.status; throw e; }
    return data;
  },

  // ── Construction module ───────────────────────────────────────────────────
  listConstructionSetup: (kind) => API.get(`/api/construction/setup/${kind}`),
  createConstructionSetup: (kind, data) => API.post(`/api/construction/setup/${kind}`, data),
  updateConstructionSetup: (kind, id, data) => API.put(`/api/construction/setup/${kind}/${id}`, data),
  deleteConstructionSetup: (kind, id) => API.delete(`/api/construction/setup/${kind}/${id}`),
  getConstructionAreasSupervisors: () => API.get('/api/construction/setup/areas-supervisors'),
  getSubcontractors: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return API.get('/api/construction/subcontractors' + (q ? '?' + q : ''));
  },
  createSubcontractor: (data) => API.post('/api/construction/subcontractors', data),
  updateSubcontractor: (id, data) => API.put(`/api/construction/subcontractors/${id}`, data),
  deleteSubcontractor: (id) => API.del(`/api/construction/subcontractors/${id}`),
  getWorkers: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return API.get('/api/construction/workers' + (q ? '?' + q : ''));
  },
  createWorker: (data) => API.post('/api/construction/workers', data),
  updateWorker: (id, data) => API.put(`/api/construction/workers/${id}`, data),
  deleteWorker: (id) => API.delete(`/api/construction/workers/${id}`),
  getWorkerHistory: (id) => API.get(`/api/construction/workers/${id}/history`),
  getWorkersPendingApproval: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/workers/pending-approval' + (q ? '?' + q : ''));
  },
  getMyRejectedWorkers: () => API.get('/api/construction/workers/my-rejected'),
  approveWorker: (id, data) => API.post(`/api/construction/workers/${id}/approve`, data || {}),
  rejectWorker: (id, data) => API.post(`/api/construction/workers/${id}/reject`, data || {}),
  overrideWorker: (id, data) => API.post(`/api/construction/workers/${id}/override`, data || {}),
  resubmitWorker: (id, data) => API.post(`/api/construction/workers/${id}/resubmit`, data || {}),
  cancelWorker: (id, data) => API.post(`/api/construction/workers/${id}/cancel`, data || {}),
  getDailyReports: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/daily-reports' + (q ? '?' + q : ''));
  },
  getConstructionActiveWorkersSeries: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/dashboard/active-workers' + (q ? '?' + q : ''));
  },
  createDailyReport: (data) => API.post('/api/construction/daily-reports', data),
  updateDailyReport: (id, data) => API.put(`/api/construction/daily-reports/${id}`, data),
  deleteDailyReport: (id) => API.delete(`/api/construction/daily-reports/${id}`),
  unlockDailyReport: (id, data) => API.post(`/api/construction/daily-reports/${id}/unlock`, data || {}),
  getPendingDailyReports: () => API.get('/api/construction/daily-reports/pending'),

  // Work permits
  getWorkPermits: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/work-permits' + (q ? '?' + q : ''));
  },
  getWorkPermit: (id) => API.get(`/api/construction/work-permits/${id}`),
  createWorkPermit: (data) => API.post('/api/construction/work-permits', data),
  updateWorkPermit: (id, data) => API.put(`/api/construction/work-permits/${id}`, data),
  deleteWorkPermit: (id) => API.delete(`/api/construction/work-permits/${id}`),
  submitWorkPermit: (id, data) => API.post(`/api/construction/work-permits/${id}/submit`, data || {}),
  approveWorkPermit: (id, data) => API.post(`/api/construction/work-permits/${id}/approve`, data || {}),
  rejectWorkPermit: (id, data) => API.post(`/api/construction/work-permits/${id}/reject`, data || {}),
  closeWorkPermit: (id, data) => API.post(`/api/construction/work-permits/${id}/close`, data || {}),
  requestWorkPermitExtension: (id, data) => API.post(`/api/construction/work-permits/${id}/request-extension`, data || {}),
  getWorkPermitHistory: (id) => API.get(`/api/construction/work-permits/${id}/history`),
  workPermitPdfUrl: (id) => `/api/construction/work-permits/${id}/export-pdf`,
  getWorkPermitsPendingApproval: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/work-permits/pending-approval' + (q ? '?' + q : ''));
  },
  getMyRejectedWorkPermits: () => API.get('/api/construction/work-permits/my-rejected'),
  getApprovedDueWorkPermits: () => API.get('/api/construction/work-permits/approved-due'),

  // LOTO
  getLotos: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/lotos' + (q ? '?' + q : ''));
  },
  getLotoHistory: (id) => API.get(`/api/construction/lotos/${id}/history`),
  getLotosPendingApproval: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/lotos/pending-approval' + (q ? '?' + q : ''));
  },
  getMyRefusedLotos: () => API.get('/api/construction/lotos/my-refused'),
  getPendingReleaseLotos: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString();
    return API.get('/api/construction/lotos/pending-release' + (q ? '?' + q : ''));
  },
  confirmLoto:  (id, data) => API.post(`/api/construction/lotos/${id}/confirm`,  data || {}),
  refuseLoto:   (id, data) => API.post(`/api/construction/lotos/${id}/refuse`,   data || {}),
  overrideLoto: (id, data) => API.post(`/api/construction/lotos/${id}/override`, data || {}),
  resubmitLoto: (id, data) => API.post(`/api/construction/lotos/${id}/resubmit`, data || {}),
  cancelLoto:   (id, data) => API.post(`/api/construction/lotos/${id}/cancel`,   data || {}),
  releaseLoto:  (id, data) => API.post(`/api/construction/lotos/${id}/release`,  data || {}),

  getWorkLogs: () => API.get('/api/construction/work-logs'),
  createWorkLog: (data) => API.post('/api/construction/work-logs', data),
  updateWorkLog: (id, data) => API.put(`/api/construction/work-logs/${id}`, data),
  deleteWorkLog: (id) => API.delete(`/api/construction/work-logs/${id}`),

  // ── Safety module ─────────────────────────────────────────────────────────
  listSafetyObservationCategories: () => API.get('/api/safety/setup/observation-categories'),
  createSafetyObservationCategory: (data) => API.post('/api/safety/setup/observation-categories', data),
  updateSafetyObservationCategory: (id, data) => API.put(`/api/safety/setup/observation-categories/${id}`, data),
  deleteSafetyObservationCategory: (id) => API.del(`/api/safety/setup/observation-categories/${id}`),

  // Severity classes (worst → least worst, level 1 = worst)
  listSafetySeverityClasses: () => API.get('/api/safety/setup/severity-classes'),
  createSafetySeverityClass: (data) => API.post('/api/safety/setup/severity-classes', data),
  updateSafetySeverityClass: (id, data) => API.put(`/api/safety/setup/severity-classes/${id}`, data),
  deleteSafetySeverityClass: (id) => API.del(`/api/safety/setup/severity-classes/${id}`),
  reorderSafetySeverityClasses: (ids) => API.post('/api/safety/setup/severity-classes/reorder', { ids }),

  // Incident causes ('Other' is protected from deletion)
  listSafetyIncidentCauses: () => API.get('/api/safety/setup/incident-causes'),
  createSafetyIncidentCause: (data) => API.post('/api/safety/setup/incident-causes', data),
  updateSafetyIncidentCause: (id, data) => API.put(`/api/safety/setup/incident-causes/${id}`, data),
  deleteSafetyIncidentCause: (id) => API.del(`/api/safety/setup/incident-causes/${id}`),

  // Toolbox categories ('Other' is protected from deletion/rename)
  listSafetyToolboxCategories: () => API.get('/api/safety/setup/toolbox-categories'),
  createSafetyToolboxCategory: (data) => API.post('/api/safety/setup/toolbox-categories', data),
  updateSafetyToolboxCategory: (id, data) => API.put(`/api/safety/setup/toolbox-categories/${id}`, data),
  deleteSafetyToolboxCategory: (id) => API.del(`/api/safety/setup/toolbox-categories/${id}`),

  // Toolbox talks (DRAFT → SUBMITTED, with re-open)
  listSafetyToolboxes: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return API.get('/api/safety/toolboxes' + (q ? '?' + q : ''));
  },
  getSafetyToolbox:    (id) => API.get(`/api/safety/toolboxes/${id}`),
  createSafetyToolbox: (data) => API.post('/api/safety/toolboxes', data),
  updateSafetyToolbox: (id, data) => API.put(`/api/safety/toolboxes/${id}`, data),
  deleteSafetyToolbox: (id) => API.del(`/api/safety/toolboxes/${id}`),
  submitSafetyToolbox: (id, data = {}) => API.post(`/api/safety/toolboxes/${id}/submit`, data),
  acknowledgeSafetyToolbox: (id, data = {}) => API.post(`/api/safety/toolboxes/${id}/acknowledge`, data),
  reopenSafetyToolbox: (id, data = {}) => API.post(`/api/safety/toolboxes/${id}/reopen`, data),
  getSafetyToolboxGivers: () => API.get('/api/safety/toolbox-givers'),
  getMyPendingSafetyToolboxes: () => API.get('/api/safety/toolboxes/my-pending'),

  // Safety dashboard
  getSafetyDashboard:        () => API.get('/api/safety/dashboard'),
  getSafetyReferenceHours:   () => API.get('/api/safety/dashboard/reference-hours'),
  setSafetyReferenceHours:   (data) => API.put('/api/safety/dashboard/reference-hours', data),

  // Incidents (DRAFT → UNDER_INVESTIGATION → ACTION_IN_PROGRESS → PENDING_REVIEW → CLOSED)
  listSafetyIncidents: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return API.get('/api/safety/incidents' + (q ? '?' + q : ''));
  },
  getSafetyIncident:        (id) => API.get(`/api/safety/incidents/${id}`),
  createSafetyIncident:     (data) => API.post('/api/safety/incidents', data),
  updateSafetyIncident:     (id, data) => API.put(`/api/safety/incidents/${id}`, data),
  deleteSafetyIncident:     (id) => API.del(`/api/safety/incidents/${id}`),
  submitSafetyIncident:     (id, data = {}) => API.post(`/api/safety/incidents/${id}/submit`, data),
  approveIncidentInvestigation: (id, data = {}) => API.post(`/api/safety/incidents/${id}/approve-investigation`, data),
  markIncidentActionDone:   (id, data = {}) => API.post(`/api/safety/incidents/${id}/mark-action-done`, data),
  closeSafetyIncident:      (id, data = {}) => API.post(`/api/safety/incidents/${id}/close`, data),
  reopenSafetyIncident:     (id, data = {}) => API.post(`/api/safety/incidents/${id}/reopen`, data),
  getMyPendingSafetyIncidents: () => API.get('/api/safety/incidents/my-pending'),

  // Incident notes
  addSafetyIncidentNote:    (incId, data) => API.post(`/api/safety/incidents/${incId}/notes`, data),
  updateSafetyIncidentNote: (incId, noteId, data) => API.put(`/api/safety/incidents/${incId}/notes/${noteId}`, data),
  deleteSafetyIncidentNote: (incId, noteId) => API.del(`/api/safety/incidents/${incId}/notes/${noteId}`),

  // Safety Observations (DRAFT → SUBMITTED → RECEIVED → CLOSED + re-open)
  listSafetyObservations: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return API.get('/api/safety/observations' + (q ? '?' + q : ''));
  },
  getSafetyObservation: (id) => API.get(`/api/safety/observations/${id}`),
  createSafetyObservation: (data) => API.post('/api/safety/observations', data),
  updateSafetyObservation: (id, data) => API.put(`/api/safety/observations/${id}`, data),
  submitSafetyObservation:       (id, data) => API.post(`/api/safety/observations/${id}/submit`, data || {}),
  acknowledgeSafetyObservation:  (id, data) => API.post(`/api/safety/observations/${id}/acknowledge`, data || {}),
  closeSafetyObservation:        (id, data) => API.post(`/api/safety/observations/${id}/close`, data || {}),
  reopenSafetyObservation:       (id, data) => API.post(`/api/safety/observations/${id}/reopen`, data || {}),
  deleteSafetyObservation:       (id) => API.del(`/api/safety/observations/${id}`),
  getMyPendingSafetyObservations: () => API.get('/api/safety/observations/my-pending'),
  async exportSafetyObservationsPdf(filters) {
    const res = await fetch(API.base + '/api/safety/observations/export-pdf', {
      method: 'POST',
      headers: API.headers(),
      body: JSON.stringify(filters || {}),
    });
    if (res.status === 401) { API.clearToken(); window.location.reload(); return; }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const d = await res.json(); detail = d.detail || detail; } catch {}
      const e = new Error(detail); e.status = res.status; throw e;
    }
    return res.json();   // now returns { id, status, kind, ... }
  },
  async exportPunchListPdf(filters) {
    const res = await fetch(API.base + '/api/quality-control/punches/export-pdf', {
      method: 'POST',
      headers: API.headers(),
      body: JSON.stringify(filters || {}),
    });
    if (res.status === 401) { API.clearToken(); window.location.reload(); return; }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const d = await res.json(); detail = d.detail || detail; } catch {}
      const e = new Error(detail); e.status = res.status; throw e;
    }
    return res.json();   // now returns { id, status, kind, ... }
  },

  // Reports — background-generated PDFs
  listReports: (kind, limit = 25) => {
    const q = new URLSearchParams();
    if (kind)  q.set('kind', kind);
    if (limit) q.set('limit', String(limit));
    const s = q.toString();
    return API.get('/api/reports' + (s ? '?' + s : ''));
  },
  getReport: (id) => API.get(`/api/reports/${id}`),
  deleteReport: (id) => API.del(`/api/reports/${id}`),
  async downloadReport(id, filename) {
    const res = await fetch(API.base + `/api/reports/${id}/download`, {
      method: 'GET',
      headers: API._buildFileHeaders(),
    });
    if (res.status === 401) { API.clearToken(); window.location.reload(); return; }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const d = await res.json(); detail = d.detail || detail; } catch {}
      const e = new Error(detail); e.status = res.status; throw e;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `report_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
  deleteArea: (id) => API.delete(`/api/areas/${id}`),

  // Units
  getUnits: () => API.get('/api/units'),
  createUnit: (data) => API.post('/api/units', data),
  updateUnit: (id, data) => API.put(`/api/units/${id}`, data),
  deleteUnit: (id) => API.delete(`/api/units/${id}`),

  // Settings
  getSettings: () => API.get('/api/settings'),
  updateSetting: (key, value) => API.put(`/api/settings/${key}`, { value }),

  // Module Leads (per-project, per-module override roles)
  getModuleLeads: () => API.get('/api/module-leads'),
  getMyLeadModules: () => API.get('/api/module-leads/mine'),
  getModuleLeadEligibleContacts: () => API.get('/api/module-leads/eligible-contacts'),
  setModuleLeads: (module, contactIds) => API.put(`/api/module-leads/${encodeURIComponent(module)}`, { contact_ids: contactIds }),

  // Budget
  getBudgetOverview: () => API.get('/api/budget/overview'),
  getBudgetRiskImpact: () => API.get('/api/budget/risk-impact'),
  upsertBaseline: (packageId, data) => API.put(`/api/budget/baselines/${packageId}`, data),
  getBudgetOrders: (packageId) => API.get(`/api/budget/orders${packageId ? '?package_id=' + packageId : ''}`),
  createOrder: (data) => API.post('/api/budget/orders', data),
  updateOrder: (id, data) => API.put(`/api/budget/orders/${id}`, data),
  deleteOrder: (id) => API.del(`/api/budget/orders/${id}`),
  getBudgetTransfers: () => API.get('/api/budget/transfers'),
  createTransfer: (data) => API.post('/api/budget/transfers', data),
  deleteTransfer: (id) => API.del(`/api/budget/transfers/${id}`),
  getBudgetInvoices: (packageId) => API.get(`/api/budget/invoices${packageId ? '?package_id=' + packageId : ''}`),
  getPendingInvoiceReviews: () => API.get('/api/budget/invoices/pending-review'),
  getMyRejectedInvoices: () => API.get('/api/budget/invoices/my-rejected'),
  getInvoiceHistory: (id) => API.get(`/api/budget/invoices/${id}/history`),
  createInvoice: (data) => API.post('/api/budget/invoices', data),
  updateInvoice: (id, data) => API.put(`/api/budget/invoices/${id}`, data),
  submitInvoice: (id) => API.post(`/api/budget/invoices/${id}/submit`),
  // Resubmit uses the same /submit endpoint (it handles DRAFT + REJECTED)
  resubmitInvoice: (id) => API.post(`/api/budget/invoices/${id}/submit`),
  pmcReviewInvoice: (id, data) => API.post(`/api/budget/invoices/${id}/pmc-review`, data),
  clientReviewInvoice: (id, data) => API.post(`/api/budget/invoices/${id}/client-review`, data),
  overrideInvoice: (id, data) => API.post(`/api/budget/invoices/${id}/override`, data),
  cancelInvoice: (id) => API.post(`/api/budget/invoices/${id}/cancel`),
  reopenInvoice: (id) => API.post(`/api/budget/invoices/${id}/reopen`),
  deleteInvoice: (id) => API.del(`/api/budget/invoices/${id}`),

  // Risk Register
  getRiskScoreSetup: () => API.get('/api/risks/score-setup'),
  updateRiskScore: (score, data) => API.put(`/api/risks/score-setup/${score}`, data),
  getRiskMatrix: () => API.get('/api/risks/matrix'),
  updateMatrixCell: (prob, impact, data) => API.put(`/api/risks/matrix/${prob}/${impact}`, data),
  getRiskCategories: () => API.get('/api/risks/categories'),
  createRiskCategory: (data) => API.post('/api/risks/categories', data),
  updateRiskCategory: (id, data) => API.put(`/api/risks/categories/${id}`, data),
  deleteRiskCategory: (id) => API.del(`/api/risks/categories/${id}`),
  getRiskPhases: () => API.get('/api/risks/phases'),
  createRiskPhase: (data) => API.post('/api/risks/phases', data),
  updateRiskPhase: (id, data) => API.put(`/api/risks/phases/${id}`, data),
  deleteRiskPhase: (id) => API.del(`/api/risks/phases/${id}`),
  getMyOpenRisks: () => API.get('/api/risks/my-open'),
  getRisks: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))
    ).toString();
    return API.get(`/api/risks${q ? '?' + q : ''}`);
  },
  getRisk: (id) => API.get(`/api/risks/${id}`),
  createRisk: (data) => API.post('/api/risks', data),
  updateRisk: (id, data) => API.put(`/api/risks/${id}`, data),
  deleteRisk: (id) => API.del(`/api/risks/${id}`),
  addRiskNote: (id, data) => API.post(`/api/risks/${id}/notes`, data),
  deleteRiskNote: (id, noteId) => API.del(`/api/risks/${id}/notes/${noteId}`),

  // Scope Changes
  getScopeChanges: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''))
    ).toString();
    return API.get(`/api/scope-changes${q ? '?' + q : ''}`);
  },
  getScopeChange: (id) => API.get(`/api/scope-changes/${id}`),
  createScopeChange: (data) => API.post('/api/scope-changes', data),
  updateScopeChange: (id, data) => API.put(`/api/scope-changes/${id}`, data),
  submitScopeChange: (id) => API.post(`/api/scope-changes/${id}/submit`),
  pmcReviewSc: (id, data) => API.post(`/api/scope-changes/${id}/pmc-review`, data),
  clientReviewSc: (id, data) => API.post(`/api/scope-changes/${id}/client-review`, data),
  cancelScopeChange: (id) => API.post(`/api/scope-changes/${id}/cancel`),
  reopenScopeChange: (id) => API.post(`/api/scope-changes/${id}/reopen`),
  overrideSc: (id, data) => API.post(`/api/scope-changes/${id}/override`, data),
  getPendingScReviews: () => API.get('/api/scope-changes/pending-reviews'),
  getMyRejectedScs: () => API.get('/api/scope-changes/my-rejected'),
  getScHistory: (id) => API.get(`/api/scope-changes/${id}/history`),
  getScDashboard: () => API.get('/api/scope-changes/dashboard'),
  createOrderFromScs: (data) => API.post('/api/scope-changes/create-order', data),

  // Schedule Management
  getTasks: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/schedule/tasks${q ? '?' + q : ''}`);
  },
  getAllTasksForGantt: () => API.get('/api/schedule/tasks/all'),
  createTask: (data) => API.post('/api/schedule/tasks', data),
  updateTask: (id, data) => API.put(`/api/schedule/tasks/${id}`, data),
  deleteTask: (id) => API.del(`/api/schedule/tasks/${id}`),
  getProgressReports: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/schedule/progress-reports${q ? '?' + q : ''}`);
  },
  createProgressReport: (data) => API.post('/api/schedule/progress-reports', data),
  bulkProgressReport: (data) => API.post('/api/schedule/progress-reports/bulk', data),
  updateProgressReport: (id, data) => API.put(`/api/schedule/progress-reports/${id}`, data),
  submitProgressReport: (id) => API.post(`/api/schedule/progress-reports/${id}/submit`),
  pmcReviewPr: (id, data) => API.post(`/api/schedule/progress-reports/${id}/pmc-review`, data),
  clientReviewPr: (id, data) => API.post(`/api/schedule/progress-reports/${id}/client-review`, data),
  cancelProgressReport: (id) => API.post(`/api/schedule/progress-reports/${id}/cancel`),
  overridePr: (id, data) => API.post(`/api/schedule/progress-reports/${id}/override`, data),
  getPendingPrReviews: () => API.get('/api/schedule/pending-reviews'),
  getMyRejectedPrs: () => API.get('/api/schedule/my-rejected'),
  getMyPackagePermissions: () => API.get('/api/schedule/my-package-permissions'),
  getAllProgressReports: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== null && v !== undefined && v !== ''))).toString();
    return API.get(`/api/schedule/progress-reports${q ? '?' + q : ''}`);
  },
  getProgressReportHistory: (id) => API.get(`/api/schedule/progress-reports/${id}/history`),
  getScheduleDashboard: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/schedule/dashboard${q ? '?' + q : ''}`);
  },

  // Dashboard
  getDashboardSummary: (p = {}) => API.get('/api/dashboard/summary' + (p.meeting_type_id ? `?meeting_type_id=${p.meeting_type_id}` : '')),
  getMyPoints: (p = {}) => API.get('/api/dashboard/my-points' + (p.meeting_type_id ? `?meeting_type_id=${p.meeting_type_id}` : '')),
  getByResponsible: (p = {}) => API.get('/api/dashboard/by-responsible' + (p.meeting_type_id ? `?meeting_type_id=${p.meeting_type_id}` : '')),
  getUpcoming: (days = 14, p = {}) => API.get(`/api/dashboard/upcoming?days=${days}` + (p.meeting_type_id ? `&meeting_type_id=${p.meeting_type_id}` : '')),
  getMeetingsPerMonth: (p = {}) => API.get('/api/dashboard/meetings-per-month' + (p.meeting_type_id ? `?meeting_type_id=${p.meeting_type_id}` : '')),
  getPointsPerWeek: (p = {}) => API.get('/api/dashboard/points-per-week' + (p.meeting_type_id ? `?meeting_type_id=${p.meeting_type_id}` : '')),

  // Procurement
  getProcurementSteps: () => API.get('/api/procurement/steps'),
  createProcurementStep: (data) => API.post('/api/procurement/steps', data),
  updateProcurementStep: (id, data) => API.put(`/api/procurement/steps/${id}`, data),
  deleteProcurementStep: (id) => API.del(`/api/procurement/steps/${id}`),
  getContractTypes: () => API.get('/api/procurement/contract-types'),
  createContractType: (data) => API.post('/api/procurement/contract-types', data),
  updateContractType: (id, data) => API.put(`/api/procurement/contract-types/${id}`, data),
  deleteContractType: (id) => API.del(`/api/procurement/contract-types/${id}`),
  getSequenceStatus: () => API.get('/api/procurement/sequence-status'),
  validateSequence: () => API.post('/api/procurement/sequence-validate'),
  unvalidateSequence: () => API.post('/api/procurement/sequence-unvalidate'),
  getBidderUsers: () => API.get('/api/procurement/bidder-users'),
  getBiddingCompanies: () => API.get('/api/procurement/bidding-companies'),
  createBiddingCompany: (data) => API.post('/api/procurement/bidding-companies', data),
  updateBiddingCompany: (id, data) => API.put(`/api/procurement/bidding-companies/${id}`, data),
  deleteBiddingCompany: (id) => API.del(`/api/procurement/bidding-companies/${id}`),
  addBiddingCompanyContact: (id, userId) => API.post(`/api/procurement/bidding-companies/${id}/contacts`, { user_id: userId }),
  removeBiddingCompanyContact: (id, userId) => API.del(`/api/procurement/bidding-companies/${id}/contacts/${userId}`),
  setBiddingCompanyPackages: (id, packageIds) => API.put(`/api/procurement/bidding-companies/${id}/packages`, { package_ids: packageIds }),
  getProcurementPlans: () => API.get('/api/procurement/plans'),
  upsertPackagePlan: (packageId, data) => API.put(`/api/procurement/plans/${packageId}`, data),
  getRegister: () => API.get('/api/procurement/register'),
  updateRegisterEntry: (id, data) => API.put(`/api/procurement/register/${id}`, data),
  awardEntry: (id, data) => API.post(`/api/procurement/register/${id}/award`, data),
  createOrderFromAward: (id, data) => API.post(`/api/procurement/register/${id}/create-order`, data),
  getEntryEvents: (id) => API.get(`/api/procurement/register/${id}/events`),
  advanceStep: (id, data) => API.post(`/api/procurement/register/${id}/advance`, data),
  revertStep: (id, data) => API.post(`/api/procurement/register/${id}/revert`, data),
  getProcurementDashboard: (packageId = null) => API.get(`/api/procurement/dashboard${packageId ? '?package_id=' + packageId : ''}`),
  getMyProcurementEntries: () => API.get('/api/procurement/my-entries'),
  getMyPendingSubmittals: () => API.get('/api/procurement/my-pending-submittals'),
  acknowledgeSubmittal: (submittalId) => API.post(`/api/procurement/submittals/${submittalId}/acknowledge`),
  bidderUpdateEntry: (id, data) => API.post(`/api/procurement/entries/${id}/bidder-update`, data),

  // Export / Import helpers
  async downloadExport(path, filename) {
    const res = await fetch(this.base + path, { headers: this._buildFileHeaders() });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  async uploadImportPreview(path, file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(this.base + path, { method: 'POST', headers: this._buildFileHeaders(), body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Preview failed');
    return data;
  },

  // Documents export/import  (export file also serves as import template)
  exportDocuments: () => API.downloadExport('/api/export-import/documents/export', 'documents_export.xlsx'),
  previewDocumentsImport: (file) => API.uploadImportPreview('/api/export-import/documents/preview', file),
  applyDocumentsImport: (data) => API.post('/api/export-import/documents/apply', data),

  exportITP: () => API.downloadExport('/api/export-import/itp/export', 'itp_export.xlsx'),
  previewITPImport: (file) => API.uploadImportPreview('/api/export-import/itp/preview', file),
  applyITPImport: (data) => API.post('/api/export-import/itp/apply', data),

  // Tasks export/import  (export file also serves as import template)
  exportTasks: () => API.downloadExport('/api/export-import/tasks/export', 'tasks_export.xlsx'),
  previewTasksImport: (file) => API.uploadImportPreview('/api/export-import/tasks/preview', file),
  applyTasksImport: (data) => API.post('/api/export-import/tasks/apply', data),

  // Procurement Plans export/import  (export file also serves as import template)
  exportProcurementPlans: () => API.downloadExport('/api/export-import/procurement/export', 'procurement_plans_export.xlsx'),

  // Risk Register export/import
  exportRisks: () => API.downloadExport('/api/export-import/risks/export', 'risk_register_export.xlsx'),
  previewRisksImport: (file) => API.uploadImportPreview('/api/export-import/risks/preview', file),
  applyRisksImport: (data) => API.post('/api/export-import/risks/apply', data),

  exportWorkersSubs:        () => API.downloadExport('/api/export-import/workers-subs/export', 'workers_subcontractors_export.xlsx'),
  previewWorkersSubsImport: (file) => API.uploadImportPreview('/api/export-import/workers-subs/preview', file),
  applyWorkersSubsImport:   (data) => API.post('/api/export-import/workers-subs/apply', data),

  // Project Organization import/export (project owners only)
  exportContactsTemplate:    () => API.downloadExport('/api/export-import/contacts/export', 'contacts_import_template.xlsx'),
  previewContactsImport:     (file) => API.uploadImportPreview('/api/export-import/contacts/preview', file),
  applyContactsImport:       (data) => API.post('/api/export-import/contacts/apply', data),
  exportSubservicesTemplate: () => API.downloadExport('/api/export-import/subservices/export', 'subservices_import_template.xlsx'),
  previewSubservicesImport:  (file) => API.uploadImportPreview('/api/export-import/subservices/preview', file),
  applySubservicesImport:    (data) => API.post('/api/export-import/subservices/apply', data),
  exportAreasTemplate:       () => API.downloadExport('/api/export-import/areas/export', 'areas_import_template.xlsx'),
  previewAreasImport:        (file) => API.uploadImportPreview('/api/export-import/areas/preview', file),
  applyAreasImport:          (data) => API.post('/api/export-import/areas/apply', data),
  exportUnitsTemplate:       () => API.downloadExport('/api/export-import/units/export', 'units_import_template.xlsx'),
  previewUnitsImport:        (file) => API.uploadImportPreview('/api/export-import/units/preview', file),
  applyUnitsImport:          (data) => API.post('/api/export-import/units/apply', data),
  bulkDeleteSubservices:     (ids) => API.post('/api/subservices/bulk-delete', { ids }),

  // Construction — audit Excel exports (green button pattern, same as Risk)
  exportDailyReportsXlsx: () => API.download('/api/construction/daily-reports/export/excel', `daily_reports_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportBudgetOverviewXlsx: () => API.download('/api/budget/overview/export/excel', `budget_overview_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportSafetyObservationsXlsx: () => API.download('/api/safety/observations/export/excel', `safety_observations_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportSafetyIncidentsXlsx:    () => API.download('/api/safety/incidents/export/excel',    `safety_incidents_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportSafetyToolboxesXlsx:    () => API.download('/api/safety/toolboxes/export/excel',    `safety_toolboxes_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportAllFilesXlsx: (recordType) => {
    const qs = recordType ? '?record_type=' + encodeURIComponent(recordType) : '';
    return API.download('/api/attachments/all/export/excel' + qs, `files_${new Date().toISOString().split('T')[0]}.xlsx`);
  },
  exportFullProjectDatabaseXlsx: (projectNumber) => {
    const safe = (projectNumber || 'project').replace(/[^A-Za-z0-9_-]/g, '_');
    return API.download(
      '/api/projects/full-database/export/excel',
      `${safe}_full_database_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  },
  exportWorkLogsXlsx:     () => API.download('/api/construction/work-logs/export/excel',     `work_logs_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportWorkersSubsXlsx:  () => API.download('/api/construction/workers-subs/export/excel',  `workers_subcontractors_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportWorkPermitsXlsx:  () => API.download('/api/construction/work-permits/export/excel',  `work_permits_${new Date().toISOString().split('T')[0]}.xlsx`),
  exportLotosXlsx:        () => API.download('/api/construction/lotos/export/excel',         `lotos_${new Date().toISOString().split('T')[0]}.xlsx`),

  // Invoice import
  exportInvoicesTemplate: () => API.downloadExport('/api/export-import/invoices/export', 'invoices_import_template.xlsx'),
  previewInvoicesImport: (file) => API.uploadImportPreview('/api/export-import/invoices/preview', file),
  applyInvoicesImport: (data) => API.post('/api/export-import/invoices/apply', data),
  previewProcurementImport: (file) => API.uploadImportPreview('/api/export-import/procurement/preview', file),
  applyProcurementImport: (data) => API.post('/api/export-import/procurement/apply', data),

  // Quality Control — ITP
  getITPTestTypes: () => API.get('/api/qc/test-types'),
  createITPTestType: (data) => API.post('/api/qc/test-types', data),
  updateITPTestType: (id, data) => API.put(`/api/qc/test-types/${id}`, data),
  deleteITPTestType: (id) => API.del(`/api/qc/test-types/${id}`),
  getITPWitnessLevels: () => API.get('/api/qc/witness-levels'),
  createITPWitnessLevel: (data) => API.post('/api/qc/witness-levels', data),
  updateITPWitnessLevel: (id, data) => API.put(`/api/qc/witness-levels/${id}`, data),
  deleteITPWitnessLevel: (id) => API.del(`/api/qc/witness-levels/${id}`),
  listITP: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/qc/itp${q ? '?' + q : ''}`);
  },
  createITP: (data) => API.post('/api/qc/itp', data),
  getITP: (id) => API.get(`/api/qc/itp/${id}`),
  updateITP: (id, data) => API.put(`/api/qc/itp/${id}`, data),
  deleteITP: (id) => API.del(`/api/qc/itp/${id}`),
  planITP: (id) => API.post(`/api/qc/itp/${id}/plan`),
  executeITP: (id, data) => API.post(`/api/qc/itp/${id}/execute`, data),
  reviewITP: (id, data) => API.post(`/api/qc/itp/${id}/review`, data),
  getITPDashboard: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/qc/dashboard${q ? '?' + q : ''}`);
  },
  getITPApprovals: () => API.get('/api/qc/approvals'),
  overrideITPReview: (itpId, data) => API.post(`/api/qc/itp/${itpId}/override-review`, data),
  getMyPendingITPReviews: () => API.get('/api/qc/my-pending-reviews'),
  getMyRejectedITPs: () => API.get('/api/qc/my-rejected-itps'),
  resubmitITP: (itpId) => API.post(`/api/qc/itp/${itpId}/resubmit`, {}),
  getITPHistory: (itpId) => API.get(`/api/qc/itp/${itpId}/history`),

  // Quality Control — Obligation Times
  getObligationTimes: () => API.get('/api/qc/obligation-times'),
  createObligationTime: (data) => API.post('/api/qc/obligation-times', data),
  updateObligationTime: (id, data) => API.put(`/api/qc/obligation-times/${id}`, data),
  deleteObligationTime: (id) => API.del(`/api/qc/obligation-times/${id}`),

  // Quality Control — Punchlist
  listPunches: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/qc/punches${q ? '?' + q : ''}`);
  },
  createPunch: (data) => API.post('/api/qc/punches', data),
  getPunch: (id) => API.get(`/api/qc/punches/${id}`),
  updatePunch: (id, data) => API.put(`/api/qc/punches/${id}`, data),
  submitPunchDraft: (id) => API.post(`/api/qc/punches/${id}/submit`, {}),
  deletePunch: (id) => API.del(`/api/qc/punches/${id}`),
  respondPunch: (id, data) => API.post(`/api/qc/punches/${id}/respond`, data),
  reviewPunch: (id, data) => API.post(`/api/qc/punches/${id}/review`, data),
  overridePunchStatus: (id, data) => API.post(`/api/qc/punches/${id}/override`, data),
  getPunchDashboard: (params = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))).toString();
    return API.get(`/api/qc/punch-dashboard${q ? '?' + q : ''}`);
  },
  getMyOpenPunches: () => API.get('/api/qc/my-open-punches'),
  getMyReviewPunches: () => API.get('/api/qc/my-review-punches'),

  // Quality Control — ITP Notes
  listITPNotes: (itpId) => API.get(`/api/qc/itp/${itpId}/notes`),
  addITPNote: (itpId, data) => API.post(`/api/qc/itp/${itpId}/notes`, data),
  deleteITPNote: (itpId, noteId) => API.del(`/api/qc/itp/${itpId}/notes/${noteId}`),

  // Quality Control — Punch Notes
  listPunchNotes: (punchId) => API.get(`/api/qc/punches/${punchId}/notes`),
  addPunchNote: (punchId, data) => API.post(`/api/qc/punches/${punchId}/notes`, data),
  deletePunchNote: (punchId, noteId) => API.del(`/api/qc/punches/${punchId}/notes/${noteId}`),

  // Organization Chart (isolated module)
  getOrgChartLinks: () => API.get('/api/org-chart/links'),
  createOrgChartLink: (data) => API.post('/api/org-chart/links', data),
  updateOrgChartLink: (id, data) => API.put(`/api/org-chart/links/${id}`, data),
  deleteOrgChartLink: (id) => API.del(`/api/org-chart/links/${id}`),
};
