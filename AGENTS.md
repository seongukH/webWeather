# AGENTS.md

## Cursor Cloud specific instructions

### Overview
This is a **Korean crop pest & disease prediction map** (농작물 병해충 예측지도) — a static HTML/CSS/JS frontend with a PHP + MariaDB backend. There is no package manager, no build step, and no test framework. All JS libraries (OpenLayers 9.x, Chart.js 4.x) are loaded via CDN.

### Running the development server
```bash
# Start MariaDB
sudo mysqld_safe &
# Create socket symlink (Synology compatibility)
sudo ln -sf /run/mysqld/mysqld.sock /run/mysqld/mysqld10.sock
# Initialize DB (idempotent, safe to re-run)
php /workspace/api/init_db.php
# Start PHP built-in dev server
php -S 0.0.0.0:8080 -t /workspace
```
The app is accessible at `http://localhost:8080/index.html`.

### Key caveats
- **Socket path**: The codebase hardcodes `/run/mysqld/mysqld10.sock` (Synology NAS convention). In standard Linux, the socket is at `/run/mysqld/mysqld.sock`. A symlink bridges the gap — do **not** modify `api/config.php`.
- **DB credentials**: Hardcoded in `api/config.php` as `root` / `Tjddnr01130!`. Set the MariaDB root password to match.
- **Degraded mode**: The frontend works without PHP/MariaDB — it falls back to `localStorage` for settings and generates simulation data for predictions.
- **No linting/testing**: There is no ESLint config, no test framework, and no CI pipeline. Validation is done through manual browser testing.
- **External APIs**: VWorld and NCPMS API keys are hardcoded with defaults. The app works with simulation data when APIs are unreachable.
