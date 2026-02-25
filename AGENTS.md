# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Korean crop pest & disease prediction map (농작물 병해충 예측지도). Static HTML/CSS/JS frontend + PHP/MariaDB backend. No package manager, no build step, no test framework. Libraries (OpenLayers 9.x, Chart.js 4.x) loaded via CDN.

### Running the development server
```bash
# Start MariaDB (if not running)
sudo mysqld_safe &
sleep 3
# Create Synology-compatible socket symlink
sudo ln -sf /run/mysqld/mysqld.sock /run/mysqld/mysqld10.sock
# Initialize DB (idempotent)
DB_PASS="<your-password>" php /workspace/api/init_db.php
# Start PHP dev server (with DB_PASS for backend)
DB_PASS="<your-password>" php -S 0.0.0.0:8080 -t /workspace
```
App accessible at `http://localhost:8080/index.html`.

### Key caveats
- **API keys removed**: VWorld and NCPMS API keys are no longer hardcoded. Users must enter keys via the Settings modal (gear icon, top-right). Keys are saved to `localStorage`. The app generates simulation data when API keys are absent.
- **Socket path**: Code hardcodes `/run/mysqld/mysqld10.sock` (Synology convention). Standard Linux uses `/run/mysqld/mysqld.sock`. Create a symlink — do **not** modify `api/config.php`.
- **DB password via env var**: `api/config.php` reads `DB_PASS` from environment. Pass it when starting the PHP server.
- **Degraded mode**: Frontend works without PHP/MariaDB — falls back to `localStorage` for settings and simulation data for predictions.
- **No linting/testing**: No ESLint, no test framework, no CI. Validate through manual browser testing.
- **GitHub Pages**: Deployed at `https://seongukh.github.io/webWeather/`. The workflow (`.github/workflows/deploy.yml`) auto-deploys on `main` push. PHP backend does not run on GitHub Pages; frontend fallbacks handle this gracefully.
