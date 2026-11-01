import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Mail, 
  Search, 
  Settings, 
  FolderLock, 
  RefreshCw, 
  PlusCircle, 
  ExternalLink, 
  X, 
  Trash2, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  BookOpen,
  Eye,
  Download,
  FileText,
  Square,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Paperclip,
  Calendar,
  Inbox,
  Send
} from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000";

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'search' | 'settings'>('dashboard');
  const [health, setHealth] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTriggerId, setActiveTriggerId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Email Viewer Modal State
  const [viewingEmail, setViewingEmail] = useState<any | null>(null);
  const [loadingEmailView, setLoadingEmailView] = useState(false);

  // Search & Restore Tab Sub-view ('gmail' | 'drive')
  const [searchSubTab, setSearchSubTab] = useState<'gmail' | 'drive'>('gmail');
  const [folderFilter, setFolderFilter] = useState<'all' | 'inbox' | 'sent'>('all');
  const [hasAttachmentsOnly, setHasAttachmentsOnly] = useState(false);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [loadingDriveTree, setLoadingDriveTree] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Account schedule profile states
  const [accountProfiles, setAccountProfiles] = useState<Record<string, any>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  // PWA Install Prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Auto clear toast after 4 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // 1-Click Connect Modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [connectError, setConnectError] = useState('');

  useEffect(() => {
    refreshAll();
    const interval = setInterval(() => {
      fetchJobs();
      fetchAccounts();
    }, 3000);

    // Listen for PWA beforeinstallprompt event
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setToastMessage({
        type: 'success',
        text: 'Aplikasi berhasil di-install ke desktop!'
      });
    }
    setDeferredPrompt(null);
  };

  const refreshAll = () => {
    fetchHealth();
    fetchAccounts();
    fetchJobs();
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) setHealth(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/accounts`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        // Fetch profiles for each account
        data.forEach((acc: any) => {
          fetchAccountProfile(acc.id);
        });
        // If we were waiting for an authorization and we see active accounts, close modal
        if (isAuthorizing && data.length > 0) {
          setIsAuthorizing(false);
          setShowConnectModal(false);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  // 1-Click Google OAuth Trigger
  const startOneClickGoogleAuth = async () => {
    if (!customClientId.trim()) {
      setConnectError('Masukkan Google Cloud Client ID terlebih dahulu.');
      return;
    }
    if (!customClientSecret.trim()) {
      setConnectError('Masukkan Google Cloud Client Secret terlebih dahulu.');
      return;
    }
    setConnectError('');
    setIsAuthorizing(true);
    try {
      const url = `${API_BASE}/api/accounts/login-url?client_id=${encodeURIComponent(customClientId.trim())}&client_secret=${encodeURIComponent(customClientSecret.trim())}`;

      const res = await fetch(url);
      if (!res.ok) {
        let errorMsg = "Failed to start Google sign-in";
        try {
          const errJson = await res.json();
          errorMsg = errJson.detail || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status})`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      // Directly open user's active browser to Google sign-in
      window.open(data.url, '_blank');
    } catch (err: any) {
      setConnectError(err.message || 'Connection to backend failed');
      setIsAuthorizing(false);
    }
  };

  const triggerBackup = async (accountId: string, service: 'gmail' | 'drive') => {
    try {
      setLoading(true);
      setActiveTriggerId(`${accountId}_${service}`);
      setToastMessage({
        type: 'info',
        text: `Memulai backup ${service === 'gmail' ? 'Gmail' : 'Google Drive'}... Mengarahkan ke halaman proses...`
      });

      const res = await fetch(`${API_BASE}/api/jobs/trigger?account_id=${accountId}&service=${service}`, {
        method: 'POST'
      });

      if (!res.ok) {
        let errDesc = "Gagal memulai tugas backup";
        try {
          const errData = await res.json();
          errDesc = errData.detail || errDesc;
        } catch {}
        throw new Error(errDesc);
      }

      await fetchJobs();
      
      setToastMessage({
        type: 'success',
        text: `Tugas backup ${service.toUpperCase()} berhasil dibuat dan sedang berjalan di latar belakang!`
      });

      // Otomatis pindah ke tab Dashboard untuk melihat live progress
      setTimeout(() => {
        setActiveTab('dashboard');
      }, 700);

    } catch (e: any) {
      setToastMessage({
        type: 'error',
        text: `Error: ${e.message || e}`
      });
    } finally {
      setLoading(false);
      setActiveTriggerId(null);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    if (!window.confirm("Disconnect this account? Previous backup archives will be safely retained.")) return;
    try {
      await fetch(`${API_BASE}/api/accounts/${accountId}`, { method: 'DELETE' });
      fetchAccounts();
    } catch (e) {
      alert("Error disconnecting account: " + e);
    }
  };

  const stopJob = async (jobId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}/stop`, { method: 'POST' });
      if (res.ok) {
        setToastMessage({
          type: 'info',
          text: 'Proses backup berhasil dihentikan (Stopped).'
        });
        fetchJobs();
      } else {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to stop job');
      }
    } catch (e: any) {
      setToastMessage({
        type: 'error',
        text: `Gagal menghentikan job: ${e.message || e}`
      });
    }
  };

  const fetchAccountProfile = async (accountId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${accountId}/profile`);
      if (res.ok) {
        const data = await res.json();
        setAccountProfiles(prev => ({ ...prev, [accountId]: data }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateAccountInterval = async (accountId: string, interval: string) => {
    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${accountId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_interval: interval })
      });
      if (res.ok) {
        setAccountProfiles(prev => ({
          ...prev,
          [accountId]: { ...prev[accountId], schedule_interval: interval }
        }));
        setToastMessage({
          type: 'success',
          text: `Jadwal auto-backup berhasil diubah ke: ${interval.toUpperCase()}`
        });
      }
    } catch (e: any) {
      setToastMessage({
        type: 'error',
        text: `Gagal mengubah interval: ${e.message || e}`
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const executeSearch = async () => {
    // Allows searching with keywords OR date filters OR attachment toggle OR folder filter
    if (!searchQuery.trim() && !startDateFilter && !endDateFilter && !hasAttachmentsOnly && folderFilter === 'all') {
      setToastMessage({
        type: 'info',
        text: 'Masukkan kata kunci atau pilih filter untuk memulai pencarian.'
      });
      return;
    }
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      if (folderFilter !== 'all') params.append('folder_type', folderFilter);
      if (hasAttachmentsOnly) params.append('has_attachments_only', 'true');
      if (startDateFilter) params.append('start_date', startDateFilter);
      if (endDateFilter) params.append('end_date', endDateFilter);

      const res = await fetch(`${API_BASE}/api/search/gmail?${params.toString()}`);
      if (res.ok) setSearchResults(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDriveTree = async () => {
    setLoadingDriveTree(true);
    try {
      const res = await fetch(`${API_BASE}/api/search/drive/tree`);
      if (res.ok) {
        const data = await res.json();
        setDriveFiles(data);
        // Expand root/top folders by default
        const initialExpanded: Record<string, boolean> = {};
        data.filter((f: any) => f.is_folder).forEach((f: any) => {
          initialExpanded[f.id] = true;
        });
        setExpandedFolders(initialExpanded);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDriveTree(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const openEmailViewer = async (messageId: string) => {
    setLoadingEmailView(true);
    try {
      const res = await fetch(`${API_BASE}/api/search/gmail/${messageId}/view`);
      if (!res.ok) throw new Error("Failed to load message content");
      const data = await res.json();
      setViewingEmail(data);
    } catch (e: any) {
      setToastMessage({
        type: 'error',
        text: `Cannot view email: ${e.message || e}`
      });
    } finally {
      setLoadingEmailView(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#090d16', color: '#ffffff' }}>
      
      {/* Sidebar */}
      <aside style={{ 
        width: 270, 
        backgroundColor: '#111827', 
        borderRight: '1px solid #1f2937', 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '24px 16px'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36, paddingLeft: 8 }}>
          <div style={{ 
            backgroundColor: '#0284c7', 
            padding: 8, 
            borderRadius: 8, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(2, 132, 199, 0.4)'
          }}>
            <FolderLock size={22} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
            GWS Backup
          </h2>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: ShieldCheck },
            { id: 'accounts', label: 'Google Accounts', icon: Mail },
            { id: 'search', label: 'Search & Restore', icon: Search },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: isSelected ? '1px solid #38bdf8' : '1px solid transparent',
                  backgroundColor: isSelected ? '#0369a1' : 'transparent',
                  color: isSelected ? '#ffffff' : '#e2e8f0',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: isSelected ? 700 : 500,
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={18} color={isSelected ? '#ffffff' : '#93c5fd'} />
                {item.label}
              </button>
            );
          })}

          {/* PWA Install Button (if available in browser) */}
          {isInstallable && (
            <button
              onClick={handleInstallApp}
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #0284c7',
                backgroundColor: 'rgba(2, 132, 199, 0.15)',
                color: '#38bdf8',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.2)'
              }}
            >
              <Download size={16} color="#38bdf8" />
              <span>Install Desktop App</span>
            </button>
          )}
        </nav>

        {/* Backend health status */}
        <div style={{ 
          padding: '12px 14px', 
          backgroundColor: '#030712', 
          borderRadius: 8, 
          fontSize: 12, 
          border: '1px solid #1f2937',
          color: '#f3f4f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ 
                width: 9, 
                height: 9, 
                borderRadius: '50%', 
                backgroundColor: health?.status === 'healthy' ? '#22c55e' : '#ef4444',
                boxShadow: health?.status === 'healthy' ? '0 0 8px #22c55e' : '0 0 8px #ef4444'
              }} />
              <span style={{ fontWeight: 600 }}>
                {health?.status === 'healthy' ? `Backend Online (v${health.version})` : 'Backend Offline'}
              </span>
            </div>
            <button 
              onClick={refreshAll} 
              title="Refresh"
              style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0 }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '36px 44px', backgroundColor: '#090d16', position: 'relative' }}>
        
        {/* Floating Toast Notification */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            top: 24,
            right: 32,
            zIndex: 2000,
            padding: '14px 20px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            border: toastMessage.type === 'success' ? '1px solid #10b981' : toastMessage.type === 'error' ? '1px solid #ef4444' : '1px solid #0284c7',
            backgroundColor: toastMessage.type === 'success' ? '#064e3b' : toastMessage.type === 'error' ? '#7f1d1d' : '#0c4a6e',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {toastMessage.type === 'success' && <CheckCircle size={18} color="#34d399" />}
            {toastMessage.type === 'error' && <AlertCircle size={18} color="#f87171" />}
            {toastMessage.type === 'info' && <RefreshCw size={18} color="#38bdf8" className="spin" />}
            <span>{toastMessage.text}</span>
          </div>
        )}
        
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ marginBottom: 28, borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
                System Dashboard
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>
                Overview of connected Google accounts, automated workers, and durable encrypted backups.
              </p>
            </div>
            
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 36 }}>
              <div style={{ 
                backgroundColor: '#111827', 
                padding: '24px 20px', 
                borderRadius: 12, 
                border: '1px solid #374151',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Connected Accounts</span>
                <p style={{ fontSize: 34, fontWeight: 800, marginTop: 10, margin: 0, color: '#38bdf8' }}>{accounts.length}</p>
              </div>

              <div style={{ 
                backgroundColor: '#111827', 
                padding: '24px 20px', 
                borderRadius: 12, 
                border: '1px solid #374151',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Active Background Tasks</span>
                <p style={{ fontSize: 34, fontWeight: 800, marginTop: 10, margin: 0, color: '#4ade80' }}>
                  {jobs.filter(j => j.status === 'running' || j.status === 'queued').length}
                </p>
              </div>

              <div style={{ 
                backgroundColor: '#111827', 
                padding: '24px 20px', 
                borderRadius: 12, 
                border: '1px solid #374151',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Encrypted Storage Root</span>
                <p style={{ fontSize: 13, color: '#f8fafc', marginTop: 12, margin: 0, wordBreak: 'break-all', fontFamily: 'monospace', backgroundColor: '#030712', padding: '8px 10px', borderRadius: 6, border: '1px solid #1f2937' }}>
                  {health?.storage_dir || 'Loading...'}
                </p>
              </div>
            </div>

            {/* Live Progress Table */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#ffffff' }}>Live Backup Progress</h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Auto-refreshing every 3s</span>
            </div>

            <div style={{ backgroundColor: '#111827', borderRadius: 12, border: '1px solid #374151', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                <thead>
                  <tr style={{ backgroundColor: '#1f2937', color: '#f8fafc', borderBottom: '2px solid #374151' }}>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>Job ID</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>Service</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>Items</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>Processed Data</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>Transfer Rate / ETA</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                        No backup tasks recorded yet. Click "Backup Now" on the Accounts page to run one.
                      </td>
                    </tr>
                  ) : (
                    jobs.map(job => {
                      // Calculate Transfer Rate & ETA
                      let transferRateStr = '-';
                      let etaStr = '';
                      if (job.status === 'running' && job.started_at) {
                        const elapsedSec = Math.max(1, (new Date().getTime() - new Date(job.started_at).getTime()) / 1000);
                        const mbps = (job.bytes_processed / (1024 * 1024)) / elapsedSec;
                        transferRateStr = `${mbps.toFixed(2)} MB/s`;

                        if (job.items_total > job.items_processed && job.items_processed > 0) {
                          const itemsRemaining = job.items_total - job.items_processed;
                          const secPerItem = elapsedSec / job.items_processed;
                          const etaSeconds = Math.round(itemsRemaining * secPerItem);
                          if (etaSeconds < 60) {
                            etaStr = `~${etaSeconds}s remaining`;
                          } else {
                            etaStr = `~${Math.round(etaSeconds / 60)}m remaining`;
                          }
                        }
                      }

                      return (
                        <tr key={job.id} style={{ borderTop: '1px solid #1f2937' }}>
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: 13, color: '#93c5fd' }}>
                            {job.id.slice(0, 8)}...
                          </td>
                          <td style={{ padding: '14px 16px', textTransform: 'capitalize', fontWeight: 600, color: '#ffffff' }}>
                            {job.service}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              backgroundColor: job.status === 'completed' ? '#065f46' : job.status === 'running' ? '#0369a1' : job.status === 'stopped' ? '#854d0e' : '#374151',
                              color: '#ffffff',
                              border: job.status === 'completed' ? '1px solid #059669' : job.status === 'running' ? '1px solid #0284c7' : job.status === 'stopped' ? '1px solid #eab308' : '1px solid #4b5563'
                            }}>
                              {job.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: '#f8fafc' }}>
                            {job.items_processed} / {job.items_total}
                          </td>
                          <td style={{ padding: '14px 16px', color: '#38bdf8', fontWeight: 600 }}>
                            {(job.bytes_processed / (1024 * 1024)).toFixed(2)} MB
                          </td>
                          <td style={{ padding: '14px 16px', fontSize: 13 }}>
                            {job.status === 'running' ? (
                              <div>
                                <span style={{ color: '#4ade80', fontWeight: 700 }}>{transferRateStr}</span>
                                {etaStr && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{etaStr}</div>}
                              </div>
                            ) : (
                              <span style={{ color: '#6b7280' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            {(job.status === 'running' || job.status === 'queued') && (
                              <button
                                onClick={() => stopJob(job.id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '6px 12px',
                                  backgroundColor: '#991b1b',
                                  color: '#ffffff',
                                  border: '1px solid #dc2626',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <Square size={12} fill="#ffffff" />
                                <span>Stop</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: ACCOUNTS */}
        {activeTab === 'accounts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
                  Google Accounts
                </h1>
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>
                  Connect multiple Gmail and Google Drive accounts securely with 1-Click Browser Login.
                </p>
              </div>
              <button 
                onClick={() => { setConnectError(''); setIsAuthorizing(false); setShowConnectModal(true); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 22px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
                }}
              >
                <PlusCircle size={18} />
                Connect Google Account
              </button>
            </div>

            {accounts.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', backgroundColor: '#111827', borderRadius: 12, border: '1px solid #374151' }}>
                <Mail size={56} color="#60a5fa" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: '#ffffff' }}>No Accounts Connected Yet</h3>
                <p style={{ color: '#cbd5e1', fontSize: 14, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>
                  Click below to sign in with your active browser Gmail. Tokens are stored securely in your OS Keyring without exposing credentials.
                </p>
                <button 
                  onClick={() => { setConnectError(''); setIsAuthorizing(false); setShowConnectModal(true); }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 28px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(2, 132, 199, 0.4)'
                  }}
                >
                  <Mail size={20} />
                  <span>Connect with Google</span>
                </button>
              </div>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} style={{ 
                  backgroundColor: '#111827', 
                  borderRadius: 14, 
                  border: '1px solid #1f2937', 
                  padding: 24, 
                  marginBottom: 20,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
                }}>
                  {/* Top Row: Account Profile Info & Action Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    {/* Left: User Identity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 260 }}>
                      {acc.avatar_url ? (
                        <img 
                          src={acc.avatar_url} 
                          alt="avatar" 
                          style={{ width: 50, height: 50, borderRadius: '50%', border: '2px solid #0284c7', objectFit: 'cover' }} 
                        />
                      ) : (
                        <div style={{ width: 50, height: 50, borderRadius: '50%', backgroundColor: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#ffffff' }}>
                          {acc.email.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#ffffff' }}>
                            {acc.display_name || acc.email}
                          </h3>
                          <span style={{ 
                            fontSize: 11, 
                            fontWeight: 700, 
                            color: '#4ade80', 
                            backgroundColor: 'rgba(74, 222, 128, 0.15)', 
                            border: '1px solid rgba(74, 222, 128, 0.3)',
                            padding: '2px 8px', 
                            borderRadius: 12 
                          }}>
                            CONNECTED
                          </span>
                        </div>
                        <p style={{ fontSize: 14, color: '#93c5fd', marginTop: 4, margin: 0, fontWeight: 500 }}>
                          {acc.email}
                        </p>
                      </div>
                    </div>

                    {/* Right: Trigger Backup Buttons & Disconnect */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <button 
                        disabled={loading}
                        onClick={() => triggerBackup(acc.id, 'gmail')}
                        style={{ 
                          padding: '10px 18px', 
                          borderRadius: 8, 
                          border: 'none', 
                          backgroundColor: activeTriggerId === `${acc.id}_gmail` ? '#0369a1' : '#0284c7', 
                          color: '#ffffff', 
                          cursor: loading ? 'not-allowed' : 'pointer', 
                          fontWeight: 700,
                          fontSize: 14,
                          boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          opacity: loading && activeTriggerId !== `${acc.id}_gmail` ? 0.6 : 1
                        }}
                      >
                        {activeTriggerId === `${acc.id}_gmail` ? (
                          <>
                            <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span>Memproses...</span>
                          </>
                        ) : (
                          <>
                            <Mail size={16} />
                            <span>Backup Gmail Now</span>
                          </>
                        )}
                      </button>
                      <button 
                        disabled={loading}
                        onClick={() => triggerBackup(acc.id, 'drive')}
                        style={{ 
                          padding: '10px 18px', 
                          borderRadius: 8, 
                          border: 'none', 
                          backgroundColor: activeTriggerId === `${acc.id}_drive` ? '#047857' : '#059669', 
                          color: '#ffffff', 
                          cursor: loading ? 'not-allowed' : 'pointer', 
                          fontWeight: 700,
                          fontSize: 14,
                          boxShadow: '0 2px 8px rgba(5, 150, 105, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          opacity: loading && activeTriggerId !== `${acc.id}_drive` ? 0.6 : 1
                        }}
                      >
                        {activeTriggerId === `${acc.id}_drive` ? (
                          <>
                            <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span>Memproses...</span>
                          </>
                        ) : (
                          <>
                            <HardDrive size={16} />
                            <span>Backup Drive Now</span>
                          </>
                        )}
                      </button>
                      <button 
                        onClick={() => disconnectAccount(acc.id)}
                        title="Disconnect Account"
                        style={{
                          background: 'none',
                          border: '1px solid #374151',
                          borderRadius: 8,
                          padding: '10px 12px',
                          cursor: 'pointer',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Row: Auto-backup Schedule Interval Bar */}
                  <div style={{ 
                    marginTop: 18, 
                    paddingTop: 16, 
                    borderTop: '1px solid #1f2937', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#cbd5e1' }}>
                      <div style={{ 
                        width: 28, 
                        height: 28, 
                        borderRadius: 6, 
                        backgroundColor: '#0f172a', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        border: '1px solid #334155'
                      }}>
                        <RefreshCw size={14} color="#38bdf8" />
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: '#f8fafc' }}>Jadwal Auto-Backup Latar Belakang:</span>
                        <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 12 }}>
                          (Secara otomatis memeriksa & mengunduh data baru tanpa membuka aplikasi)
                        </span>
                      </div>
                    </div>

                    <select
                      value={accountProfiles[acc.id]?.schedule_interval || 'daily'}
                      disabled={savingProfile}
                      onChange={(e) => updateAccountInterval(acc.id, e.target.value)}
                      style={{
                        backgroundColor: '#0b1329',
                        border: '1px solid #0284c7',
                        borderRadius: 8,
                        padding: '8px 16px',
                        color: '#38bdf8',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        outline: 'none',
                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.2)'
                      }}
                    >
                      <option value="5m">Setiap 5 Menit</option>
                      <option value="15m">Setiap 15 Menit</option>
                      <option value="30m">Setiap 30 Menit</option>
                      <option value="1h">Setiap 1 Jam</option>
                      <option value="6h">Setiap 6 Jam</option>
                      <option value="daily">Harian (Setiap 24 Jam)</option>
                      <option value="manual">Manual Saja (Matikan Auto)</option>
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: SEARCH & RESTORE */}
        {activeTab === 'search' && (
          <div>
            <div style={{ marginBottom: 28, borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
                Search & Restore
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>
                Search backed-up emails and inspect your downloaded Google Drive folder tree structure.
              </p>
            </div>

            {/* Sub-navigation tabs: Gmail vs Google Drive Tree */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid #374151', paddingBottom: 12 }}>
              <button
                onClick={() => setSearchSubTab('gmail')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: searchSubTab === 'gmail' ? '#0284c7' : '#1f2937',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                <Mail size={16} />
                <span>Gmail Backups</span>
              </button>
              <button
                onClick={() => {
                  setSearchSubTab('drive');
                  fetchDriveTree();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: searchSubTab === 'drive' ? '#0284c7' : '#1f2937',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                <HardDrive size={16} />
                <span>Google Drive Tree ({driveFiles.length} items)</span>
              </button>
            </div>

            {searchSubTab === 'gmail' && (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <input
                    type="text"
                    placeholder="Cari berdasarkan subjek, pengirim, penerima (opsional jika menggunakan filter tanggal)..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && executeSearch()}
                    style={{ 
                      flex: 1, 
                      padding: '14px 18px', 
                      borderRadius: 8, 
                      border: '1px solid #4b5563', 
                      backgroundColor: '#111827', 
                      color: '#ffffff', 
                      fontSize: 15,
                      outline: 'none'
                    }}
                  />
                  <button 
                    onClick={executeSearch}
                    style={{ 
                      padding: '0 28px', 
                      borderRadius: 8, 
                      border: 'none', 
                      backgroundColor: '#0284c7', 
                      color: '#ffffff', 
                      fontWeight: 700, 
                      fontSize: 14,
                      cursor: 'pointer' 
                    }}
                  >
                    Search Backups
                  </button>
                </div>

                {/* Filter Options */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, marginBottom: 20, padding: '14px 18px', backgroundColor: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
                  {/* Folder Type Tabs / Filter: All, Inbox, Sent */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: '#111827', padding: '3px', borderRadius: 6, border: '1px solid #374151' }}>
                    <button
                      onClick={() => setFolderFilter('all')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: 'none',
                        backgroundColor: folderFilter === 'all' ? '#0284c7' : 'transparent',
                        color: folderFilter === 'all' ? '#ffffff' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setFolderFilter('inbox')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: 'none',
                        backgroundColor: folderFilter === 'inbox' ? '#0369a1' : 'transparent',
                        color: folderFilter === 'inbox' ? '#ffffff' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Inbox size={13} />
                      <span>Inbox</span>
                    </button>
                    <button
                      onClick={() => setFolderFilter('sent')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 4,
                        border: 'none',
                        backgroundColor: folderFilter === 'sent' ? '#047857' : 'transparent',
                        color: folderFilter === 'sent' ? '#ffffff' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Send size={13} />
                      <span>Sent</span>
                    </button>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#bae6fd', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={hasAttachmentsOnly}
                      onChange={(e) => setHasAttachmentsOnly(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: '#0284c7', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Paperclip size={15} color="#38bdf8" />
                      <span>Hanya dengan lampiran</span>
                    </div>
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>
                    <Calendar size={15} color="#38bdf8" />
                    <span>Dari Tanggal:</span>
                    <input
                      type="date"
                      value={startDateFilter}
                      onChange={(e) => setStartDateFilter(e.target.value)}
                      style={{
                        backgroundColor: '#111827',
                        border: '1px solid #4b5563',
                        borderRadius: 6,
                        padding: '6px 10px',
                        color: '#ffffff',
                        fontSize: 13,
                        fontWeight: 600,
                        outline: 'none',
                        colorScheme: 'dark',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>
                    <Calendar size={15} color="#38bdf8" />
                    <span>Sampai Tanggal:</span>
                    <input
                      type="date"
                      value={endDateFilter}
                      onChange={(e) => setEndDateFilter(e.target.value)}
                      style={{
                        backgroundColor: '#111827',
                        border: '1px solid #4b5563',
                        borderRadius: 6,
                        padding: '6px 10px',
                        color: '#ffffff',
                        fontSize: 13,
                        fontWeight: 600,
                        outline: 'none',
                        colorScheme: 'dark',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {(startDateFilter || endDateFilter || hasAttachmentsOnly || folderFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setStartDateFilter('');
                        setEndDateFilter('');
                        setHasAttachmentsOnly(false);
                        setFolderFilter('all');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f87171',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>

                <div style={{ backgroundColor: '#111827', borderRadius: 12, border: '1px solid #374151', padding: 24 }}>
                  {searchResults.length === 0 ? (
                    <p style={{ color: '#cbd5e1', textAlign: 'center', margin: '24px 0', fontSize: 14 }}>
                      Masukkan kata kunci pencarian atau pilih tanggal di atas untuk melihat pesan dan lampiran yang dicadangkan.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {searchResults.map(msg => (
                        <div key={msg.id} style={{ 
                          padding: 18, 
                          backgroundColor: '#030712', 
                          borderRadius: 8, 
                          border: '1px solid #334155',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 16
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', minWidth: 0 }}>
                                {msg.labels && msg.labels.includes('SENT') ? (
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    backgroundColor: '#065f46',
                                    color: '#34d399',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                    border: '1px solid #059669'
                                  }}>
                                    <Send size={11} />
                                    <span>SENT</span>
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    backgroundColor: '#0369a1',
                                    color: '#bae6fd',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                    border: '1px solid #0284c7'
                                  }}>
                                    <Inbox size={11} />
                                    <span>INBOX</span>
                                  </span>
                                )}

                                <span style={{ fontWeight: 800, fontSize: 16, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {msg.subject || '(No Subject)'}
                                </span>
                              </div>
                              <span style={{ fontSize: 13, color: '#38bdf8', fontWeight: 700, marginLeft: 12, flexShrink: 0 }}>
                                {new Date(msg.internal_date).toLocaleDateString()}
                              </span>
                            </div>
                            <div style={{ fontSize: 14, color: '#f1f5f9', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#94a3b8', fontWeight: 600 }}>From:</span> <span style={{ color: '#ffffff', fontWeight: 700 }}>{msg.sender}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6 }}>
                              <span style={{ color: '#94a3b8', fontWeight: 600 }}>Path:</span> <code style={{ color: '#7dd3fc', backgroundColor: '#0f172a', padding: '3px 8px', borderRadius: 4, border: '1px solid #1e293b' }}>{msg.storage_path}</code>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                            <button
                              onClick={() => openEmailViewer(msg.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '9px 16px',
                                backgroundColor: '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
                              }}
                            >
                              <Eye size={16} />
                              <span>View Email</span>
                            </button>
                            <a
                              href={`${API_BASE}/api/search/gmail/${msg.id}/raw`}
                              download
                              title="Download raw .eml file"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '9px 14px',
                                backgroundColor: '#1e293b',
                                color: '#38bdf8',
                                border: '1px solid #38bdf8',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 700,
                                textDecoration: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              <Download size={16} />
                              <span>.eml</span>
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {searchSubTab === 'drive' && (
              <div style={{ backgroundColor: '#111827', borderRadius: 12, border: '1px solid #374151', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={20} color="#38bdf8" />
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#ffffff' }}>
                      Downloaded Google Drive Hierarchy
                    </span>
                  </div>
                  <button
                    onClick={fetchDriveTree}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      borderRadius: 6,
                      backgroundColor: '#1f2937',
                      color: '#93c5fd',
                      border: '1px solid #374151',
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={14} />
                    <span>Refresh Tree</span>
                  </button>
                </div>

                {loadingDriveTree ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Loading folder hierarchy...</p>
                ) : driveFiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <FolderLock size={40} color="#6b7280" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>No Drive Files Backed Up Yet</p>
                    <p style={{ fontSize: 13, margin: '8px 0 0 0' }}>Click "Backup Drive Now" on the Google Accounts tab to start archiving Drive files.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(() => {
                      // Organize files into map by parent_id
                      const childrenMap = new Map<string | null, any[]>();
                      driveFiles.forEach(f => {
                        const pid = f.parent_id || null;
                        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
                        childrenMap.get(pid)!.push(f);
                      });

                      // Find root elements: parent_id is null or not in driveFiles
                      const allIds = new Set(driveFiles.map(f => f.id));
                      const rootItems = driveFiles.filter(f => !f.parent_id || !allIds.has(f.parent_id));

                      const renderTreeItem = (item: any, depth: number = 0): React.ReactNode => {
                        const isFolder = item.is_folder;
                        const hasChildren = (childrenMap.get(item.id) || []).length > 0;
                        const isExpanded = !!expandedFolders[item.id];

                        return (
                          <div key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              paddingLeft: 12 + depth * 24,
                              borderRadius: 6,
                              backgroundColor: depth % 2 === 0 ? '#0f172a' : '#111827',
                              border: '1px solid #1e293b',
                              margin: '2px 0'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                {isFolder ? (
                                  <button
                                    onClick={() => toggleFolder(item.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      padding: 0,
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    {isExpanded ? <ChevronDown size={16} color="#38bdf8" /> : <ChevronRight size={16} color="#94a3b8" />}
                                  </button>
                                ) : (
                                  <div style={{ width: 16 }} />
                                )}

                                {isFolder ? (
                                  <Folder size={18} color="#facc15" />
                                ) : (
                                  <File size={16} color="#38bdf8" />
                                )}

                                <span style={{
                                  fontWeight: isFolder ? 700 : 600,
                                  color: isFolder ? '#ffffff' : '#f8fafc',
                                  fontSize: 14,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {item.name}
                                </span>

                                {item.is_workspace_native && (
                                  <span style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    backgroundColor: '#0284c7',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    Exported {item.export_format}
                                  </span>
                                )}

                                {item.owner_email && (
                                  <span title={`Owner: ${item.owner_name || item.owner_email}`} style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#7dd3fc',
                                    backgroundColor: '#0f172a',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    border: '1px solid #0284c7'
                                  }}>
                                    👤 {item.owner_name || item.owner_email}
                                  </span>
                                )}

                                {item.is_shared && (
                                  <span style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    backgroundColor: '#065f46',
                                    color: '#4ade80',
                                    fontWeight: 800,
                                    border: '1px solid #059669'
                                  }}>
                                    SHARED
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                                {!isFolder && item.size_bytes > 0 && (
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                                    {(item.size_bytes / (1024 * 1024)).toFixed(2)} MB
                                  </span>
                                )}

                                {!isFolder && item.storage_path && (
                                  <a
                                    href={`${API_BASE}/api/search/drive/${item.id}/download`}
                                    download
                                    title="Download local file"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      padding: '6px 14px',
                                      backgroundColor: '#0284c7',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: 6,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      textDecoration: 'none',
                                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)'
                                    }}
                                  >
                                    <Download size={14} />
                                    <span>Download</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Render children recursively if folder is expanded */}
                            {isFolder && isExpanded && hasChildren && (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {childrenMap.get(item.id)!.map(child => renderTreeItem(child, depth + 1))}
                              </div>
                            )}
                          </div>
                        );
                      };

                      return rootItems.map(item => renderTreeItem(item, 0));
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === 'settings' && (
          <div>
            <div style={{ marginBottom: 28, borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
                Application Settings
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>
                Security parameters, power management, and storage engine configuration.
              </p>
            </div>

            <div style={{ 
              backgroundColor: '#111827', 
              borderRadius: 12, 
              border: '1px solid #374151', 
              padding: 28, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 24 
            }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 17, fontWeight: 700, color: '#ffffff' }}>
                  Encryption Engine
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>
                  AES-256-GCM Envelope Encryption with Argon2id Key Derivation is ACTIVE. Data is encrypted before writing to disk.
                </p>
              </div>

              <div style={{ borderTop: '1px solid #1f2937', paddingTop: 20 }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 17, fontWeight: 700, color: '#ffffff' }}>
                  OS Keyring Credential Vault
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>
                  Windows Credential Manager / macOS Keychain is active. Long-lived refresh tokens are isolated outside application files.
                </p>
              </div>

              <div style={{ borderTop: '1px solid #1f2937', paddingTop: 20 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 17, fontWeight: 700, color: '#ffffff' }}>
                  Power & Metered Network Optimization
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#f8fafc', cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked style={{ width: 16, height: 16, accentColor: '#0284c7' }} /> 
                    <span>Pause automated backups when running on battery power (laptops)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#f8fafc', cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked style={{ width: 16, height: 16, accentColor: '#0284c7' }} /> 
                    <span>Pause automated backups on cellular / metered connections</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 1-CLICK CONNECT ACCOUNT MODAL */}
      {showConnectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: 14,
            width: 520,
            maxWidth: '90%',
            padding: 30,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#ffffff' }}>
                Sign in with Google
              </h3>
              <button 
                onClick={() => setShowConnectModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {connectError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#7f1d1d', border: '1px solid #b91c1c', borderRadius: 8, color: '#fecaca', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} />
                <span>{connectError}</span>
              </div>
            )}

            {!isAuthorizing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>
                  When you click below, your default browser will open with the Google account already signed in on your computer. You only need to click <strong>Allow</strong> once. The connection will complete automatically!
                </p>

                {/* Optional Google Client ID */}
                <div style={{ backgroundColor: '#030712', padding: 16, borderRadius: 10, border: '1px solid #1f2937' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>
                      Google OAuth Client ID:
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowGuideModal(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'none',
                        border: 'none',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: 0
                      }}
                    >
                      <HelpCircle size={14} />
                      <span>Panduan Cara Dapatkan Client ID</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Contoh: 123456789-abcdef.apps.googleusercontent.com"
                    value={customClientId}
                    onChange={e => setCustomClientId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #374151',
                      backgroundColor: '#111827',
                      color: '#ffffff',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      marginBottom: 12
                    }}
                  />

                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>
                    Google OAuth Client Secret:
                  </label>
                  <input
                    type="password"
                    placeholder="Contoh: GOCSPX-xxxxxxxxxxxxxxxx"
                    value={customClientSecret}
                    onChange={e => setCustomClientSecret(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid #374151',
                      backgroundColor: '#111827',
                      color: '#ffffff',
                      fontSize: 13,
                      boxSizing: 'border-box'
                    }}
                  />

                  <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
                    Authorized Redirect URI wajib di Google Console: <code style={{ color: '#38bdf8' }}>http://127.0.0.1:8000/api/accounts/callback</code>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                  <button
                    onClick={() => setShowConnectModal(false)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 8,
                      border: '1px solid #4b5563',
                      backgroundColor: 'transparent',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startOneClickGoogleAuth}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 24px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: 14,
                      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)'
                    }}
                  >
                    <span>Sign in with Google Browser</span>
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: '4px solid #0284c7',
                  borderTopColor: 'transparent',
                  margin: '0 auto 20px',
                  animation: 'spin 1s linear infinite'
                }} />
                <h4 style={{ margin: '0 0 8px 0', fontSize: 18, color: '#ffffff' }}>
                  Waiting for Google Authorization...
                </h4>
                <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                  Please complete the sign-in prompt in your opened browser tab. This window will close automatically as soon as you approve.
                </p>
                <button
                  onClick={() => setIsAuthorizing(false)}
                  style={{
                    marginTop: 24,
                    padding: '8px 20px',
                    borderRadius: 6,
                    border: '1px solid #4b5563',
                    backgroundColor: 'transparent',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* POP-UP PANDUAN CARA MENDAPATKAN CLIENT ID */}
      {showGuideModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          backdropFilter: 'blur(6px)'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #38bdf8',
            borderRadius: 16,
            width: 680,
            maxWidth: '92%',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.75)'
          }}>
            {/* Modal Header */}
            <div style={{ 
              padding: '20px 24px', 
              borderBottom: '1px solid #1f2937', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BookOpen size={22} color="#38bdf8" />
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Panduan Mendapatkan Google Cloud Client ID (3 Menit)
                </h3>
              </div>
              <button 
                onClick={() => setShowGuideModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
              
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ color: '#38bdf8', margin: '0 0 6px 0', fontSize: 15, fontWeight: 700 }}>
                  Langkah 1: Buka Google Cloud Console & Buat Project
                </h4>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Buka <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>console.cloud.google.com</a> dan login dengan akun Google Anda.</li>
                  <li>Di bilah atas sebelah logo Google Cloud, klik dropdown project &gt; klik <strong>NEW PROJECT</strong>.</li>
                  <li>Beri nama (contoh: <code>GWS-Backup</code>) lalu klik <strong>CREATE</strong>.</li>
                </ol>
              </div>

              <div style={{ marginBottom: 20, borderTop: '1px solid #1f2937', paddingTop: 16 }}>
                <h4 style={{ color: '#38bdf8', margin: '0 0 6px 0', fontSize: 15, fontWeight: 700 }}>
                  Langkah 2: Aktifkan API Gmail & Google Drive
                </h4>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Di kolom pencarian atas, cari <strong>Gmail API</strong> lalu klik <strong>ENABLE</strong>.</li>
                  <li>Cari lagi <strong>Google Drive API</strong> lalu klik <strong>ENABLE</strong>.</li>
                </ol>
              </div>

              <div style={{ marginBottom: 20, borderTop: '1px solid #1f2937', paddingTop: 16 }}>
                <h4 style={{ color: '#38bdf8', margin: '0 0 6px 0', fontSize: 15, fontWeight: 700 }}>
                  Langkah 3: Konfigurasi Google Auth Platform (Branding & Audience)
                </h4>
                <p style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: 13 }}>
                  <em>Tampilan Google Cloud terbaru menggunakan menu <strong>Google Auth Platform</strong>:</em>
                </p>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Buka menu kiri &gt; cari <strong>Google Auth Platform</strong> (atau cari di search bar atas).</li>
                  <li>Klik menu <strong>Branding</strong>: Masukkan App name (contoh: <code>GWS Backup</code>) dan isi email kontak Anda, lalu klik <strong>SAVE</strong>.</li>
                  <li>Klik menu <strong>Audience</strong>:
                    <ul style={{ margin: '4px 0 6px 16px', padding: 0 }}>
                      <li>Pilih User Type: <strong>External</strong>.</li>
                      <li>Pada bagian <strong>Test Users</strong>, klik <strong>+ ADD USERS</strong> dan masukkan alamat email Gmail Anda sendiri, lalu klik <strong>Save</strong>.</li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div style={{ borderTop: '1px solid #1f2937', paddingTop: 16 }}>
                <h4 style={{ color: '#38bdf8', margin: '0 0 6px 0', fontSize: 15, fontWeight: 700 }}>
                  Langkah 4: Buat Client ID di Menu "Clients"
                </h4>
                <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
                  <li>Pada panel menu kiri Google Auth Platform, klik <strong>Clients</strong>.</li>
                  <li>Di bagian atas, klik tombol <strong>+ Create client</strong>.</li>
                  <li>Pilih Application type: <strong>Web application</strong>.</li>
                  <li>Beri nama (misal: <code>GWS Backup</code>).</li>
                  <li>Pada bagian <strong>Authorized redirect URIs</strong>, klik <strong>+ ADD URI</strong> lalu salin dan tempel alamat ini:
                    <div style={{ margin: '8px 0', backgroundColor: '#030712', padding: '8px 12px', borderRadius: 6, border: '1px solid #374151', fontFamily: 'monospace', color: '#4ade80' }}>
                      http://127.0.0.1:8000/api/accounts/callback
                    </div>
                  </li>
                  <li>Klik <strong>CREATE</strong>. Google akan menampilkan jendela pop-up berisi <strong>Client ID</strong> dan <strong>Client Secret</strong>.</li>
                  <li>Salin kedua kunci tersebut dan tempelkan ke aplikasi GWS Backup!</li>
                </ol>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ 
              padding: '16px 24px', 
              borderTop: '1px solid #1f2937', 
              display: 'flex', 
              justifyContent: 'flex-end',
              backgroundColor: '#0f172a',
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16
            }}>
              <button
                onClick={() => setShowGuideModal(false)}
                style={{
                  padding: '10px 22px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EMAIL PREVIEW MODAL */}
      {viewingEmail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 24
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: 16,
            width: '100%',
            maxWidth: 900,
            height: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.8)'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #1f2937',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#0f172a',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mail size={20} color="#38bdf8" />
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Email Viewer
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <a
                  href={`${API_BASE}/api/search/gmail/${viewingEmail.id}/raw`}
                  download
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  <Download size={14} />
                  <span>Download .eml</span>
                </a>
                <button
                  onClick={() => setViewingEmail(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Email Meta Info */}
            <div style={{ padding: '16px 24px', backgroundColor: '#0b1120', borderBottom: '1px solid #1f2937' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px 0', color: '#ffffff' }}>
                {viewingEmail.subject || '(No Subject)'}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 13, color: '#cbd5e1' }}>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>From:</span>
                <span style={{ color: '#ffffff' }}>{viewingEmail.sender}</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>To:</span>
                <span style={{ color: '#ffffff' }}>{viewingEmail.recipients}</span>
                {viewingEmail.date && (
                  <>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>Date:</span>
                    <span style={{ color: '#93c5fd' }}>{new Date(viewingEmail.date).toLocaleString()}</span>
                  </>
                )}
                {viewingEmail.attachments && viewingEmail.attachments.length > 0 && (
                  <>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>Attachments:</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {viewingEmail.attachments.map((att: any, idx: number) => (
                        <span key={idx} style={{
                          backgroundColor: '#1f2937',
                          padding: '3px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#38bdf8',
                          border: '1px solid #374151',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}>
                          <Paperclip size={13} color="#38bdf8" />
                          <span>{att.filename} ({(att.size / 1024).toFixed(1)} KB)</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Email Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, backgroundColor: '#ffffff', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
              {viewingEmail.body_html ? (
                <iframe
                  title="email-content"
                  srcDoc={viewingEmail.body_html}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 450,
                    border: 'none',
                    backgroundColor: '#ffffff'
                  }}
                />
              ) : viewingEmail.body_text ? (
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#1f2937',
                  margin: 0
                }}>
                  {viewingEmail.body_text}
                </pre>
              ) : (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  (This email contains no text or HTML body)
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
