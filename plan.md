# Master Development Prompt — Google Workspace Backup

## 1. Your Role

Act as a senior software architect, Python backend engineer, React/TypeScript frontend engineer, desktop application engineer, security engineer, and QA engineer.

Your task is to design, implement, test, document, and prepare a production-ready cross-platform desktop application named **Google Workspace Backup**.

You are responsible for the complete application, not merely a prototype or UI mockup.

Follow the technical architecture and requirements in this document. Make reasonable engineering decisions where details are not explicitly specified, but document those decisions.

Do not skip implementation stages or replace working functionality with mock data.

---

# 2. Product Objective

Build a desktop application that allows users to back up multiple Google accounts, especially:

1. Gmail.
2. Google Drive.

The application must preserve backed-up data independently from Google.

If a user deletes an email from Gmail or a file from Google Drive, the corresponding backup must remain available until the user explicitly deletes it from backup storage.

The application must support:

- Initial backup.
- Incremental backup.
- Automatic scheduling.
- Multiple Google accounts.
- Encrypted backup.
- Search and browsing.
- Restore.
- Backup integrity verification.
- Local and remote storage.
- Background execution.
- Cross-platform installation and updates.

Target operating systems:

- Windows 10/11.
- Linux distributions, prioritizing Ubuntu LTS.
- macOS.

The application must be suitable for personal use and commercial distribution.

---

# 3. Mandatory Technology Stack

Use the following architecture.

## Desktop

- Tauri 2.
- React.
- TypeScript.
- Vite.
- Accessible and responsive UI components.

## Backend

- Python.
- FastAPI.
- Pydantic.
- SQLAlchemy or SQLModel.
- Alembic.

## Database

- SQLite.
- WAL mode.
- Database migrations.
- Transaction-based metadata updates.

## Background Processing

- Python asyncio.
- Local worker manager.
- Local persistent job queue/checkpoint mechanism.

Do not make Redis or Celery mandatory.

## Storage

- Local filesystem.
- External drive.
- NAS/network storage.
- S3-compatible object storage.

## Security

- AES-256-GCM.
- Envelope encryption.
- SHA-256.
- OS credential/keychain storage.
- Secure OAuth token handling.

The user must not need to install Python, Node.js, Docker, Redis, or PostgreSQL separately.

The application installer must package or provision the necessary runtime components.

---

# 4. Architecture Requirements

Build the application as a modular desktop system.

Required modules:

```text
desktop/
  src/
    components/
    pages/
    layouts/
    hooks/
    services/
    stores/
    types/

src-tauri/
  src/
    commands/
    tray/
    notifications/
    process/
    security/

backend/
  app/
    api/
    core/
    models/
    schemas/
    services/
    repositories/
    workers/
    scheduler/
    connectors/
      google/
        gmail/
        drive/
    storage/
    encryption/
    restore/
    licensing/
    diagnostics/

  migrations/
  tests/

installer/
docs/
scripts/
```

You may adjust the directory structure if there is a clear engineering reason. Document the final structure.

## 4.1 Backend Process

The Python backend must run as a local process managed by Tauri.

Implement:
- Backend startup.
- Health checks.
- Process supervision.
- Graceful shutdown.
- Crash detection.
- Controlled restart.
- Single-instance protection.
- Local API authentication.

The backend must not expose an unauthenticated API to the LAN or public internet.

Use loopback binding and an authenticated local session mechanism.

## 4.2 Frontend and Backend Communication

Use a clearly defined API contract.

Implement:
- Request validation.
- Response schemas.
- Error response standardization.
- Authentication/session validation.
- Job progress events.
- Health status.
- API versioning.

Use a secure mechanism for communicating between the Tauri application and the local backend.

Do not place long-lived secrets in browser local storage.

## 4.3 Database

Create migrations and models for:

- Accounts.
- Backup profiles.
- Backup jobs.
- Job items.
- Gmail messages.
- Gmail labels.
- Gmail attachments.
- Drive files.
- Drive permissions.
- Drive versions.
- Storage locations.
- Backup objects.
- Backup manifests.
- Sync checkpoints.
- Schedules.
- Restore jobs.
- Audit logs.
- Application settings.
- License state.

OAuth tokens and encryption keys must not be stored as plaintext in SQLite.

---

# 5. Google OAuth and Account Management

Implement Google OAuth 2.0 for desktop applications.

Requirements:

1. Use the system browser for authentication.
2. Use the appropriate installed-app authorization flow.
3. Implement PKCE where supported by the selected flow.
4. Implement state validation.
5. Use a secure loopback redirect approach.
6. Validate callback requests.
7. Handle authorization failures.
8. Handle refresh token failures.
9. Store refresh tokens using OS secure credential storage.
10. Support account disconnection without deleting existing backup data.

Never embed a Google OAuth client secret in the desktop application as if it were confidential.

Document the OAuth client configuration required by the developer and end users.

Use least-privilege scopes.

Request only the permissions necessary for the enabled backup features.

Provide a permission explanation screen.

Support multiple Google accounts in one application installation.

Each account must have an independent backup profile and status.

## 5.1 Credential Abstraction

Implement an abstraction for secure credential storage.

Provide platform implementations for:

- Windows.
- macOS.
- Linux.

If the secure credential backend is unavailable, show an explicit warning and require an informed user decision before using any alternative.

Never silently save credentials in plaintext.

## 5.2 Google Workspace Admin Support

Keep administrator-level backup separate from ordinary user OAuth.

Design an extensible module for:
- Domain-Wide Delegation.
- Service account configuration.
- Administrator authorization.
- User impersonation.
- Audit logging.

Do not require this feature for the first MVP unless explicitly enabled.

Never ship a shared service account private key in the application.

---

# 6. Gmail Backup Engine

Implement a complete Gmail backup module.

## 6.1 Initial Backup

The engine must:

1. Verify account authentication.
2. Validate required Gmail scopes.
3. Retrieve messages using pagination.
4. Handle large mailboxes.
5. Retrieve full message content.
6. Preserve MIME structure where possible.
7. Preserve headers.
8. Preserve attachments.
9. Preserve message IDs.
10. Preserve thread IDs.
11. Preserve labels.
12. Save EML archives.
13. Save additional metadata.
14. Calculate SHA-256.
15. Commit metadata only after durable storage succeeds.
16. Save synchronization checkpoints.

## 6.2 Storage Format

Use EML as the primary email archive format.

Use JSON sidecar metadata where needed.

Example:

```text
accounts/
  account-id/
    gmail/
      messages/
      metadata/
      attachments/
      manifests/
      checkpoints/
```

Use stable Google message IDs to identify messages.

Do not use subject or sender as a unique identifier.

## 6.3 Incremental Backup

Implement Gmail History API synchronization.

Requirements:
- Persist the last successful history ID.
- Process history changes with pagination.
- Handle new messages.
- Handle changed labels.
- Handle deleted messages where detectable.
- Handle invalid or expired history IDs.
- Recover using reconciliation scans.
- Prevent duplicate archives.
- Commit checkpoints only after successful processing.

Do not advance the history checkpoint before the corresponding changes have been safely processed.

## 6.4 Deletion Handling

Source deletion must never trigger backup deletion.

When a message is deleted from Gmail:
- Retain its backup object.
- Update source status if detectable.
- Preserve metadata.
- Display deletion status in the UI.
- Do not purge automatically.

## 6.5 Gmail Search

Implement:
- Sender search.
- Recipient search.
- Subject search.
- Date range.
- Label search.
- Message content search if indexing is enabled.

Search must operate against backed-up data.

## 6.6 Gmail Restore

Implement:
- Single-message restore.
- Bulk restore.
- Restore to original account.
- Restore to another authorized account.
- Attachment recovery.
- Duplicate detection.
- Restore report.

Never send restored email to original recipients automatically.

Restore must prioritize creating/recovering mailbox content, not sending outgoing messages.

Document Gmail API limitations regarding labels, thread associations, and message restoration.

---

# 7. Google Drive Backup Engine

Implement a complete Google Drive backup module.

## 7.1 Initial Backup

The engine must:
1. Retrieve files and folders.
2. Handle pagination.
3. Preserve file IDs.
4. Preserve folder relationships.
5. Preserve file names.
6. Preserve MIME types.
7. Preserve timestamps.
8. Preserve owners when available.
9. Preserve permissions when available.
10. Download binary file content.
11. Export Google Workspace native documents.
12. Calculate checksums.
13. Store metadata.
14. Save checkpoints.

## 7.2 Folder Structure

Maintain original folder relationships using Google Drive file IDs.

Do not rely only on folder names.

The system must handle:
- Duplicate folder names.
- Renamed folders.
- Moved files.
- Nested folders.
- Shared drives where supported.
- Files without ordinary parent folder relationships.

## 7.3 Google Workspace Native Files

Implement export support for:
- Google Docs.
- Google Sheets.
- Google Slides.

Provide configurable export formats where supported.

For example:
- Docs: DOCX and/or PDF.
- Sheets: XLSX and/or CSV.
- Slides: PPTX and/or PDF.

Save:
- Original MIME type.
- Export MIME type.
- Export timestamp.
- Source file ID.
- Version or revision metadata available through the API.

Do not claim export is identical to native Google Workspace content.

## 7.4 Incremental Synchronization

Implement Google Drive Changes API.

Requirements:
- Save start page token.
- Retrieve changes with pagination.
- Detect new files.
- Detect updates.
- Detect deletions.
- Detect moves where available.
- Preserve historical backup versions.
- Handle expired or invalid tokens.
- Support full reconciliation.

Only commit the new page token after the relevant changes have been safely processed.

## 7.5 Versioning

When content changes:
- Preserve the previous backup object.
- Create a new version entry.
- Store checksum.
- Store modification timestamp.
- Maintain a reference between versions.
- Support restore of earlier backed-up versions.

Do not assume every historical revision can be retrieved from Google Drive.

Document revision and export limitations.

## 7.6 Permissions

Capture available permission metadata.

Store:
- Permission ID.
- Type.
- Role.
- Email address when available.
- Domain when available.
- Inherited details when exposed by the API.
- Snapshot timestamp.

Do not claim that all Drive permissions can be restored identically.

## 7.7 Deletion Handling

When a file is deleted from Drive:
- Keep the backup object.
- Keep metadata.
- Mark source deletion status.
- Preserve earlier versions.
- Do not automatically purge the backup.

---

# 8. Storage Engine

Implement a provider-based storage architecture.

Required interface:

```python
class StorageProvider:
    async def write(self, key, stream):
        ...

    async def read(self, key):
        ...

    async def exists(self, key):
        ...

    async def delete(self, key):
        ...

    async def list(self, prefix):
        ...

    async def get_metadata(self, key):
        ...
```

Implement:
- Local filesystem provider.
- External/network storage provider.
- S3-compatible provider.

Storage operations must support:
- Temporary writes.
- Atomic commit where available.
- Checksum validation.
- Retry.
- Cancellation.
- Error reporting.

Handle missing external drives and unavailable NAS locations safely.

Never report a backup as successful if the content was not durably written.

## 8.1 Backup Manifest

Generate manifests for backup batches.

Manifest must include:
- Account identifier.
- Service.
- Backup ID.
- Backup timestamp.
- Object identifiers.
- Object paths.
- Sizes.
- Checksums.
- Encryption metadata.
- Schema version.

Manifest integrity must be verifiable independently from SQLite.

## 8.2 Deduplication

Use content checksums to identify identical content.

Deduplication must:
- Preserve logical references.
- Preserve independent restore capability.
- Avoid unsafe deletion.
- Handle interrupted transactions.
- Support manifest reconciliation.

---

# 9. Encryption

Implement AES-256-GCM encryption for backup content.

Use envelope encryption.

Requirements:
- Secure key generation.
- Unique nonce per encryption operation.
- Authenticated encryption.
- Encrypted data key storage.
- Key versioning.
- Recovery key support.
- Password-based key derivation using an appropriate strong KDF such as Argon2id.
- Secure handling of keys in memory as far as practical.
- Encryption metadata in manifests.

Do not implement custom cryptographic algorithms.

Use well-maintained cryptographic libraries.

Provide:
- Enable encryption during initial setup.
- Encryption settings.
- Recovery key generation.
- Recovery key export.
- Encryption verification.
- Clear warning when recovery credentials are lost.

The user must be able to understand that loss of the required encryption key can make backup data unrecoverable.

---

# 10. Local Worker and Scheduler

Implement a persistent local job manager.

Required job states:

- pending.
- queued.
- running.
- paused.
- retrying.
- completed.
- failed.
- cancelled.

Requirements:
- Concurrency limits.
- Retry with exponential backoff and jitter.
- Job cancellation.
- Job pause/resume.
- Persistent checkpoints.
- Idempotent processing.
- Resource limits.
- Graceful shutdown.
- Resume after restart.

Implement schedules:
- Every 5 minutes.
- Every 15 minutes.
- Every 30 minutes.
- Hourly.
- Daily.
- Custom interval.

Do not start duplicate jobs for the same account and backup profile unless explicitly allowed.

If the computer is shut down or sleeping, the scheduler must resume missed work safely when execution becomes possible again.

Do not promise execution while the computer is off.

---

# 11. Desktop UI

Build a polished, professional desktop application.

The interface must be consistent across Windows, Linux, and macOS.

## 11.1 Main Pages

1. Dashboard.
2. Accounts.
3. Gmail Backup.
4. Drive Backup.
5. Backup Jobs.
6. Search & Browse.
7. Restore.
8. Storage.
9. Scheduler.
10. Settings.
11. Logs & Diagnostics.
12. License & About.

## 11.2 Dashboard

Display:
- Connected accounts.
- Gmail messages backed up.
- Drive files backed up.
- Total backup size.
- Current jobs.
- Last successful backup.
- Next scheduled backup.
- Failed jobs.
- Storage usage.
- Authentication warnings.

## 11.3 Account Management

Users must be able to:
- Add accounts.
- Reauthenticate accounts.
- Pause backups.
- Resume backups.
- Configure Gmail backup.
- Configure Drive backup.
- Disconnect accounts.
- View account backup history.

Disconnecting an account must not delete existing backup data.

## 11.4 Job Monitoring

Show:
- Job name.
- Account.
- Service.
- Status.
- Progress.
- Items processed.
- Total items if known.
- Bytes processed.
- Start time.
- Duration.
- Retry count.
- Error details.

Progress reporting must be based on actual processed work, not fabricated percentages.

## 11.5 Storage Management

Users must be able to:
- Select backup destination.
- Change destination.
- Add storage providers.
- Test storage connection.
- View storage utilization.
- Verify backup integrity.
- Export manifests.
- View storage errors.

Changing a storage location must not silently orphan existing backup data.

## 11.6 Search and Restore

Build a usable search and restore workflow.

Users must be able to preview archived emails and files before restoring them.

Provide conflict handling and clear confirmation before destructive restore actions.

---

# 12. System Tray and Background Mode

Implement platform-appropriate background behavior.

Features:
- Minimize to tray.
- Continue backup in background.
- Show status notifications.
- Show job errors.
- Open dashboard from tray.
- Pause/resume all jobs.
- Quit application safely.

Autostart must be optional.

Provide an explicit setting for whether closing the main window:
- Exits the application.
- Minimizes to system tray.

Respect platform limitations and permissions.

Do not silently install a privileged system service.

If a persistent service is required for a future feature, obtain explicit user consent and provide uninstall instructions.

---

# 13. Licensing and Commercial Readiness

Create a licensing module that is independent from backup logic.

Support architecture for:
- Trial.
- Personal.
- Professional.
- Business.
- Device activation.
- License renewal.
- License deactivation.
- Offline grace period.

Do not implement a hard dependency that makes users lose access to existing backups when the license server is temporarily unavailable.

License verification must not transmit backup content or OAuth credentials.

Keep license-server integration configurable.

If the license service is not yet available, provide a clearly documented development/mock mode that cannot be mistaken for production activation.

---

# 14. Privacy and Security

Security is a mandatory product requirement.

Implement:
- No plaintext token storage.
- No plaintext encryption keys in database.
- No credential logging.
- No email content logging.
- No file content logging.
- Secure local API.
- Input validation.
- Path traversal protection.
- Safe file handling.
- Dependency vulnerability checks.
- Database access controls.
- Secure update verification.

Telemetry:
- Opt-in where practical.
- No backup content.
- No OAuth tokens.
- No sensitive metadata.
- Clear privacy settings.

Provide a privacy policy and data handling documentation.

---

# 15. Error Handling

Standardize error codes for:

- OAuth errors.
- Google API quota errors.
- Rate limits.
- Network errors.
- Storage errors.
- Disk full.
- Encryption errors.
- Database errors.
- Invalid checkpoints.
- Restore failures.
- License errors.

Retry only when safe.

Do not retry permanent permission errors indefinitely.

Provide actionable user messages and detailed sanitized diagnostics.

---

# 16. Testing Requirements

Create automated tests.

## Unit Tests

Test:
- OAuth state validation.
- Credential storage abstraction.
- Gmail parsing.
- Drive metadata parsing.
- Encryption and decryption.
- Checkpoint management.
- Retry logic.
- Storage providers.
- Manifest generation.
- Restore operations.

## Integration Tests

Test:
- Google API integration.
- SQLite.
- Filesystem.
- NAS.
- S3-compatible storage.
- OS secure storage.
- Backend and Tauri communication.

Use mocked API responses for repeatable tests.

Never use real user data in automated test fixtures.

## Cross-platform Tests

Run tests on:
- Windows.
- Ubuntu/Linux.
- macOS.

Verify:
- Application startup.
- Backend startup.
- Authentication callback.
- System tray.
- Notifications.
- Autostart.
- File dialogs.
- Secure credential storage.
- Installer.
- Upgrade.
- Uninstall.
- Background mode.
- Path handling.

## Failure Tests

Simulate:
- Internet interruption.
- API quota exceeded.
- Invalid OAuth token.
- External storage removed.
- Disk full.
- Application crash.
- Database lock.
- Interrupted download.
- Interrupted encryption.
- Interrupted restore.
- Computer restart.

Verify that no previously committed backup data is lost.

---

# 17. Installer and Release Engineering

Build platform-specific installers.

Windows:
- MSI or NSIS.
- Code signing.
- Upgrade support.
- Uninstall support.

Linux:
- AppImage.
- DEB.
- Optional RPM.
- Desktop entry.
- Appropriate dependency checks.

macOS:
- DMG.
- PKG if required.
- Code signing.
- Notarization.

The installer must:
- Package required application runtimes.
- Avoid requiring Python or Node.js installation.
- Create application directories safely.
- Preserve backup directories during upgrades.
- Never delete user backup data during uninstall.
- Provide clean shutdown behavior.

Build an update system with signed or verified release artifacts.

---

# 18. Development Workflow

Follow this sequence.

## Stage 1: Repository and Architecture

- Create project structure.
- Set up Tauri.
- Set up React and TypeScript.
- Set up Python backend.
- Set up FastAPI.
- Set up SQLite.
- Set up migrations.
- Implement backend process management.
- Implement local API authentication.

Deliver a working desktop shell and backend connection.

## Stage 2: Account Authentication

- Configure Google OAuth.
- Implement browser login.
- Implement callback.
- Implement secure credential storage.
- Implement multiple accounts.
- Build account UI.

Deliver working account connection.

## Stage 3: Gmail

- Implement Gmail connector.
- Implement initial backup.
- Implement EML storage.
- Implement attachment storage.
- Implement metadata.
- Implement incremental backup.
- Implement checkpoint recovery.
- Implement deletion preservation.

Deliver a complete Gmail backup workflow.

## Stage 4: Google Drive

- Implement Drive connector.
- Implement folder traversal.
- Implement file download.
- Implement native Google file export.
- Implement metadata.
- Implement permissions snapshot.
- Implement incremental backup.
- Implement version preservation.
- Implement deletion preservation.

Deliver a complete Drive backup workflow.

## Stage 5: Storage and Encryption

- Implement storage abstraction.
- Implement local storage.
- Implement external/network storage.
- Implement S3.
- Implement AES-256-GCM.
- Implement key management.
- Implement manifests.
- Implement checksum verification.

Deliver secure backup storage.

## Stage 6: Scheduler and Background

- Implement local job manager.
- Implement scheduling.
- Implement tray.
- Implement notifications.
- Implement autostart.
- Implement restart recovery.
- Implement concurrency and resource controls.

Deliver unattended backup.

## Stage 7: Search and Restore

- Implement Gmail search.
- Implement Drive search.
- Implement preview.
- Implement restore.
- Implement conflict handling.
- Implement restore reports.

Deliver a complete user workflow.

## Stage 8: Commercial Release

- Implement licensing integration.
- Implement installers.
- Implement code signing configuration.
- Implement update mechanism.
- Implement diagnostics.
- Complete security tests.
- Complete cross-platform tests.
- Write documentation.

Deliver release candidate.

---

# 19. Coding Standards

Follow these requirements:

1. Use modular architecture.
2. Use type hints in Python.
3. Use strict TypeScript where practical.
4. Use dependency injection for external services.
5. Separate business logic from API handlers.
6. Separate storage logic from backup connectors.
7. Use structured logging.
8. Use database migrations.
9. Use consistent naming conventions.
10. Avoid giant files and monolithic modules.
11. Write tests for critical logic.
12. Document public interfaces.
13. Do not hardcode secrets.
14. Do not commit real credentials.
15. Do not use fake production data.
16. Do not claim an integration works unless it has been tested.
17. Keep platform-specific code isolated behind abstractions.

---

# 20. Required Documentation

Create and maintain:

- README.md.
- ARCHITECTURE.md.
- DEVELOPMENT.md.
- INSTALLATION.md.
- BUILD_AND_RELEASE.md.
- GOOGLE_OAUTH_SETUP.md.
- GMAIL_BACKUP.md.
- DRIVE_BACKUP.md.
- STORAGE.md.
- ENCRYPTION_AND_RECOVERY.md.
- SECURITY.md.
- PRIVACY.md.
- TROUBLESHOOTING.md.
- TESTING.md.
- CHANGELOG.md.

Include diagrams where they improve understanding.

---

# 21. Important Functional Rules

These rules must never be violated:

1. Source deletion must never automatically delete backup data.
2. Backup completion must mean the data is durably stored and verified.
3. Checkpoints must not advance before corresponding data is safely processed.
4. Repeated jobs must not create uncontrolled duplicates.
5. OAuth tokens must never be logged.
6. Encryption keys must never be stored as plaintext in SQLite.
7. Restore must not send emails to original recipients automatically.
8. Uninstall must never delete user backup directories by default.
9. Storage failure must not be reported as successful backup.
10. Unsupported Google API features must be documented honestly.
11. No mock implementation may be presented as a completed production feature.
12. No automatic destructive retention action may occur without an explicit user-configured policy.

---

# 22. Definition of Done

The application is complete only when:

- The desktop application runs on Windows, Linux, and macOS.
- Users can connect multiple Google accounts.
- Credentials are stored securely.
- Gmail initial backup works.
- Gmail incremental backup works.
- Drive initial backup works.
- Drive incremental backup works.
- Google Workspace native file exports work for supported formats.
- Deleted source content remains in backup.
- Backup jobs survive application restarts.
- Storage providers work.
- Encryption and recovery work.
- Integrity verification works.
- Search works.
- Restore works.
- Background mode works within OS limitations.
- Installer and upgrade work.
- Uninstall preserves user data.
- Automated tests pass.
- Documentation is complete.
- No critical security issue remains unresolved.

---

# 23. Instructions for the Coding Agent

Before writing implementation code:

1. Inspect the repository.
2. Identify existing code and constraints.
3. Read the product plan.
4. Create an implementation roadmap.
5. Identify external dependencies.
6. Identify OAuth configuration requirements.
7. Identify platform-specific risks.
8. Define the database schema.
9. Define API contracts.
10. Define backup object and manifest formats.

Then implement the project stage by stage.

After each stage:
- Run tests.
- Fix failures.
- Update documentation.
- Record completed functionality.
- Record known limitations.
- Do not proceed with a broken foundation.

Do not stop after creating the project scaffold or UI.

Do not substitute a static demonstration for actual Gmail and Drive backup.

When Google API credentials or external configuration are unavailable, implement the real integration behind a configurable interface, provide setup documentation, and use mocks only for automated testing.

Maintain a clear distinction between:
- Implemented.
- Tested.
- Requires external configuration.
- Not yet implemented.
- Known limitation.

The final objective is a reliable, secure, maintainable, cross-platform desktop backup product suitable for real users and commercial distribution.
